import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/activities
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { dealId, contactId, userId, type } = req.query;

    const where: Record<string, unknown> = {};

    if (dealId) where.dealId = dealId as string;
    if (contactId) where.contactId = contactId as string;
    if (userId) where.userId = userId as string;
    if (type) where.type = type as string;

    const [total, data] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
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

// GET /api/activities/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true, email: true } },
      },
    });

    if (!activity) return next(createError('Activity not found', 404));

    res.json({ data: activity });
  } catch (err) {
    next(err);
  }
});

// POST /api/activities
router.post(
  '/',
  validate({ type: 'required', userId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, content, dealId, contactId, userId, metadata } = req.body;
      const activity = await prisma.activity.create({
        data: { type, content, dealId, contactId, userId, metadata },
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
        },
      });
      res.status(201).json({ data: activity });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/activities/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.activity.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Activity not found', 404));

    const { type, content, dealId, contactId, userId, metadata } = req.body;
    const data: Record<string, unknown> = {};
    if (type !== undefined) data.type = type;
    if (content !== undefined) data.content = content;
    if (dealId !== undefined) data.dealId = dealId;
    if (contactId !== undefined) data.contactId = contactId;
    if (userId !== undefined) data.userId = userId;
    if (metadata !== undefined) data.metadata = metadata;

    const activity = await prisma.activity.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    res.json({ data: activity });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/activities/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.activity.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Activity not found', 404));

    await prisma.activity.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
