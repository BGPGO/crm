/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Canal Comercial (número humano) — proxy autenticado pro Messenger (bgpmassa)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2º canal da central de comunicação: o número Z-API "Comercial" pertence ao
 * Messenger (webhook é dele), então o CRM lê e envia POR ELE via conta de
 * serviço. Canal 100% humano — zero bot, zero automação.
 *
 *   GET  /conversation?phone=...        — resolve a conversa pelo telefone (não cria)
 *   GET  /conversations/:id/messages    — mensagens da conversa (proxy)
 *   POST /send { phone, content }       — envia; cria a conversa no 1º envio
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import {
  isComercialConfigured,
  findConversationByPhone,
  openPrivateConversation,
  getMessages,
  sendMessage,
  listConversations,
  MassaMessage,
} from '../services/bgpmassaClient';
import { normalizePhone } from '../utils/phoneNormalize';

const router = Router();

// Overview é chamado no polling da central — cache curto pra não marretar o Messenger
let overviewCache: { data: object; expiresAt: number; key: string } | null = null;

// Shape estável pro frontend — independente de mudanças no Messenger.
// Quando type != TEXT, o body do Messenger é uma string JSON ({url, caption, fileName...}).
function mapMessage(m: MassaMessage) {
  const isText = !m.type || m.type === 'TEXT';
  let text = m.body ?? '';
  let mediaType: string | null = null;
  if (!isText) {
    mediaType = m.type ?? null;
    try {
      const parsed = JSON.parse(m.body || '{}') as { caption?: string; fileName?: string };
      text = parsed.caption || parsed.fileName || '';
    } catch {
      text = '';
    }
  }
  if (m.deletedAt) text = '[mensagem apagada]';
  return {
    id: m.id,
    fromMe: m.direction === 'OUTBOUND',
    senderName: m.sender?.name ?? m.senderName ?? null,
    text,
    mediaType,
    createdAt: m.createdAt || new Date().toISOString(),
  };
}

function ensureConfigured(res: Response): boolean {
  if (!isComercialConfigured()) {
    res.status(503).json({
      error: 'Canal Comercial não configurado (env vars do Messenger ausentes)',
    });
    return false;
  }
  return true;
}

// ─── GET /api/comercial-chat/overview ────────────────────────────────────────
// Inteligência do canal Comercial pra coluna Conversas da central:
//   pending          — leads (contato com deal ABERTA no CRM) esperando resposta
//                      na linha Comercial (status UNANSWERED do Messenger)
//   answeredByPhone  — sufixo(8 dígitos) → quando a equipe respondeu por último
//                      no Comercial (pra tirar do "Responder" quem já foi
//                      respondido pelo número humano fora do WABA)
// Filtros: dealOwnerId (dono OU closer), pipelineId — mesmos da central.

router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ensureConfigured(res)) return;
    const dealOwnerId = (req.query.dealOwnerId as string) || '';
    const pipelineId = (req.query.pipelineId as string) || '';
    const cacheKey = `${dealOwnerId}|${pipelineId}`;

    if (overviewCache && overviewCache.key === cacheKey && overviewCache.expiresAt > Date.now()) {
      return res.json({ data: overviewCache.data });
    }

    // 1. Messenger: quem espera resposta + atividade recente da linha Comercial
    const [unanswered, recent] = await Promise.all([
      listConversations({ status: 'UNANSWERED', limit: 100 }),
      listConversations({ limit: 200 }),
    ]);

    // Equipe respondeu por último → telefone considerado "respondido no Comercial"
    const answeredByPhone: Record<string, string> = {};
    for (const conv of recent) {
      const last = conv.messages?.[0];
      const phone = conv.contact?.phone || '';
      if (last?.direction === 'OUTBOUND' && phone.length >= 8) {
        answeredByPhone[phone.slice(-8)] = last.createdAt;
      }
    }

    // 2. Cross-ref: telefone do Messenger → contato do CRM (por sufixo de 8 dígitos)
    const bySuffix = new Map<string, (typeof unanswered)[number]>();
    for (const conv of unanswered) {
      const phone = conv.contact?.phone || '';
      if (phone.length >= 8) bySuffix.set(phone.slice(-8), conv);
    }

    type PendingItem = {
      id: string;
      phone: string;
      contactId: string;
      contactName: string;
      dealId: string;
      dealStage: { name: string; color: string | null; order: number } | null;
      dealOwnerName: string | null;
      lastMessageAt: string | null;
      lastBody: string | null;
    };
    const pending: PendingItem[] = [];

    if (bySuffix.size > 0) {
      const suffixes = [...bySuffix.keys()];
      const contacts = await prisma.$queryRaw<Array<{ id: string; name: string; digits: string }>>`
        SELECT id, name, regexp_replace(coalesce(phone, ''), '\\D', '', 'g') AS digits
        FROM "Contact"
        WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE ANY (
          SELECT '%' || s FROM unnest(${suffixes}::text[]) AS s
        )`;

      const deals = await prisma.deal.findMany({
        where: {
          contactId: { in: contacts.map((c) => c.id) },
          status: 'OPEN',
          ...(dealOwnerId ? { OR: [{ userId: dealOwnerId }, { closerId: dealOwnerId }] } : {}),
          ...(pipelineId ? { pipelineId } : {}),
        },
        select: {
          id: true,
          contactId: true,
          stage: { select: { name: true, color: true, order: true } },
          user: { select: { name: true } },
        },
      });
      const dealByContact = new Map(deals.map((d) => [d.contactId, d]));

      for (const contact of contacts) {
        const suffix = contact.digits.slice(-8);
        const conv = bySuffix.get(suffix);
        const deal = dealByContact.get(contact.id);
        if (!conv || !deal) continue;
        const last = conv.messages?.[0];
        pending.push({
          id: conv.id,
          phone: conv.contact?.phone || contact.digits,
          contactId: contact.id,
          contactName: contact.name || conv.contact?.name || conv.contact?.phone || '',
          dealId: deal.id,
          dealStage: deal.stage
            ? { name: deal.stage.name, color: deal.stage.color, order: deal.stage.order }
            : null,
          dealOwnerName: deal.user?.name ?? null,
          lastMessageAt: conv.lastMessageAt ?? last?.createdAt ?? null,
          lastBody: last ? (last.type && last.type !== 'TEXT' ? null : last.body) : null,
        });
        bySuffix.delete(suffix); // evita duplicar quando 2 contatos casam o mesmo sufixo
      }
    }

    pending.sort(
      (a, b) => new Date(a.lastMessageAt || 0).getTime() - new Date(b.lastMessageAt || 0).getTime()
    );

    const data = { pending, answeredByPhone };
    overviewCache = { data, expiresAt: Date.now() + 30_000, key: cacheKey };
    return res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/comercial-chat/conversation?phone=... ─────────────────────────

router.get('/conversation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ensureConfigured(res)) return;
    const phone = (req.query.phone as string) || '';
    if (!phone.trim()) {
      return res.status(400).json({ error: 'Parâmetro phone é obrigatório' });
    }

    const conv = await findConversationByPhone(normalizePhone(phone));
    return res.json({
      data: conv
        ? { conversationId: conv.id, contactName: conv.contact?.name ?? null }
        : { conversationId: null },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/comercial-chat/conversations/:id/messages ─────────────────────

router.get('/conversations/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ensureConfigured(res)) return;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
    const messages = await getMessages(req.params.id, limit);
    return res.json({ data: messages.map(mapMessage) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/comercial-chat/send ───────────────────────────────────────────

router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!ensureConfigured(res)) return;
    const { phone, content } = req.body as { phone?: string; content?: string };
    if (!phone?.trim() || !content?.trim()) {
      return res.status(400).json({ error: 'phone e content são obrigatórios' });
    }

    const conv = await openPrivateConversation(normalizePhone(phone));
    const sent = await sendMessage(conv.id, content.trim(), req.user?.name);

    // Regra da casa: toda mensagem WhatsApp enviada conta no volume diário
    // (mesmo padrão do envio manual do chat legado — registra, não bloqueia)
    const { registerSent } = await import('../services/dailyLimitService');
    await registerSent('followUp').catch(() => {});

    return res.json({
      data: { conversationId: conv.id, message: mapMessage(sent) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
