import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/whatsapp-followup/status — List all conversations with follow-up state
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.whatsAppFollowUpState.count(),
      prisma.whatsAppFollowUpState.findMany({
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          conversation: {
            select: {
              id: true,
              phone: true,
              pushName: true,
              lastMessageAt: true,
              needsHumanAttention: true,
            },
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

// POST /api/whatsapp-followup/pause/:conversationId — Pause follow-up
router.post('/pause/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversationId } = req.params;

    const state = await prisma.whatsAppFollowUpState.findUnique({
      where: { conversationId },
    });
    if (!state) return next(createError('Follow-up state not found for this conversation', 404));

    const updated = await prisma.whatsAppFollowUpState.update({
      where: { conversationId },
      data: { paused: true },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-followup/resume/:conversationId — Resume follow-up
router.post('/resume/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { conversationId } = req.params;

    const state = await prisma.whatsAppFollowUpState.findUnique({
      where: { conversationId },
    });
    if (!state) return next(createError('Follow-up state not found for this conversation', 404));

    const updated = await prisma.whatsAppFollowUpState.update({
      where: { conversationId },
      data: { paused: false },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
