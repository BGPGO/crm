import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { requireRole } from '../middleware/auth';

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

// GET /api/users — any authenticated user (needed for dropdowns, assignments)
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

// GET /api/users/:id — any authenticated user
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

// POST /api/users — ADMIN only
router.post(
  '/',
  requireRole('ADMIN'),
  validate({ name: 'required', email: 'required', password: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (existing) return next(createError('Email already in use', 409));

      const { name, email, password, role, teamId, isActive } = req.body;
      const user = await prisma.user.create({
        data: { name, email, password, role: role || 'SELLER', teamId, isActive },
        select: userSelect,
      });
      res.status(201).json({ data: user });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/users/:id — ADMIN only (except self-update for name/email)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('User not found', 404));

    const isSelf = req.user!.id === req.params.id;
    const isAdmin = req.user!.role === 'ADMIN';

    // Non-admins can only update their own name
    if (!isAdmin) {
      if (!isSelf) return next(createError('Permissão insuficiente', 403));
      // Self-update: only allow name
      const { name } = req.body;
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { name },
        select: userSelect,
      });
      return res.json({ data: user });
    }

    // Admin: whitelist fields (prevent mass assignment)
    if (req.body.email && req.body.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: req.body.email } });
      if (emailTaken) return next(createError('Email already in use', 409));
    }

    const { name, email, role, teamId, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (role !== undefined) data.role = role;
    if (teamId !== undefined) data.teamId = teamId;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: userSelect,
    });
    res.json({ data: user });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — ADMIN only, cannot delete yourself
router.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.id === req.params.id) {
      return next(createError('Não é possível excluir sua própria conta', 400));
    }

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('User not found', 404));

    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
