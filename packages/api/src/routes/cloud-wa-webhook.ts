/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Webhook — WhatsApp Cloud API (API Oficial da Meta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Endpoint SEPARADO do webhook Z-API (whatsapp-webhook.ts).
 *
 *   Z-API legado:   POST /api/whatsapp/webhook
 *   Cloud API:      GET/POST /api/whatsapp/cloud/webhook  ← ESTE ARQUIVO
 *
 * Responsabilidades:
 *   1. Verificação de webhook (GET challenge)
 *   2. Validação de assinatura (X-Hub-Signature-256)
 *   3. Recebimento de mensagens
 *   4. Atualização de status de entrega (sent/delivered/read/failed)
 *   5. Notificação de status de templates
 *   6. Deduplicação (at-least-once delivery)
 *
 * Referência: crm/WHATSAPP-CLOUD-API-REFERENCE.md (seções 3, 10, 15)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';

const router = Router();

// In-memory dedup set with 5-minute TTL
const processedIds = new Set<string>();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function markProcessed(id: string) {
  processedIds.add(id);
  setTimeout(() => processedIds.delete(id), DEDUP_TTL_MS);
}

// ─── GET /api/whatsapp/cloud/webhook — Verificação (challenge) ──────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    const config = await prisma.cloudWaConfig.findFirst();
    const expectedToken = config?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[cloud-webhook] Verificação bem-sucedida');
      return res.status(200).send(challenge);
    }

    console.error('[cloud-webhook] Verificação falhou — token inválido');
    return res.status(403).send('Forbidden');
  } catch (err) {
    console.error('[cloud-webhook] Erro na verificação:', err);
    return res.status(500).send('Internal error');
  }
});

// ─── POST /api/whatsapp/cloud/webhook — Receber notificações ────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    // ── Validar assinatura ANTES de responder ──
    const config = await prisma.cloudWaConfig.findFirst();
    const appSecret = config?.appSecret || process.env.WHATSAPP_APP_SECRET || '';

    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!signature) {
        console.error('[cloud-webhook] Assinatura ausente — requisição rejeitada');
        return res.status(401).json({ error: 'Missing signature' });
      }

      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('[cloud-webhook] Raw body não capturado — verifique server.ts');
        return res.status(500).json({ error: 'Raw body not available' });
      }

      const expectedSig = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(signature, 'utf8');
      const expectedBuffer = Buffer.from(expectedSig, 'utf8');

      if (sigBuffer.length !== expectedBuffer.length ||
          !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.error('[cloud-webhook] Assinatura inválida — possível ataque');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Assinatura válida (ou sem appSecret configurado) — responder 200 imediatamente
    res.status(200).send('OK');

    // Processar assíncrono
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        // Cada change processado isoladamente para não abortar o batch
        try {
          const field = change.field;
          if (field === 'messages') {
            await handleMessagesChange(change.value);
          } else if (field === 'message_template_status_update') {
            await handleTemplateStatusUpdate(change.value);
          } else if (field === 'phone_number_quality_update') {
            await handleQualityUpdate(change.value);
          }
        } catch (changeErr) {
          console.error(`[cloud-webhook] Erro ao processar change (field=${change.field}):`, changeErr);
        }
      }
    }
  } catch (err) {
    console.error('[cloud-webhook] Erro crítico:', err);
    // Se ainda não respondeu, retornar 500
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

// ─── Handler: Mensagens recebidas + Status de entrega ───────────────────────

async function handleMessagesChange(value: any) {
  const metadata = value.metadata || {};
  const phoneNumberId = metadata.phone_number_id;
  const displayPhone = metadata.display_phone_number;

  // ── Mensagens recebidas (INBOUND) ──
  const messages = value.messages || [];
  for (const msg of messages) {
    const messageId = msg.id;

    // Dedup
    if (processedIds.has(messageId)) continue;
    markProcessed(messageId);

    try {
      const from = msg.from;           // Número do remetente
      const timestamp = msg.timestamp; // Unix timestamp
      const type = msg.type;           // text, image, audio, video, document, sticker, reaction, interactive, button, location, contacts

      // Extrair texto
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
          // Quick reply button or list reply
          text = msg.interactive?.button_reply?.title ||
                 msg.interactive?.list_reply?.title ||
                 null;
          break;
        case 'button':
          text = msg.button?.text || null;
          break;
        case 'location':
          text = `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`;
          break;
        default:
          text = `[${type}]`;
      }

      // Contato info
      const contactInfo = value.contacts?.[0];
      const pushName = contactInfo?.profile?.name || '';

      // Salvar no CloudWaMessageLog
      try {
        await prisma.cloudWaMessageLog.create({
          data: {
            waMessageId: messageId,
            direction: 'INBOUND',
            phone: from,
            type,
            body: text,
            mediaId,
            status: 'DELIVERED', // Inbound messages are already delivered
            deliveredAt: new Date(parseInt(timestamp) * 1000),
            metadata: msg as any,
          },
        });
      } catch (err: any) {
        // Unique constraint = duplicate
        if (err.code === 'P2002') continue;
        console.error('[cloud-webhook] Erro ao salvar mensagem:', err);
      }

      // TODO: Integrar com handleMessage() quando a seção Inbox estiver pronta
      // Por enquanto só loga e armazena
      console.log(`[cloud-webhook] 📩 ${from} (${pushName}): ${text || `[${type}]`}`);
    } catch (msgErr) {
      console.error(`[cloud-webhook] Erro ao processar mensagem ${messageId}:`, msgErr);
    }
  }

  // ── Status de entrega (OUTBOUND) ──
  const statuses = value.statuses || [];
  for (const status of statuses) {
    const messageId = status.id;       // wamid do message que enviamos
    const statusType = status.status;  // sent, delivered, read, failed
    const timestamp = status.timestamp;
    const recipientId = status.recipient_id;

    // Dedup por statusId
    const statusKey = `${messageId}_${statusType}`;
    if (processedIds.has(statusKey)) continue;
    markProcessed(statusKey);

    try {
      const updateData: Record<string, any> = {};

      switch (statusType) {
        case 'sent':
          updateData.status = 'SENT';
          updateData.sentAt = new Date(parseInt(timestamp) * 1000);
          break;
        case 'delivered':
          updateData.status = 'DELIVERED';
          updateData.deliveredAt = new Date(parseInt(timestamp) * 1000);
          break;
        case 'read':
          updateData.status = 'READ';
          updateData.readAt = new Date(parseInt(timestamp) * 1000);
          break;
        case 'failed':
          updateData.status = 'FAILED';
          updateData.failedAt = new Date(parseInt(timestamp) * 1000);
          // Extract error info
          const errors = status.errors || [];
          if (errors.length > 0) {
            updateData.errorCode = String(errors[0].code);
            updateData.errorMessage = errors[0].title || errors[0].message;
          }
          break;
      }

      if (Object.keys(updateData).length > 0) {
        try {
          await prisma.cloudWaMessageLog.updateMany({
            where: { waMessageId: messageId },
            data: updateData,
          });
        } catch (err) {
          console.error(`[cloud-webhook] Erro ao atualizar status ${statusType} para ${messageId}:`, err);
        }
      }

      if (statusType === 'failed') {
        const errors = status.errors || [];
        console.warn(`[cloud-webhook] ❌ Falha ao enviar para ${recipientId}: ${errors[0]?.code} — ${errors[0]?.title}`);
      }
    } catch (statusErr) {
      console.error(`[cloud-webhook] Erro ao processar status ${messageId}:`, statusErr);
    }
  }
}

// ─── Handler: Status de template (aprovação/rejeição) ───────────────────────

async function handleTemplateStatusUpdate(value: any) {
  const event = value.event;              // APPROVED, REJECTED, PENDING_DELETION, DISABLED, PAUSED
  const templateId = value.message_template_id;
  const templateName = value.message_template_name;
  const language = value.message_template_language;
  const reason = value.reason;

  console.log(`[cloud-webhook] Template "${templateName}" (${language}): ${event}${reason ? ` — ${reason}` : ''}`);

  // Mapear evento para status do modelo
  const statusMap: Record<string, string> = {
    'APPROVED': 'APPROVED',
    'REJECTED': 'REJECTED',
    'PAUSED': 'PAUSED',
    'DISABLED': 'DISABLED',
    'PENDING_DELETION': 'DISABLED',
    'IN_APPEAL': 'PENDING',
  };

  const status = statusMap[event] || 'PENDING';

  try {
    await prisma.cloudWaTemplate.updateMany({
      where: {
        name: templateName,
        language: language || 'pt_BR',
      },
      data: {
        status: status as any,
        metaTemplateId: templateId ? String(templateId) : undefined,
        rejectedReason: reason || null,
      },
    });
  } catch (err) {
    console.error('[cloud-webhook] Erro ao atualizar status do template:', err);
  }
}

// ─── Handler: Quality update (rating do número) ─────────────────────────────

async function handleQualityUpdate(value: any) {
  const currentLimit = value.current_limit;
  const event = value.event;
  const displayPhone = value.display_phone_number;

  console.warn(`[cloud-webhook] ⚠️ Quality update: phone=${displayPhone}, event=${event}, limit=${currentLimit}`);

  try {
    // Atualizar config que corresponde ao número afetado
    const where = displayPhone
      ? { displayPhone }
      : {};

    await prisma.cloudWaConfig.updateMany({
      where,
      data: {
        qualityRating: event === 'FLAGGED' ? 'YELLOW' : 'GREEN',
        phoneStatus: event === 'FLAGGED' ? 'FLAGGED' : 'CONNECTED',
      },
    });
  } catch (err) {
    console.error('[cloud-webhook] Erro ao atualizar quality:', err);
  }
}

export default router;
