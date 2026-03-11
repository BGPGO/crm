import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/campaigns
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.campaign.count({ where }),
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { deals: true } },
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

// GET /api/campaigns/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        deals: {
          select: { id: true, title: true, value: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!campaign) return next(createError('Campaign not found', 404));

    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// POST /api/campaigns
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await prisma.campaign.create({ data: req.body });
      res.status(201).json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/campaigns/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Campaign not found', 404));

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Campaign not found', 404));

    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
