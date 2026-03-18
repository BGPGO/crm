import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { EvolutionApiClient } from '../services/evolutionApiClient';

const router = Router();

// GET /api/whatsapp-conversations — List conversations with pagination
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, attendant, status } = req.query;
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { phone: { contains: search as string, mode: 'insensitive' } },
        { pushName: { contains: search as string, mode: 'insensitive' } },
        { contact: { name: { contains: search as string, mode: 'insensitive' } } },
        { contact: { email: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    // Filter by attendant type: ai, human, all
    if (attendant === 'ai') {
      where.needsHumanAttention = false;
      where.isActive = true;
    } else if (attendant === 'human') {
      where.needsHumanAttention = true;
    }

    // Filter by status: open, closed
    if (status === 'open') {
      where.status = 'open';
    } else if (status === 'closed') {
      where.status = 'closed';
    }

    // Filter by errors: conversations with undelivered messages
    const { hasErrors } = req.query;
    if (hasErrors === 'true') {
      where.messages = { some: { delivered: false } };
    }

    const [total, data] = await Promise.all([
      prisma.whatsAppConversation.count({ where }),
      prisma.whatsAppConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          contact: {
            select: {
              id: true, name: true, email: true,
              tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
            },
          },
          _count: { select: { messages: { where: { delivered: false } } } },
        },
      }),
    ]);

    // Count unread CLIENT messages (after lastReadAt) for each conversation
    const convIds = data.map((c) => c.id);
    const unreadCounts: Record<string, number> = {};
    if (convIds.length > 0) {
      const unreadRows = await prisma.$queryRaw<Array<{ conversationId: string; cnt: bigint }>>`
        SELECT "conversationId", COUNT(*) as cnt FROM "WhatsAppMessage"
         WHERE "conversationId" = ANY(${convIds}::text[])
           AND "sender" = 'CLIENT'
           AND "createdAt" > COALESCE(
             (SELECT "lastReadAt" FROM "WhatsAppConversation" WHERE id = "WhatsAppMessage"."conversationId"),
             '1970-01-01'::timestamp
           )
         GROUP BY "conversationId"`;
      for (const row of unreadRows) {
        unreadCounts[row.conversationId] = Number(row.cnt);
      }
    }

    // Flatten tags and add hasUndelivered + unreadCount
    const enriched = data.map((c) => ({
      ...c,
      tags: (c.contact as any)?.tags?.map((ct: any) => ct.tag) || [],
      hasUndelivered: ((c as any)._count?.messages || 0) > 0,
      unreadCount: unreadCounts[c.id] || 0,
    }));

    res.json({
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-conversations/stats — Conversation counts by type
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [total, withAI, withHuman, open, closed, withErrors] = await Promise.all([
      prisma.whatsAppConversation.count(),
      prisma.whatsAppConversation.count({ where: { needsHumanAttention: false, isActive: true } }),
      prisma.whatsAppConversation.count({ where: { needsHumanAttention: true } }),
      prisma.whatsAppConversation.count({ where: { status: 'open' } }),
      prisma.whatsAppConversation.count({ where: { status: 'closed' } }),
      prisma.whatsAppConversation.count({ where: { messages: { some: { delivered: false } } } }),
    ]);

    res.json({ data: { total, withAI, withHuman, open, closed, withErrors } });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-conversations/:id — Single conversation with last 50 messages
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!conversation) return next(createError('Conversation not found', 404));

    res.json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-conversations/:id/messages — Paginated messages
router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where = { conversationId: req.params.id };

    const [total, data] = await Promise.all([
      prisma.whatsAppMessage.count({ where }),
      prisma.whatsAppMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.json({
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-conversations/:id/read — Mark conversation as read
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.whatsAppConversation.update({
      where: { id: req.params.id },
      data: { lastReadAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-conversations/:id/send — Send manual message (human)
router.post('/:id/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!conversation) return next(createError('Conversation not found', 404));

    const { content } = req.body;
    if (!content) return next(createError('content is required', 400));

    // Send via Evolution API
    const client = await EvolutionApiClient.fromConfig();
    await client.sendText(conversation.phone, content);

    // Save message as HUMAN sender
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        text: content,
        sender: 'HUMAN',
      },
    });

    // Update conversation lastMessageAt
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    res.status(201).json({ data: message });
  } catch (err) {
    next(err);
  }
});

// PUT /api/whatsapp-conversations/:id — Update conversation
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const { needsHumanAttention, meetingBooked, contactId, status } = req.body;
    const data: Record<string, unknown> = {};
    if (needsHumanAttention !== undefined) data.needsHumanAttention = needsHumanAttention;
    if (meetingBooked !== undefined) data.meetingBooked = meetingBooked;
    if (contactId !== undefined) data.contactId = contactId;
    if (status !== undefined) data.status = status;

    const conversation = await prisma.whatsAppConversation.update({
      where: { id: req.params.id },
      data,
      include: {
        contact: { select: { id: true, name: true, email: true } },
      },
    });

    // Auto-tag "Atendimento Humano" when manually activated
    if (needsHumanAttention === true && conversation.contactId) {
      const humanTag = await prisma.tag.findUnique({ where: { name: 'Atendimento Humano' } });
      if (humanTag) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: conversation.contactId, tagId: humanTag.id } },
          create: { contactId: conversation.contactId, tagId: humanTag.id },
          update: {},
        });
        console.log(`[whatsapp-conversations] Auto-tagged contact ${conversation.contactId} with "Atendimento Humano"`);
      }
    }

    res.json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-conversations/:id/tags — Add tag to conversation's contact
router.post('/:id/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!conversation) return next(createError('Conversation not found', 404));
    if (!conversation.contactId) return next(createError('Conversation has no linked contact', 400));

    const { tagId } = req.body;
    if (!tagId) return next(createError('tagId is required', 400));

    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: conversation.contactId, tagId } },
      create: { contactId: conversation.contactId, tagId },
      update: {},
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/whatsapp-conversations/:id/tags/:tagId — Remove tag from conversation's contact
router.delete('/:id/tags/:tagId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!conversation) return next(createError('Conversation not found', 404));
    if (!conversation.contactId) return next(createError('Conversation has no linked contact', 400));

    await prisma.contactTag.deleteMany({
      where: { contactId: conversation.contactId, tagId: req.params.tagId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
