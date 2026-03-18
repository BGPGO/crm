import { Router, Request, Response } from 'express';
import { handleMessage } from '../services/whatsappBot';
import prisma from '../lib/prisma';

const router = Router();

// In-memory dedup set with 5-minute TTL
const processedMessages = new Set<string>();
const MESSAGE_TTL_MS = 5 * 60 * 1000;

function isDuplicate(messageId: string): boolean {
  if (processedMessages.has(messageId)) return true;
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), MESSAGE_TTL_MS);
  return false;
}

/**
 * Map Evolution API connection state strings to our enum.
 */
function mapConnectionStatus(state: string): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
  const s = state.toLowerCase();
  if (s === 'open' || s === 'connected') return 'CONNECTED';
  if (s === 'connecting' || s === 'pairing') return 'CONNECTING';
  return 'DISCONNECTED';
}

// POST /api/whatsapp/webhook/:instance — Webhook receiver from Evolution API (PUBLIC)
router.post('/:instance', async (req: Request, res: Response) => {
  // Always return 200 to Evolution API — never error
  try {
    const { instance } = req.params;
    const body = req.body;
    const event = body.event;

    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const message = body.data;

      if (!message) {
        return res.status(200).json({ received: true });
      }

      // Ignore messages sent by us
      if (message.key?.fromMe) {
        return res.status(200).json({ received: true });
      }

      // ── LID Resolution: use remoteJidAlt if remoteJid is a LID ──
      const originalJid = message.key?.remoteJid || '';
      if (originalJid.includes('@lid') && message.key?.remoteJidAlt) {
        console.log(`[whatsapp-webhook] LID detected. remoteJid=${originalJid} → remoteJidAlt=${message.key.remoteJidAlt}`);
        message.key.remoteJid = message.key.remoteJidAlt;
      }

      const remoteJid = message.key?.remoteJid || '';

      // Ignore group messages
      if (remoteJid.endsWith('@g.us')) {
        return res.status(200).json({ received: true });
      }

      // Ignore status broadcasts
      if (remoteJid === 'status@broadcast') {
        return res.status(200).json({ received: true });
      }

      // Dedup check
      const messageId = message.key?.id;
      if (messageId && isDuplicate(messageId)) {
        return res.status(200).json({ received: true, deduplicated: true });
      }

      // Debug: log ALL fields for remote inspection (temporary)
      const msgCtx = message.message?.messageContextInfo;
      const debugPayload = JSON.stringify({
        originalJid,
        resolvedJid: remoteJid,
        all_key_fields: message.key ? Object.keys(message.key) : [],
        remoteJidAlt: message.key?.remoteJidAlt || null,
        sender: body.sender,
        pushName: message.pushName,
        messageContextInfo: msgCtx ? Object.keys(msgCtx) : null,
        messageContextInfo_full: msgCtx || null,
        all_data_fields: Object.keys(message),
        all_message_fields: message.message ? Object.keys(message.message) : [],
      });
      console.log(`[whatsapp-webhook] MSG: ${debugPayload}`);
      // Save to DB for remote inspection
      prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } }).then(admin => {
        if (!admin) return;
        return prisma.activity.create({
          data: { type: 'NOTE', content: `[WA-DBG] ${debugPayload}`, userId: admin.id },
        });
      }).catch(() => {});

      // Process message in background — don't await to keep response fast
      const payload = { data: message, sender: body.sender };
      handleMessage(payload, instance).catch((err) => {
        console.error('[whatsapp-webhook] Error handling message:', err);
      });
    } else if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const state = body.data?.state || body.data?.status || 'unknown';
      console.log(`[whatsapp-webhook] Connection update for ${instance}: ${state}`);

      // Persist connection status in the DB
      try {
        const mappedStatus = mapConnectionStatus(state);
        await prisma.whatsAppConfig.updateMany({
          where: { instanceName: instance },
          data: { connectionStatus: mappedStatus },
        });
      } catch (dbErr) {
        console.error('[whatsapp-webhook] Failed to update connection status:', dbErr);
      }
    } else if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      console.log(`[whatsapp-webhook] QR code updated for ${instance}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[whatsapp-webhook] Unexpected error:', err);
    res.status(200).json({ received: true, error: 'internal' });
  }
});

export default router;
