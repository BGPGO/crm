import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/pipelines
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.pipeline.count(),
      prisma.pipeline.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          stages: { orderBy: { order: 'asc' } },
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

// GET /api/pipelines/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: req.params.id },
      include: {
        stages: { orderBy: { order: 'asc' } },
        deals: {
          where: { status: 'open' },
          include: {
            contact: { select: { id: true, name: true } },
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pipeline) return next(createError('Pipeline not found', 404));

    res.json({ data: pipeline });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipelines
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pipeline = await prisma.pipeline.create({
        data: req.body,
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      res.status(201).json({ data: pipeline });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/pipelines/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipeline.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline not found', 404));

    const pipeline = await prisma.pipeline.update({
      where: { id: req.params.id },
      data: req.body,
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    res.json({ data: pipeline });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pipelines/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipeline.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline not found', 404));

    await prisma.pipeline.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
