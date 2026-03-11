import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/deal-products?dealId=xxx
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { dealId } = req.query;
    const where: Record<string, unknown> = {};
    if (dealId) where.dealId = dealId as string;

    const [total, data] = await Promise.all([
      prisma.dealProduct.count({ where }),
      prisma.dealProduct.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: true,
          deal: { select: { id: true, title: true } },
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

// GET /api/deal-products/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dealProduct = await prisma.dealProduct.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        deal: { select: { id: true, title: true, status: true } },
      },
    });

    if (!dealProduct) return next(createError('Deal product not found', 404));

    res.json({ data: dealProduct });
  } catch (err) {
    next(err);
  }
});

// POST /api/deal-products
router.post(
  '/',
  validate({ dealId: 'required', productId: 'required', quantity: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dealId, productId } = req.body as { dealId: string; productId: string };

      const [deal, product] = await Promise.all([
        prisma.deal.findUnique({ where: { id: dealId } }),
        prisma.product.findUnique({ where: { id: productId } }),
      ]);

      if (!deal) return next(createError('Deal not found', 404));
      if (!product) return next(createError('Product not found', 404));

      // Use product price as default if unitPrice not provided
      const data = {
        ...req.body,
        unitPrice: req.body.unitPrice ?? product.price,
      };

      const dealProduct = await prisma.dealProduct.create({
        data,
        include: {
          product: true,
          deal: { select: { id: true, title: true } },
        },
      });
      res.status(201).json({ data: dealProduct });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/deal-products/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.dealProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal product not found', 404));

    const dealProduct = await prisma.dealProduct.update({
      where: { id: req.params.id },
      data: req.body,
      include: {
        product: true,
        deal: { select: { id: true, title: true } },
      },
    });
    res.json({ data: dealProduct });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deal-products/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.dealProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal product not found', 404));

    await prisma.dealProduct.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
