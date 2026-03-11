import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/organizations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, segment } = req.query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    if (segment) {
      where.segment = segment as string;
    }

    const [total, data] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
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

// GET /api/organizations/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: { orderBy: { name: 'asc' } },
        deals: {
          include: { stage: true, pipeline: true, user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        customFieldValues: { include: { customField: true } },
      },
    });

    if (!organization) {
      return next(createError('Organization not found', 404));
    }

    res.json({ data: organization });
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organization = await prisma.organization.create({
        data: req.body,
      });
      res.status(201).json({ data: organization });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/organizations/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Organization not found', 404));

    const organization = await prisma.organization.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: organization });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/organizations/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Organization not found', 404));

    await prisma.organization.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
