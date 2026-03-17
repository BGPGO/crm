import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { requireRole } from '../middleware/auth';

const router = Router();

// GET /api/webhook-configs
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { type } = req.query;

    const where: Record<string, unknown> = {};

    if (type) where.type = type as string;

    const [total, data] = await Promise.all([
      prisma.webhookConfig.count({ where }),
      prisma.webhookConfig.findMany({
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

// GET /api/webhook-configs/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.webhookConfig.findUnique({
      where: { id: req.params.id },
    });

    if (!config) return next(createError('Webhook configuration not found', 404));

    res.json({ data: config });
  } catch (err) {
    next(err);
  }
});

// POST /api/webhook-configs (ADMIN/MANAGER only)
router.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  validate({ name: 'required', url: 'required', type: 'required', events: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await prisma.webhookConfig.create({
        data: req.body,
      });
      res.status(201).json({ data: config });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/webhook-configs/:id (ADMIN/MANAGER only)
router.put('/:id', requireRole('ADMIN', 'MANAGER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Webhook configuration not found', 404));

    const config = await prisma.webhookConfig.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: config });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/webhook-configs/:id (ADMIN only)
router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.webhookConfig.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Webhook configuration not found', 404));

    await prisma.webhookConfig.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
