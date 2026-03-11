import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/lost-reasons
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.lostReason.count(),
      prisma.lostReason.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
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

// GET /api/lost-reasons/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const lostReason = await prisma.lostReason.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { deals: true } },
      },
    });

    if (!lostReason) return next(createError('Lost reason not found', 404));

    res.json({ data: lostReason });
  } catch (err) {
    next(err);
  }
});

// POST /api/lost-reasons
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lostReason = await prisma.lostReason.create({ data: req.body });
      res.status(201).json({ data: lostReason });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/lost-reasons/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.lostReason.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Lost reason not found', 404));

    const lostReason = await prisma.lostReason.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: lostReason });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/lost-reasons/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.lostReason.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Lost reason not found', 404));

    await prisma.lostReason.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
