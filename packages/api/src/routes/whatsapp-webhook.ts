import { Router, Request, Response } from 'express';
import { handleMessage } from '../services/whatsappBot';
import prisma from '../lib/prisma';

const router = Router();

// In-memory dedup set with 5-minute TTL
const processedMessages = new Set<string>();
const MESSAGE_TTL_MS = 5 * 60 * 1000;

async function isDuplicate(messageId: string): Promise<boolean> {
  // Fast path: in-memory check
  if (processedMessages.has(messageId)) return true;

  // Slow path: DB check (survives restarts)
  if (messageId) {
    const existing = await prisma.whatsAppMessage.findFirst({
      where: { externalId: messageId },
      select: { id: true },
    });
    if (existing) {
      processedMessages.add(messageId); // Cache for future fast checks
      return true;
    }
  }

  // Not a duplicate — add to in-memory cache
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), MESSAGE_TTL_MS);
  return false;
}

// Z-API webhook handler — all events arrive at the same URL with `type` in body
async function webhookHandler(req: Request, res: Response) {
  // Always return 200 to Z-API — never error
  try {
    const instance = req.params.instance || undefined;
    const body = req.body;
    const eventType = body.type;

    // Note: Z-API does NOT send Client-Token in webhook requests.
    // Authentication is done via the webhook URL being secret (HTTPS only).
    // The Client-Token header is only used when WE call the Z-API endpoints.

    if (eventType === 'ReceivedCallback') {
      // Skip group messages
      if (body.isGroup === true) {
        return res.status(200).json({ received: true });
      }

      // Skip broadcast messages
      if (body.broadcast === true) {
        return res.status(200).json({ received: true });
      }

      // Skip messages sent by us
      if (body.fromMe === true) {
        return res.status(200).json({ received: true });
      }

      // Dedup check
      const messageId = body.messageId;
      if (messageId && await isDuplicate(messageId)) {
        return res.status(200).json({ received: true, deduplicated: true });
      }

      // Map Z-API payload to the shape handleMessage expects
      const remoteJid = body.phone + '@s.whatsapp.net';

      const message: any = {
        conversation: body.text?.message || (typeof body.text === 'string' ? body.text : undefined) || body.body || undefined,
      };

      // Map audio if present
      if (body.audio) {
        message.audioMessage = {
          url: body.audio.audioUrl,
          ptt: body.audio.ptt,
          seconds: body.audio.seconds,
        };
      }

      // Map image if present
      if (body.image) {
        message.imageMessage = {
          url: body.image.imageUrl,
          caption: body.image.caption,
        };
      }

      // Map video if present
      if (body.video) {
        message.videoMessage = {
          url: body.video.videoUrl,
          caption: body.video.caption,
        };
      }

      // Map document if present
      if (body.document) {
        message.documentMessage = {
          url: body.document.documentUrl,
          fileName: body.document.fileName,
        };
      }

      const payload = {
        data: {
          key: {
            remoteJid,
            fromMe: body.fromMe,
            id: body.messageId,
          },
          pushName: body.senderName || body.chatName || '',
          message,
        },
        sender: body.phone,
      };

      // Process message in background — don't await to keep response fast
      const instanceName = instance || body.instanceId || '';
      handleMessage(payload, instanceName).catch((err) => {
        console.error('[whatsapp-webhook] Error handling message:', err);
      });
    } else if (eventType === 'ConnectedCallback') {
      console.log(`[whatsapp-webhook] Connected: instanceId=${body.instanceId}, phone=${body.phone}`);

      try {
        const instanceId = body.instanceId || '';
        await prisma.whatsAppConfig.updateMany({
          where: instanceId ? { zapiInstanceId: instanceId } : {},
          data: { connectionStatus: 'CONNECTED' },
        });
      } catch (dbErr) {
        console.error('[whatsapp-webhook] Failed to update connection status:', dbErr);
      }
    } else if (eventType === 'DisconnectedCallback') {
      console.log(`[whatsapp-webhook] Disconnected: instanceId=${body.instanceId}, error=${body.error}`);

      try {
        const instanceId = body.instanceId || '';
        await prisma.whatsAppConfig.updateMany({
          where: instanceId ? { zapiInstanceId: instanceId } : {},
          data: { connectionStatus: 'DISCONNECTED' },
        });
      } catch (dbErr) {
        console.error('[whatsapp-webhook] Failed to update connection status:', dbErr);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[whatsapp-webhook] Unexpected error:', err);
    res.status(200).json({ received: true, error: 'internal' });
  }
}

// POST /api/whatsapp/webhook — Z-API sends all events here
router.post('/', webhookHandler);
// POST /api/whatsapp/webhook/:instance — backward compat
router.post('/:instance', webhookHandler);

export default router;
