import prisma from '../../lib/prisma';
import { WindowService } from './windowService';
import { WaBotService } from './botService';
import { isOptOutMessage } from '../../utils/optOut';

// ─── Deduplication (in-memory Set with 5-min TTL) ────────────────────────────

const recentMessages = new Set<string>();
const DEDUP_TTL = 5 * 60 * 1000;

function isDuplicate(id: string): boolean {
  if (recentMessages.has(id)) return true;
  recentMessages.add(id);
  setTimeout(() => recentMessages.delete(id), DEDUP_TTL);
  return false;
}

// ─── Text extraction from different message types ────────────────────────────

function extractContent(msg: any): { text: string | null; mediaId: string | null; type: string } {
  const type: string = msg.type || 'unknown';
  let text: string | null = null;
  let mediaId: string | null = null;

  switch (type) {
    case 'text':
      text = msg.text?.body || null;
      break;
    case 'image':
      text = msg.image?.caption || null;
      mediaId = msg.image?.id || null;
      break;
    case 'video':
      text = msg.video?.caption || null;
      mediaId = msg.video?.id || null;
      break;
    case 'audio':
      mediaId = msg.audio?.id || null;
      break;
    case 'document':
      text = msg.document?.caption || null;
      mediaId = msg.document?.id || null;
      break;
    case 'sticker':
      mediaId = msg.sticker?.id || null;
      break;
    case 'reaction':
      text = msg.reaction?.emoji || null;
      break;
    case 'interactive':
      text = msg.interactive?.button_reply?.title
        || msg.interactive?.list_reply?.title
        || null;
      break;
    case 'button':
      text = msg.button?.text || null;
      break;
    case 'location':
      text = `${msg.location?.latitude}, ${msg.location?.longitude}`;
      break;
    default:
      text = `[${type}]`;
  }

  return { text, mediaId, type };
}

/** Map webhook message type to WaMessageType enum */
function mapMessageType(type: string): string {
  const typeMap: Record<string, string> = {
    text: 'TEXT',
    image: 'IMAGE',
    video: 'VIDEO',
    audio: 'AUDIO',
    document: 'DOCUMENT',
    sticker: 'STICKER',
    location: 'LOCATION',
    reaction: 'REACTION',
    interactive: 'INTERACTIVE_BUTTONS',
    button: 'INTERACTIVE_BUTTONS',
  };
  return typeMap[type] || 'UNKNOWN';
}

// ─── Router ──────────────────────────────────────────────────────────────────

export class WaMessageRouter {
  /**
   * Process inbound messages from Meta webhook payload.
   * Expects `change.value` object (with messages[], contacts[], metadata).
   */
  static async handleInbound(value: any): Promise<void> {
      const contactInfo = value.contacts?.[0];
      const pushName = contactInfo?.profile?.name || null;

      const messages = value.messages || [];
      for (const msg of messages) {
        const messageId = msg.id;

        // 1. Dedup check
        if (isDuplicate(messageId)) continue;

        try {
          const from = msg.from; // phone number
          const timestamp = msg.timestamp;
          const inboundAt = new Date(parseInt(timestamp) * 1000);

          const { text, mediaId, type } = extractContent(msg);
          const waMessageType = mapMessageType(type);

          // 2. Find or create WaConversation by phone
          let conversation = await prisma.waConversation.findUnique({
            where: { phone: from },
          });

          if (!conversation) {
            // 3. Try to link to existing Contact by phone (with normalization)
            // WhatsApp sends without the extra 9 digit for some BR numbers
            // Contact DB may have 5551981375218, WhatsApp sends 555181375218
            const phoneVariations = [from];
            // If BR number (55) and has 12 digits (55+DDD+8digits), try adding 9 after DDD
            if (from.startsWith('55') && from.length === 12) {
              const ddd = from.substring(2, 4);
              const number = from.substring(4);
              phoneVariations.push(`55${ddd}9${number}`);
            }
            // If BR number with 13 digits (55+DDD+9+8digits), try without the 9
            if (from.startsWith('55') && from.length === 13) {
              const ddd = from.substring(2, 4);
              const number = from.substring(5); // skip the 9
              phoneVariations.push(`55${ddd}${number}`);
            }

            const contact = await prisma.contact.findFirst({
              where: { phone: { in: phoneVariations } },
              select: { id: true },
            });

            conversation = await prisma.waConversation.create({
              data: {
                phone: from,
                pushName,
                status: 'WA_OPEN',
                contactId: contact?.id || null,
              },
            });
          } else {
            // Update pushName if changed, and try to link contact if missing
            const updates: Record<string, any> = {};
            if (pushName && pushName !== conversation.pushName) {
              updates.pushName = pushName;
            }
            if (!conversation.contactId) {
              const phoneVariations = [from];
              if (from.startsWith('55') && from.length === 12) {
                phoneVariations.push(`55${from.substring(2, 4)}9${from.substring(4)}`);
              }
              if (from.startsWith('55') && from.length === 13) {
                phoneVariations.push(`55${from.substring(2, 4)}${from.substring(5)}`);
              }
              const contact = await prisma.contact.findFirst({
                where: { phone: { in: phoneVariations } },
                select: { id: true },
              });
              if (contact) updates.contactId = contact.id;
            }
            if (Object.keys(updates).length > 0) {
              await prisma.waConversation.update({
                where: { id: conversation.id },
                data: updates,
              });
              if (updates.contactId) conversation.contactId = updates.contactId;
            }
          }

          // 4. Save WaMessage (INBOUND, WA_CLIENT)
          let interactiveData: any = null;
          if (type === 'interactive') {
            interactiveData = msg.interactive?.button_reply || msg.interactive?.list_reply || null;
          }

          await prisma.waMessage.create({
            data: {
              waMessageId: messageId,
              direction: 'INBOUND',
              senderType: 'WA_CLIENT',
              type: waMessageType as any,
              body: text,
              mediaId: mediaId || null,
              interactiveData,
              replyToMessageId: msg.context?.id || null,
              status: 'WA_DELIVERED',
              deliveredAt: inboundAt,
              metadata: msg as any,
              conversationId: conversation.id,
            },
          });

          // 5. Open 24h window via WindowService
          await WindowService.openWindow(conversation.id, inboundAt);

          // 5b. Mark responded in followUpState (reset cold contact counter)
          await prisma.waFollowUpState.updateMany({
            where: { conversationId: conversation.id },
            data: { respondedSinceLastBot: true },
          });

          // 6. Update conversation timestamps
          await prisma.waConversation.update({
            where: { id: conversation.id },
            data: {
              lastMessageAt: inboundAt,
              lastClientMessageAt: inboundAt,
              // Reopen conversation if it was closed
              ...(conversation.status !== 'WA_OPEN' ? { status: 'WA_OPEN' } : {}),
            },
          });

          // 7. Check opt-out keywords
          if (text && isOptOutMessage(text)) {
            console.log(`[WaMessageRouter] Opt-out detectado de ${from}: "${text}"`);
            await prisma.waConversation.update({
              where: { id: conversation.id },
              data: {
                optedOut: true,
                optedOutAt: new Date(),
                status: 'WA_CLOSED',
              },
            });
            continue; // Skip bot processing for opt-out
          }

          // 8. If not opt-out and conversation is active, trigger bot
          if (conversation.isActive && !conversation.optedOut && !conversation.needsHumanAttention) {
            WaBotService.handleMessage(conversation.id, from, text || '', pushName || '').catch(err =>
              console.error(`[WaMessageRouter] Erro no bot para ${from}:`, err)
            );
          }

          console.log(`[WaMessageRouter] Inbound ${from} (${pushName || '?'}): ${text || `[${type}]`}`);
        } catch (err: any) {
          // Unique constraint = duplicate that slipped past in-memory dedup
          if (err.code === 'P2002') continue;
          console.error(`[WaMessageRouter] Erro ao processar mensagem ${messageId}:`, err);
        }
      }
  }

  /**
   * Process phone number quality updates from Meta webhook.
   * Automatically pauses sends when quality drops to RED.
   */
  static async handleQualityUpdate(value: any): Promise<void> {
    try {
      const currentLimit = value.current_limit;
      const event = value.event; // e.g. "FLAGGED", "RESTRICTED"
      // Derive quality from event: FLAGGED = YELLOW, RESTRICTED = RED
      let quality = 'GREEN';
      if (event === 'FLAGGED') quality = 'YELLOW';
      if (event === 'RESTRICTED') quality = 'RED';

      console.warn(`[WaMessageRouter] Quality update: event=${event}, limit=${currentLimit}, quality=${quality}`);

      await prisma.cloudWaConfig.updateMany({
        data: {
          qualityRating: quality,
          ...(event === 'RESTRICTED' ? { phoneStatus: 'RESTRICTED' } : {}),
          ...(event === 'FLAGGED' ? { phoneStatus: 'FLAGGED' } : {}),
        },
      });

      if (quality === 'RED') {
        console.error('[WaMessageRouter] QUALITY RED — todos os envios serao pausados automaticamente.');
      }
    } catch (err) {
      console.error('[WaMessageRouter] Erro ao processar quality update:', err);
    }
  }

  /**
   * Process delivery status updates from Meta webhook payload.
   * Expects `change.value` object (with statuses[]).
   */
  static async handleStatusUpdate(value: any): Promise<void> {

      const statuses = value.statuses || [];
      for (const status of statuses) {
        const messageId = status.id;
        const statusType = status.status; // sent, delivered, read, failed
        const timestamp = status.timestamp;
        const recipientId = status.recipient_id;

        // 1. Dedup check (messageId_status combo)
        const statusKey = `${messageId}_${statusType}`;
        if (isDuplicate(statusKey)) continue;

        try {
          // 2. Build update data based on status type
          const updateData: Record<string, any> = {};

          switch (statusType) {
            case 'sent':
              updateData.status = 'WA_SENT';
              updateData.sentAt = new Date(parseInt(timestamp) * 1000);
              break;
            case 'delivered':
              updateData.status = 'WA_DELIVERED';
              updateData.deliveredAt = new Date(parseInt(timestamp) * 1000);
              break;
            case 'read':
              updateData.status = 'WA_READ';
              updateData.readAt = new Date(parseInt(timestamp) * 1000);
              break;
            case 'failed':
              updateData.status = 'WA_FAILED';
              updateData.failedAt = new Date(parseInt(timestamp) * 1000);
              // 4. If failed: save errorCode + errorMessage
              const errors = status.errors || [];
              if (errors.length > 0) {
                updateData.errorCode = String(errors[0].code);
                updateData.errorMessage = errors[0].title || errors[0].message || 'Unknown error';
              }
              break;
            default:
              continue; // Unknown status, skip
          }

          // 3. Find WaMessage by waMessageId and update
          if (Object.keys(updateData).length > 0) {
            const updated = await prisma.waMessage.updateMany({
              where: { waMessageId: messageId },
              data: updateData,
            });

            if (updated.count === 0) {
              // Message not found in WaMessage — might be in CloudWaMessageLog (legacy)
              console.log(`[WaMessageRouter] Status ${statusType} para msg ${messageId} — não encontrada em WaMessage`);
            }
          }

          if (statusType === 'failed') {
            const errors = status.errors || [];
            console.warn(`[WaMessageRouter] Falha ao enviar para ${recipientId}: ${errors[0]?.code} — ${errors[0]?.title}`);
          }
        } catch (err) {
          console.error(`[WaMessageRouter] Erro ao processar status ${statusType} para ${messageId}:`, err);
        }
      }
  }
}
