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
  validate({ dealId: 'required', productId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dealId, productId } = req.body as { dealId: string; productId: string };

      const [deal, product] = await Promise.all([
        prisma.deal.findUnique({ where: { id: dealId } }),
        prisma.product.findUnique({ where: { id: productId } }),
      ]);

      if (!deal) return next(createError('Deal not found', 404));
      if (!product) return next(createError('Product not found', 404));

      const dealProduct = await prisma.dealProduct.create({
        data: {
          deal: { connect: { id: dealId } },
          product: { connect: { id: productId } },
          quantity: parseInt(req.body.quantity) || 1,
          unitPrice: parseFloat(req.body.unitPrice) || Number(product.price),
          discount: parseFloat(req.body.discount) || 0,
          discountMonths: req.body.discountMonths != null ? (parseInt(req.body.discountMonths) || null) : null,
          setupPrice: req.body.setupPrice != null ? (parseFloat(req.body.setupPrice) || null) : null,
          setupInstallments: req.body.setupInstallments != null ? (parseInt(req.body.setupInstallments) || null) : null,
          recurrenceValue: req.body.recurrenceValue != null ? (parseFloat(req.body.recurrenceValue) || null) : null,
        },
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

    const data: Record<string, unknown> = {};
    if (req.body.quantity !== undefined) data.quantity = parseInt(req.body.quantity) || 1;
    if (req.body.unitPrice !== undefined) data.unitPrice = parseFloat(req.body.unitPrice);
    if (req.body.discount !== undefined) data.discount = parseFloat(req.body.discount) || 0;
    if (req.body.discountMonths !== undefined) data.discountMonths = req.body.discountMonths ? parseInt(req.body.discountMonths) : null;
    if (req.body.setupPrice !== undefined) data.setupPrice = req.body.setupPrice ? parseFloat(req.body.setupPrice) : null;
    if (req.body.setupInstallments !== undefined) data.setupInstallments = req.body.setupInstallments ? parseInt(req.body.setupInstallments) : null;
    if (req.body.recurrenceValue !== undefined) data.recurrenceValue = req.body.recurrenceValue ? parseFloat(req.body.recurrenceValue) : null;

    const dealProduct = await prisma.dealProduct.update({
      where: { id: req.params.id },
      data,
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
