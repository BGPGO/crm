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

const router = Router();

// Cache stats por 30s para evitar muitos COUNTs a cada polling do frontend
let statsCache: { data: object; expiresAt: number } | null = null;

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
    const enriched = data.map((c) => ({
      ...c,
      unreadCount: unreadCounts[c.id] || 0,
      windowOpen: c.windowExpiresAt ? c.windowExpiresAt > now : false,
    }));

    res.json({
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
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

    const data = { total, open, closed, archived, needsHuman };
    statsCache = { data, expiresAt: Date.now() + 30_000 };
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

      case 'template':
        if (!templateName) return next(createError('templateName is required for template messages', 400));
        result = await WaMessageService.sendTemplate(
          conversation.id,
          templateName,
          templateLanguage || 'pt_BR',
          components || [],
          { senderType: 'WA_HUMAN', senderUserId: userId },
        );
        break;

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
