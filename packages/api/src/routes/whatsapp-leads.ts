import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/whatsapp-leads — List conversations as leads with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { meetingBooked, needsHumanAttention, hasContact } = req.query;
    const where: Record<string, unknown> = {};

    if (meetingBooked !== undefined) {
      where.meetingBooked = meetingBooked === 'true';
    }

    if (needsHumanAttention !== undefined) {
      where.needsHumanAttention = needsHumanAttention === 'true';
    }

    if (hasContact !== undefined) {
      if (hasContact === 'true') {
        where.contactId = { not: null };
      } else {
        where.contactId = null;
      }
    }

    const [total, data] = await Promise.all([
      prisma.whatsAppConversation.count({ where }),
      prisma.whatsAppConversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: { select: { id: true, name: true, email: true, phone: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
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

// PUT /api/whatsapp-leads/:id — Update lead info on the conversation
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const { pushName } = req.body;
    const data: Record<string, unknown> = {};
    if (pushName !== undefined) data.pushName = pushName;

    const conversation = await prisma.whatsAppConversation.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-leads/:id/link-contact — Link conversation to CRM Contact
router.post('/:id/link-contact', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppConversation.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return next(createError('Conversation not found', 404));

    const { contactId } = req.body;
    if (!contactId) return next(createError('contactId is required', 400));

    // Verify contact exists
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return next(createError('Contact not found', 404));

    const conversation = await prisma.whatsAppConversation.update({
      where: { id: req.params.id },
      data: { contactId },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    res.json({ data: conversation });
  } catch (err) {
    next(err);
  }
});

export default router;
