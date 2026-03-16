import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { buildSegmentWhere, SegmentFilter } from '../services/segmentEngine';

const router = Router();

// GET /api/segments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.segment.count(),
      prisma.segment.findMany({
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

// GET /api/segments/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const segment = await prisma.segment.findUnique({
      where: { id: req.params.id },
    });

    if (!segment) return next(createError('Segment not found', 404));

    res.json({ data: segment });
  } catch (err) {
    next(err);
  }
});

// POST /api/segments
router.post(
  '/',
  validate({ name: 'required', filters: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, filters, isActive } = req.body;

      const segment = await prisma.segment.create({
        data: {
          name,
          description: description ?? null,
          filters,
          isActive: isActive ?? true,
        },
      });

      res.status(201).json({ data: segment });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/segments/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.segment.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Segment not found', 404));

    const { name, description, filters, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (filters !== undefined) data.filters = filters;
    if (isActive !== undefined) data.isActive = isActive;

    const segment = await prisma.segment.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: segment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/segments/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.segment.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Segment not found', 404));

    await prisma.segment.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/segments/:id/contacts
router.get('/:id/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const segment = await prisma.segment.findUnique({
      where: { id: req.params.id },
    });

    if (!segment) return next(createError('Segment not found', 404));

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filters = segment.filters as unknown as SegmentFilter[];
    const where = buildSegmentWhere(filters);

    const [total, data] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: true,
          tags: { include: { tag: true } },
          leadScore: true,
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

// POST /api/segments/:id/refresh-count
router.post('/:id/refresh-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const segment = await prisma.segment.findUnique({
      where: { id: req.params.id },
    });

    if (!segment) return next(createError('Segment not found', 404));

    const filters = segment.filters as unknown as SegmentFilter[];
    const where = buildSegmentWhere(filters);

    const contactCount = await prisma.contact.count({ where });

    const updated = await prisma.segment.update({
      where: { id: req.params.id },
      data: { contactCount },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
