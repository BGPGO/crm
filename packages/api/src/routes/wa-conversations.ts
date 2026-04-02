/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Inbox API — WhatsApp Cloud API v2 (módulo WA unificado)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rotas autenticadas para gerenciar conversas e mensagens do novo módulo WA.
 * Usa modelos WaConversation / WaMessage (separados dos legados WhatsAppConversation).
 *
 *   GET    /                    — Listar conversas com filtros + paginacao
 *   GET    /stats               — Estatisticas de conversas
 *   GET    /:id                 — Conversa individual + mensagens recentes + janela
 *   GET    /:id/messages        — Mensagens paginadas
 *   POST   /:id/messages        — Enviar mensagem (text, template, interactive, media)
 *   PATCH  /:id                 — Atualizar conversa (status, atribuicao, etc.)
 *   POST   /:id/read            — Marcar como lida
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { phoneVariants } from '../utils/phoneNormalize';

const router = Router();

// Cache stats por 30s para evitar muitos COUNTs a cada polling do frontend
let statsCache: { data: object; expiresAt: number } | null = null;

// Cache dashboard por 60s
let dashboardCache: { data: object; expiresAt: number } | null = null;

// ─── GET /api/wa/conversations — List conversations with filters + pagination ──

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
    const skip = (page - 1) * limit;

    const { search, status, assignedUserId, needsHumanAttention } = req.query;
    const where: Record<string, unknown> = {};

    // Filter by status (WA_OPEN, WA_CLOSED, WA_ARCHIVED)
    if (status) {
      where.status = status as string;
    }

    // Filter by assigned user
    if (assignedUserId) {
      where.assignedUserId = assignedUserId as string;
    }

    // Filter by needsHumanAttention
    if (needsHumanAttention === 'true') {
      where.needsHumanAttention = true;
    } else if (needsHumanAttention === 'false') {
      where.needsHumanAttention = false;
    }

    // Search by phone, pushName, or linked contact name/email
    if (search) {
      where.OR = [
        { phone: { contains: search as string, mode: 'insensitive' } },
        { pushName: { contains: search as string, mode: 'insensitive' } },
        { contact: { name: { contains: search as string, mode: 'insensitive' } } },
        { contact: { email: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    // Filter by pipeline stage (via contact → deal relation)
    const stageId = req.query.stageId as string | undefined;
    if (stageId) {
      where.contact = {
        ...((where.contact as object) || {}),
        deals: { some: { stageId, status: 'OPEN' } },
      };
    }

    const [total, data] = await Promise.all([
      prisma.waConversation.count({ where }),
      prisma.waConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          contact: {
            select: { id: true, name: true, email: true, phone: true },
          },
          assignedUser: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Count unread CLIENT messages after lastReadAt
    const unreadCounts: Record<string, number> = {};
    // Batch count in parallel (fast for small number of conversations)
    await Promise.all(data.map(async (c) => {
      const cnt = await prisma.waMessage.count({
        where: {
          conversationId: c.id,
          senderType: 'WA_CLIENT',
          createdAt: { gt: c.lastReadAt || new Date(0) },
        },
      });
      if (cnt > 0) unreadCounts[c.id] = cnt;
    }));

    // Compute window status and enrich response
    const now = new Date();

    // Batch-fetch deals for each conversation phone (handles duplicate contacts)
    // We look up by phone via Contact to catch cases where same phone = multiple contacts
    const allPhones = data.map(c => c.phone).filter(Boolean);
    type DealInfo = { id: string; stageId: string; status: string; stage: { name: string; color: string | null } | null };
    const dealsByPhone: Record<string, DealInfo> = {};
    if (allPhones.length > 0) {
      // Build all phone variants for matching
      const phonesNorm = [...new Set(allPhones)];
      const allVariants = phonesNorm.flatMap(p => phoneVariants(p));
      const uniqueVariants = [...new Set(allVariants)];
      // Find all contacts matching these phones, then their deals
      const contacts = await prisma.contact.findMany({
        where: { phone: { in: uniqueVariants } },
        select: { id: true, phone: true },
      });
      const allContactIds = contacts.map(c => c.id);
      if (allContactIds.length > 0) {
        const deals = await prisma.deal.findMany({
          where: { contactId: { in: allContactIds } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, contactId: true, stageId: true, status: true, stage: { select: { name: true, color: true } } },
        });
        // Group by phone, prioritize OPEN > WON > LOST
        const statusPriority: Record<string, number> = { OPEN: 0, WON: 1, LOST: 2 };
        // Map contactId → normalized phone (digits only) for matching back to conversation
        const contactPhoneMap = new Map(contacts.map(c => [c.id, c.phone?.replace(/\D/g, '') || '']));
        // Build reverse map: conversation phone (normalized) → conversation phone (original)
        const convPhoneNorm = new Map(phonesNorm.map(p => [p.replace(/\D/g, ''), p]));
        for (const d of deals) {
          const contactPhoneNorm = contactPhoneMap.get(d.contactId!) || '';
          // Match back to conversation phone
          const convPhone = convPhoneNorm.get(contactPhoneNorm) || contactPhoneNorm;
          if (!convPhone) continue;
          const existing = dealsByPhone[convPhone];
          const dPriority = statusPriority[d.status] ?? 3;
          const ePriority = existing ? (statusPriority[existing.status] ?? 3) : 99;
          if (dPriority < ePriority) {
            dealsByPhone[convPhone] = d;
          }
        }
      }
    }

    // Apply deal status filter if provided
    const dealStatusFilter = req.query.dealStatus as string | undefined;

    const enriched = data
      .map((c) => ({
        ...c,
        unreadCount: unreadCounts[c.id] || 0,
        windowOpen: c.windowExpiresAt ? c.windowExpiresAt > now : false,
        dealStage: dealsByPhone[c.phone]?.stage ?? null,
        dealStatus: dealsByPhone[c.phone]?.status ?? null,
      }))
      .filter((c) => {
        if (!dealStatusFilter) return true;
        // "Em andamento" (OPEN) also shows conversations without any deal
        if (dealStatusFilter === 'OPEN') return c.dealStatus === 'OPEN' || c.dealStatus === null;
        return c.dealStatus === dealStatusFilter;
      });

    res.json({
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/wa/conversations — Create new conversation from contact ──────

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId, phone: rawPhone } = req.body;

    if (!contactId && !rawPhone) {
      return next(createError('contactId ou phone é obrigatório', 400));
    }

    let phone = rawPhone;
    let linkContactId = contactId || null;

    // If contactId provided, get phone from contact
    if (contactId && !phone) {
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, name: true, phone: true },
      });
      if (!contact) return next(createError('Contato não encontrado', 404));
      if (!contact.phone) return next(createError('Contato não tem telefone cadastrado', 400));
      phone = contact.phone.replace(/\D/g, ''); // normalize: only digits
      linkContactId = contact.id;
    } else if (phone) {
      phone = phone.replace(/\D/g, '');
    }

    // Ensure BR country code (55) is present — Meta requires international format
    if (phone && !phone.startsWith('55') && phone.length >= 10 && phone.length <= 11) {
      phone = '55' + phone;
    }

    // Check if conversation already exists for this phone
    // Try exact match and BR variations (with/without 9)
    const variations = [phone];
    if (phone.startsWith('55') && phone.length === 13) {
      variations.push(`55${phone.substring(2, 4)}${phone.substring(5)}`); // without 9
    }
    if (phone.startsWith('55') && phone.length === 12) {
      variations.push(`55${phone.substring(2, 4)}9${phone.substring(4)}`); // with 9
    }

    let conversation = await prisma.waConversation.findFirst({
      where: { phone: { in: variations } },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    if (conversation) {
      // Reopen if closed
      if (conversation.status !== 'WA_OPEN') {
        conversation = await prisma.waConversation.update({
          where: { id: conversation.id },
          data: { status: 'WA_OPEN' },
          include: {
            contact: { select: { id: true, name: true, email: true, phone: true } },
            assignedUser: { select: { id: true, name: true } },
          },
        });
      }
      return res.json({ data: conversation, created: false });
    }

    // Create new conversation
    const userId = (req as any).user?.id;
    conversation = await prisma.waConversation.create({
      data: {
        phone,
        status: 'WA_OPEN',
        contactId: linkContactId,
        assignedUserId: userId || null,
      },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ data: conversation, created: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/legacy — Z-API conversations formatted as WaConversation shape
// Allows the unified WABA inbox to show legacy Z-API conversations with a tag

router.get('/legacy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));
    const search = req.query.search as string | undefined;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { phone: { contains: search, mode: 'insensitive' } },
        { pushName: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const data = await prisma.whatsAppConversation.findMany({
      where,
      take: limit,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        assignedUser: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { senderUser: { select: { id: true, name: true } } } },
        _count: { select: { messages: true } },
      },
    });

    // Exclude conversations that already exist in WABA (by phone)
    const zapiPhones = data.map(c => c.phone);
    const wabaExisting = zapiPhones.length > 0
      ? await prisma.waConversation.findMany({
          where: { phone: { in: zapiPhones } },
          select: { phone: true },
        })
      : [];
    const wabaPhoneSet = new Set(wabaExisting.map(w => w.phone));
    const filtered = data.filter(c => !wabaPhoneSet.has(c.phone));

    // Map to WaConversation-like shape
    const enriched = filtered.map((c) => {
      const lastMsg = c.messages[0] ?? null;
      return {
        id: `zapi_${c.id}`,
        _legacyId: c.id,
        phone: c.phone,
        pushName: c.pushName,
        contact: c.contact,
        assignedUser: c.assignedUser,
        status: c.status === 'open' ? 'WA_OPEN' : 'WA_CLOSED',
        needsHumanAttention: c.needsHumanAttention,
        optedOut: c.optedOut,
        unreadCount: 0,
        windowOpen: false,
        windowExpiresAt: null,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        dealStage: null,
        channel: 'zapi' as const,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        messages: lastMsg ? [{
          id: lastMsg.id,
          conversationId: c.id,
          direction: lastMsg.sender === 'CLIENT' ? 'INBOUND' : 'OUTBOUND',
          senderType: lastMsg.sender === 'CLIENT' ? 'WA_CLIENT' : lastMsg.sender === 'BOT' ? 'WA_BOT' : 'WA_HUMAN',
          type: 'TEXT',
          body: lastMsg.text,
          mediaUrl: null,
          interactiveData: null,
          status: 'WA_DELIVERED',
          sentAt: lastMsg.createdAt.toISOString(),
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          errorMessage: null,
          templateName: null,
          senderUser: lastMsg.senderUser ? { id: lastMsg.senderUser.id, name: lastMsg.senderUser.name } : null,
          createdAt: lastMsg.createdAt.toISOString(),
        }] : [],
      };
    });

    res.json({
      data: enriched,
      meta: { total: enriched.length },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/legacy/:id/messages — Z-API messages for sidebar

router.get('/legacy/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const legacyId = req.params.id;
    const limit = Math.min(500, parseInt(req.query.limit as string) || 200);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: legacyId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        senderUser: { select: { id: true, name: true } },
      },
    });

    const mapped = messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.sender === 'CLIENT' ? 'INBOUND' : 'OUTBOUND',
      senderType: m.sender === 'CLIENT' ? 'WA_CLIENT' : m.sender === 'BOT' ? 'WA_BOT' : 'WA_HUMAN',
      type: 'TEXT',
      body: m.text,
      mediaUrl: null,
      interactiveData: null,
      status: m.delivered === false ? 'WA_FAILED' : 'WA_DELIVERED',
      sentAt: m.createdAt.toISOString(),
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      errorMessage: null,
      templateName: null,
      senderUser: m.senderUser,
      createdAt: m.createdAt.toISOString(),
    }));

    res.json({ data: mapped, meta: { total: mapped.length } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/stats — Conversation counts ──────────────────

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (statsCache && Date.now() < statsCache.expiresAt) {
      return res.json({ data: statsCache.data });
    }

    const [total, open, closed, archived, needsHuman] = await Promise.all([
      prisma.waConversation.count(),
      prisma.waConversation.count({ where: { status: 'WA_OPEN' } }),
      prisma.waConversation.count({ where: { status: 'WA_CLOSED' } }),
      prisma.waConversation.count({ where: { status: 'WA_ARCHIVED' } }),
      prisma.waConversation.count({ where: { needsHumanAttention: true } }),
    ]);

    // Contagem por etapa do funil
    const convsByStage = await prisma.$queryRaw`
      SELECT ps.id as "stageId", ps.name as "stageName", COUNT(DISTINCT wc.id)::int as count
      FROM "WaConversation" wc
      JOIN "Contact" c ON c.id = wc."contactId"
      JOIN "Deal" d ON d."contactId" = c.id AND d.status = 'OPEN'
      JOIN "PipelineStage" ps ON ps.id = d."stageId"
      GROUP BY ps.id, ps.name, ps."order"
      ORDER BY ps."order" ASC
    `;

    const data = { total, open, closed, archived, needsHuman, byStage: convsByStage };
    statsCache = { data, expiresAt: Date.now() + 30_000 };
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/dashboard — WABA operation dashboard ─────────

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (dashboardCache && Date.now() < dashboardCache.expiresAt) {
      return res.json({ data: dashboardCache.data });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    // ── Pipeline: contacts by funnel stage with WaConversation ──
    const pipelineRaw = await prisma.$queryRaw<Array<{
      stageId: string;
      stageName: string;
      stageColor: string | null;
      stageOrder: number;
      count: number;
    }>>`
      SELECT
        ps.id as "stageId",
        ps.name as "stageName",
        ps.color as "stageColor",
        ps."order" as "stageOrder",
        COUNT(DISTINCT wc.id)::int as count
      FROM "WaConversation" wc
      JOIN "Contact" c ON c.id = wc."contactId"
      JOIN "Deal" d ON d."contactId" = c.id AND d.status = 'OPEN'
      JOIN "PipelineStage" ps ON ps.id = d."stageId"
      GROUP BY ps.id, ps.name, ps.color, ps."order"
      ORDER BY ps."order" ASC
    `;

    // ── Meetings (apenas de contatos com WaConversation = fluxo WABA) ──
    const waContactFilter = { contact: { waConversations: { some: {} } } };
    const [meetingsTotal, meetingsThisWeek, meetingsToday] = await Promise.all([
      prisma.calendlyEvent.count({ where: { status: 'active', ...waContactFilter } }),
      prisma.calendlyEvent.count({ where: { status: 'active', createdAt: { gte: startOfWeek }, ...waContactFilter } }),
      prisma.calendlyEvent.count({ where: { status: 'active', startTime: { gte: startOfToday, lte: endOfToday }, ...waContactFilter } }),
    ]);

    // ── Messages last 30 days ──
    const [
      messagesTotal,
      templatesTotal,
      botMessages,
      humanMessages,
      clientMessages,
    ] = await Promise.all([
      prisma.waMessage.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.waMessage.count({
        where: { direction: 'OUTBOUND', type: 'TEMPLATE', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.waMessage.count({
        where: { senderType: 'WA_BOT', type: 'TEXT', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.waMessage.count({
        where: { senderType: 'WA_HUMAN', createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.waMessage.count({
        where: { direction: 'INBOUND', createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // Template categories (MARKETING vs UTILITY)
    const templatesByCategory = await prisma.$queryRaw<Array<{ category: string; count: number }>>`
      SELECT ct.category, COUNT(*)::int as count
      FROM "WaMessage" wm
      JOIN "CloudWaTemplate" ct ON ct.name = wm."templateName"
      WHERE wm.direction = 'OUTBOUND'
        AND wm.type = 'TEMPLATE'
        AND wm."createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY ct.category
    `;

    const marketingTemplates = templatesByCategory.find(r => r.category === 'MARKETING')?.count ?? 0;
    const utilityTemplates = templatesByCategory.find(r => r.category === 'UTILITY')?.count ?? 0;

    // ── Cost estimate (Meta Brazil pricing) ──
    const costMarketing = Number(marketingTemplates) * 0.375;
    const costUtility = Number(utilityTemplates) * 0.0477;

    // ── Automations ──
    // WABA automations: those with steps that use WA-related action types
    const wabaActionTypes = ['SEND_WHATSAPP', 'SEND_WHATSAPP_AI', 'SEND_WA_TEMPLATE', 'WAIT_FOR_RESPONSE'];

    const wabaAutomationIds = await prisma.automationStep.findMany({
      where: { actionType: { in: wabaActionTypes as any } },
      select: { automationId: true },
      distinct: ['automationId'],
    });
    const wabaAutomationIdList = wabaAutomationIds.map(a => a.automationId);

    const [activeEnrollments, completedToday, pausedByResponse] = await Promise.all([
      prisma.automationEnrollment.count({
        where: {
          status: 'ACTIVE',
          ...(wabaAutomationIdList.length > 0 ? { automationId: { in: wabaAutomationIdList } } : {}),
        },
      }),
      prisma.automationEnrollment.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: startOfToday },
          ...(wabaAutomationIdList.length > 0 ? { automationId: { in: wabaAutomationIdList } } : {}),
        },
      }),
      prisma.automationEnrollment.count({
        where: {
          status: 'PAUSED',
          metadata: { path: ['interruptedByResponse'], equals: true },
          ...(wabaAutomationIdList.length > 0 ? { automationId: { in: wabaAutomationIdList } } : {}),
        },
      }),
    ]);

    // ── Conversations ──
    const [
      convTotal,
      convActive,
      convWithBot,
      convNeedsHuman,
      convOptedOut,
    ] = await Promise.all([
      prisma.waConversation.count(),
      prisma.waConversation.count({ where: { status: 'WA_OPEN' } }),
      prisma.waConversation.count({ where: { isActive: true } }),
      prisma.waConversation.count({ where: { needsHumanAttention: true } }),
      prisma.waConversation.count({ where: { optedOut: true } }),
    ]);

    const data = {
      pipeline: pipelineRaw,
      meetings: {
        total: meetingsTotal,
        thisWeek: meetingsThisWeek,
        today: meetingsToday,
      },
      messages: {
        total: messagesTotal,
        templates: templatesTotal,
        botMessages,
        humanMessages,
        clientMessages,
        marketingTemplates: Number(marketingTemplates),
        utilityTemplates: Number(utilityTemplates),
      },
      cost: {
        marketing: Math.round(costMarketing * 100) / 100,
        utility: Math.round(costUtility * 100) / 100,
        service: 0,
        total: Math.round((costMarketing + costUtility) * 100) / 100,
        currency: 'BRL' as const,
      },
      automations: {
        activeEnrollments,
        completedToday,
        pausedByResponse,
      },
      conversations: {
        total: convTotal,
        active: convActive,
        withBot: convWithBot,
        needsHuman: convNeedsHuman,
        optedOut: convOptedOut,
      },
    };

    dashboardCache = { data, expiresAt: Date.now() + 60_000 };
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/:id — Single conversation + recent messages ──

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          include: { senderUser: { select: { id: true, name: true } } },
        },
        contact: { select: { id: true, name: true, email: true, phone: true } },
        assignedUser: { select: { id: true, name: true } },
        followUpState: true,
      },
    });

    if (!conversation) return next(createError('Conversation not found', 404));

    // Compute window status
    const now = new Date();
    const windowOpen = conversation.windowExpiresAt
      ? conversation.windowExpiresAt > now
      : false;

    res.json({
      data: {
        ...conversation,
        windowOpen,
        windowExpiresAt: conversation.windowExpiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/:id/deals — Deals by phone (BR normalization) ─

router.get('/:id/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conv = await prisma.waConversation.findUnique({ where: { id: req.params.id } });
    if (!conv) return next(createError('Conversation not found', 404));

    const variants = phoneVariants(conv.phone);

    // Find all contacts with this phone
    const contacts = await prisma.contact.findMany({
      where: { phone: { in: variants } },
      select: { id: true },
    });
    const contactIds = contacts.map(c => c.id);
    if (conv.contactId && !contactIds.includes(conv.contactId)) {
      contactIds.push(conv.contactId);
    }

    if (contactIds.length === 0) return res.json({ data: [] });

    // Find deals via primary contact + DealContact junction
    const [primaryDeals, junctionDeals] = await Promise.all([
      prisma.deal.findMany({
        where: { contactId: { in: contactIds } },
        include: { stage: true, contact: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.deal.findMany({
        where: { dealContacts: { some: { contactId: { in: contactIds } } } },
        include: { stage: true, contact: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Deduplicate
    const seen = new Set<string>();
    const allDeals = [...primaryDeals, ...junctionDeals].filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });

    res.json({ data: allDeals });
  } catch (err) { next(err); }
});

// ─── GET /api/wa/conversations/:id/automation — Active automation enrollments ─

router.get('/:id/automation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conv = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
      select: { contactId: true },
    });
    if (!conv?.contactId) return res.json({ data: null });

    const enrollment = await prisma.automationEnrollment.findFirst({
      where: { contactId: conv.contactId, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: { enrolledAt: 'desc' },
      include: {
        automation: { select: { name: true } },
        currentStep: { select: { order: true, actionType: true, config: true } },
      },
    });

    if (!enrollment) return res.json({ data: null });

    const totalSteps = await prisma.automationStep.count({
      where: { automationId: enrollment.automationId },
    });

    res.json({
      data: {
        id: enrollment.id,
        status: enrollment.status,
        automationName: enrollment.automation.name,
        currentStep: enrollment.currentStep
          ? {
              order: enrollment.currentStep.order,
              actionType: enrollment.currentStep.actionType,
              label: (enrollment.currentStep.config as any)?._label || enrollment.currentStep.actionType,
            }
          : null,
        totalSteps,
        nextActionAt: enrollment.nextActionAt,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/wa/conversations/:id/messages — Paginated messages ────────────

router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const where = { conversationId: req.params.id };
    const total = await prisma.waMessage.count({ where });

    // When no explicit page is requested, return the LAST page (most recent messages)
    const totalPages = Math.ceil(total / limit);
    const effectivePage = req.query.page ? page : Math.max(1, totalPages);
    const skip = (effectivePage - 1) * limit;

    const data = await prisma.waMessage.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: { senderUser: { select: { id: true, name: true } } },
    });

    res.json({
      data,
      meta: { total, page: effectivePage, limit, totalPages },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/conversations/media/:mediaId — Proxy media download ────────
// Meta media URLs require Authorization header, so we proxy through our server

router.get('/media/:mediaId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { WhatsAppCloudClient } = await import('../services/whatsappCloudClient');
    const client = await WhatsAppCloudClient.fromConfig();

    // 1. Get the temporary URL + mime type from Meta
    const mediaInfo = await client.getMediaUrl(req.params.mediaId);

    // 2. Download the actual file (the client uses the access token)
    const buffer = await client.downloadMedia(mediaInfo.url);

    // 3. Serve to frontend
    res.set('Content-Type', mediaInfo.mime_type || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=86400'); // cache 24h
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/wa/conversations/:id/messages — Send message ────────────────

router.post('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!conversation) return next(createError('Conversation not found', 404));

    const {
      type,
      content,
      templateName,
      templateLanguage,
      components,
      buttons,
      sections,
      mediaUrl,
      caption,
    } = req.body;

    if (!type) return next(createError('type is required', 400));
    if (!content && !templateName && !mediaUrl) {
      return next(createError('content, templateName or mediaUrl is required', 400));
    }

    const userId = (req as any).user?.id;

    // Lazy-import WaMessageService to avoid circular deps at module load
    const { WaMessageService } = await import('../services/wa/messageService');

    let result: any;

    switch (type) {
      case 'text':
        result = await WaMessageService.sendText(conversation.id, content, {
          senderType: 'WA_HUMAN',
          senderUserId: userId,
        });
        break;

      case 'template': {
        if (!templateName) return next(createError('templateName is required for template messages', 400));

        // ── Auto-resolve variáveis do template se o frontend mandou placeholders ──
        let resolvedComponents = components || [];
        const hasPlaceholders = JSON.stringify(resolvedComponents).includes('"param');
        if (hasPlaceholders && conversation.contactId) {
          const templateRecord = await prisma.cloudWaTemplate.findFirst({
            where: { name: templateName, language: templateLanguage || 'pt_BR' },
            select: { variableMapping: true },
          });
          if (templateRecord?.variableMapping) {
            const { resolveTemplateVariables } = await import('../utils/templateVariableResolver');
            const resolved = await resolveTemplateVariables(
              templateRecord.variableMapping as any,
              { contactId: conversation.contactId, dealId: undefined },
            );
            if (resolved.parameters.length > 0 && resolved.missingVars.length === 0) {
              resolvedComponents = [{ type: 'body', parameters: resolved.parameters }];
            }
          }
        }

        result = await WaMessageService.sendTemplate(
          conversation.id,
          templateName,
          templateLanguage || 'pt_BR',
          resolvedComponents,
          { senderType: 'WA_HUMAN', senderUserId: userId },
        );
        break;
      }

      case 'interactive_buttons':
        if (!buttons || !Array.isArray(buttons)) {
          return next(createError('buttons array is required for interactive_buttons type', 400));
        }
        result = await WaMessageService.sendInteractiveButtons(
          conversation.id,
          content,
          buttons,
          { senderType: 'WA_HUMAN', senderUserId: userId },
        );
        break;

      case 'interactive_list':
        if (!sections || !Array.isArray(sections)) {
          return next(createError('sections array is required for interactive_list type', 400));
        }
        result = await WaMessageService.sendInteractiveList(
          conversation.id,
          content,
          'Ver opções',
          sections,
          { senderType: 'WA_HUMAN', senderUserId: userId },
        );
        break;

      case 'image':
      case 'video':
      case 'audio':
      case 'document':
        if (!mediaUrl) return next(createError('mediaUrl is required for media messages', 400));
        result = await WaMessageService.sendMedia(
          conversation.id,
          type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT',
          mediaUrl,
          caption || undefined,
          { senderType: 'WA_HUMAN', senderUserId: userId },
        );
        break;

      default:
        return next(createError(`Unsupported message type: ${type}`, 400));
    }

    // Update conversation lastMessageAt
    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        // Auto-assign user if not already assigned
        ...(!conversation.assignedUserId && userId ? { assignedUserId: userId } : {}),
      },
    });

    res.status(201).json({ data: result });
  } catch (err: any) {
    console.error('[wa-conversations] Erro ao enviar mensagem:', err?.message || err);
    next(err);
  }
});

// ─── PATCH /api/wa/conversations/:id — Update conversation ──────────────────

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const { assignedUserId, status, needsHumanAttention } = req.body;
    const data: Record<string, unknown> = {};

    if (assignedUserId !== undefined) data.assignedUserId = assignedUserId;
    if (status !== undefined) data.status = status;
    if (needsHumanAttention !== undefined) data.needsHumanAttention = needsHumanAttention;

    if (Object.keys(data).length === 0) {
      return next(createError('No valid fields to update', 400));
    }

    const conversation = await prisma.waConversation.update({
      where: { id: req.params.id },
      data,
      include: {
        contact: { select: { id: true, name: true, email: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    res.json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/wa/conversations/:id/read — Mark as read ────────────────────

router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.waConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    await prisma.waConversation.update({
      where: { id: req.params.id },
      data: { lastReadAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
