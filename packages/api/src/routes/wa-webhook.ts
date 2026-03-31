/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Webhook — WhatsApp Cloud API v2 (módulo WA unificado)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Substitui cloud-wa-webhook.ts com roteamento via WaMessageRouter.
 *
 *   Legado Cloud API:  GET/POST /api/whatsapp/cloud/webhook
 *   Novo WA v2:        GET/POST /api/wa/webhook  ← ESTE ARQUIVO
 *
 * Responsabilidades:
 *   1. Verificação de webhook (GET challenge)
 *   2. Validação de assinatura (X-Hub-Signature-256)
 *   3. Despacho de mensagens inbound via WaMessageRouter
 *   4. Despacho de status updates via WaMessageRouter
 *   5. Deduplicação (at-least-once delivery)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { WaMessageRouter } from '../services/wa/messageRouter';

const router = Router();

// In-memory dedup set with 5-minute TTL
const processedEntries = new Set<string>();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function markProcessed(id: string) {
  processedEntries.add(id);
  setTimeout(() => processedEntries.delete(id), DEDUP_TTL_MS);
}

// ─── GET /api/wa/webhook — Verificação (challenge) ─────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    const config = await prisma.cloudWaConfig.findFirst();
    const expectedToken = config?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '';

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[wa-webhook] Verificacao bem-sucedida');
      return res.status(200).send(challenge);
    }

    console.error('[wa-webhook] Verificacao falhou — token invalido');
    return res.status(403).send('Forbidden');
  } catch (err) {
    console.error('[wa-webhook] Erro na verificacao:', err);
    return res.status(500).send('Internal error');
  }
});

// ─── POST /api/wa/webhook — Receber notificacoes ──────────────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    // ── Validar assinatura ANTES de processar ──
    const config = await prisma.cloudWaConfig.findFirst();
    const appSecret = config?.appSecret || process.env.WHATSAPP_APP_SECRET || '';

    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!signature) {
        console.error('[wa-webhook] Assinatura ausente — requisicao rejeitada');
        return res.status(401).json({ error: 'Missing signature' });
      }

      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('[wa-webhook] Raw body nao capturado — verifique server.ts');
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
        console.error('[wa-webhook] Assinatura invalida — possivel ataque');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Assinatura valida (ou sem appSecret configurado) — responder 200 imediatamente
    res.status(200).send('OK');

    // Processar assincronamente
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value) continue;

        try {
          // ── Mensagens inbound ──
          const messages = value.messages || [];
          if (messages.length > 0) {
            // Dedup por message ID
            const hasNew = messages.some((m: any) => !processedEntries.has(m.id));
            if (hasNew) {
              for (const msg of messages) markProcessed(msg.id);
              await WaMessageRouter.handleInbound(value);
            }
          }

          // ── Status updates (sent/delivered/read/failed) ──
          const statuses = value.statuses || [];
          if (statuses.length > 0) {
            // Dedup por messageId + status combo
            const hasNew = statuses.some((s: any) => !processedEntries.has(`${s.id}_${s.status}`));
            if (hasNew) {
              for (const s of statuses) markProcessed(`${s.id}_${s.status}`);
              await WaMessageRouter.handleStatusUpdate(value);
            }
          }
        } catch (changeErr) {
          console.error('[wa-webhook] Erro ao processar change:', changeErr);
        }
      }
    }
  } catch (err) {
    console.error('[wa-webhook] Erro critico:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal error' });
    }
  }
});

export default router;
