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
        const value = change.value;
        if (!value) continue;

        // ── Messages field: inbound messages + status updates ──
        if (change.field === 'messages') {
          // O WABA é compartilhado com outros serviços (ex.: bot LLM em outro número)
          // e a Meta só entrega num callback por app — o nosso. Eventos que não são
          // do nosso número são repassados ao serviço dono do outro número; processar
          // aqui faria conversas alheias entrarem no CRM e a BIA responder em dobro.
          const eventPhoneId = value.metadata?.phone_number_id;
          if (config?.phoneNumberId && eventPhoneId && eventPhoneId !== config.phoneNumberId) {
            forwardToLlmBot(entry.id, change, config.appSecret || '');
            continue;
          }
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

        // ── Phone number quality updates (separate field) ──
        if (change.field === 'phone_number_quality_update' || change.field === 'account_update') {
          try {
            const qualityKey = `quality_${Date.now()}`;
            if (!processedEntries.has(qualityKey)) {
              markProcessed(qualityKey);
              await WaMessageRouter.handleQualityUpdate(change.value);
            }
          } catch (qualityErr) {
            console.error('[wa-webhook] Erro ao processar quality update:', qualityErr);
          }
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

// ─── Proxy: eventos de outros números do WABA ────────────────────────────────
// Repassa o change intacto, no formato original da Meta, re-assinado com o mesmo
// app secret — pro serviço de destino a requisição é indistinguível da Meta.
const LLM_BOT_FORWARD_URL =
  process.env.LLM_BOT_FORWARD_URL || 'https://bi-whatsapp.187.77.238.125.sslip.io/api/wa/webhook';

function forwardToLlmBot(entryId: string, change: any, appSecret: string) {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: entryId, changes: [change] }],
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (appSecret) {
    headers['X-Hub-Signature-256'] =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
  }

  // Fire-and-forget: o 200 pra Meta já foi respondido; falha aqui não pode travar o CRM
  fetch(LLM_BOT_FORWARD_URL, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(8000),
  })
    .then((r) => {
      if (!r.ok) {
        console.error(`[wa-webhook] Forward pro bot LLM falhou: HTTP ${r.status}`);
      }
    })
    .catch((err) => {
      console.error('[wa-webhook] Forward pro bot LLM falhou:', err?.message || err);
    });
}

export default router;
