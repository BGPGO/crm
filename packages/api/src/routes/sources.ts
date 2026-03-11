import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/sources
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.source.count(),
      prisma.source.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { contacts: true, deals: true } },
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

// GET /api/sources/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const source = await prisma.source.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { contacts: true, deals: true } },
      },
    });

    if (!source) return next(createError('Source not found', 404));

    res.json({ data: source });
  } catch (err) {
    next(err);
  }
});

// POST /api/sources
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const source = await prisma.source.create({ data: req.body });
      res.status(201).json({ data: source });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/sources/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Source not found', 404));

    const source = await prisma.source.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: source });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sources/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.source.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Source not found', 404));

    await prisma.source.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
