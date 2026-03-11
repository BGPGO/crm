import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/products
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, isActive } = req.query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
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

// GET /api/products/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        dealProducts: {
          include: { deal: { select: { id: true, title: true, status: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) return next(createError('Product not found', 404));

    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await prisma.product.create({ data: req.body });
      res.status(201).json({ data: product });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/products/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Product not found', 404));

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Product not found', 404));

    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
