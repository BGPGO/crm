import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/custom-fields
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { entity } = req.query;
    const where: Record<string, unknown> = {};
    if (entity) where.entity = entity as string;

    const [total, data] = await Promise.all([
      prisma.customField.count({ where }),
      prisma.customField.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ entity: 'asc' }, { name: 'asc' }],
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

// GET /api/custom-fields/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customField = await prisma.customField.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { values: true } },
      },
    });

    if (!customField) return next(createError('Custom field not found', 404));

    res.json({ data: customField });
  } catch (err) {
    next(err);
  }
});

// POST /api/custom-fields
router.post(
  '/',
  validate({ name: 'required', entity: 'required', fieldType: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customField = await prisma.customField.create({ data: req.body });
      res.status(201).json({ data: customField });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/custom-fields/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.customField.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Custom field not found', 404));

    const customField = await prisma.customField.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: customField });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/custom-fields/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.customField.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Custom field not found', 404));

    // Cascade delete will handle values if configured in schema
    await prisma.customField.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
