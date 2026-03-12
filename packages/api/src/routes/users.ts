import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// Fields to select (never expose password)
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  teamId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

// GET /api/users
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { teamId, role } = req.query;

    const where: Record<string, unknown> = {};
    if (teamId) where.teamId = teamId as string;
    if (role) where.role = role as string;

    const [total, data] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          ...userSelect,
          team: { select: { id: true, name: true } },
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

// GET /api/users/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        ...userSelect,
        team: { select: { id: true, name: true } },
        _count: {
          select: { deals: true, tasks: true, activities: true },
        },
      },
    });

    if (!user) return next(createError('User not found', 404));

    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post(
  '/',
  validate({ name: 'required', email: 'required', password: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check email uniqueness
      const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (existing) return next(createError('Email already in use', 409));

      const user = await prisma.user.create({
        data: req.body,
        select: userSelect,
      });
      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/users/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('User not found', 404));

    // If changing email, ensure it's not taken by another user
    if (req.body.email && req.body.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (emailTaken) return next(createError('Email already in use', 409));
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: req.body,
      select: userSelect,
    });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('User not found', 404));

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
