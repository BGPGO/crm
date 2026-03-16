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

    const { search } = req.query;
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { phone: { contains: search as string, mode: 'insensitive' } },
        { pushName: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      prisma.whatsAppConversation.count({ where }),
      prisma.whatsAppConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          contact: { select: { id: true, name: true, email: true } },
        },
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

// GET /api/whatsapp-conversations/:id — Single conversation with last 50 messages
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
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
        orderBy: { createdAt: 'desc' },
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

    const { needsHumanAttention, meetingBooked, contactId } = req.body;
    const data: Record<string, unknown> = {};
    if (needsHumanAttention !== undefined) data.needsHumanAttention = needsHumanAttention;
    if (meetingBooked !== undefined) data.meetingBooked = meetingBooked;
    if (contactId !== undefined) data.contactId = contactId;

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

export default router;
