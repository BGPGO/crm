import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/teams
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.team.count(),
      prisma.team.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { users: true } },
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

// GET /api/teams/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
      },
    });

    if (!team) return next(createError('Team not found', 404));

    res.json({ data: team });
  } catch (err) {
    next(err);
  }
});

// POST /api/teams
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const team = await prisma.team.create({ data: req.body });
      res.status(201).json({ data: team });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/teams/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Team not found', 404));

    const team = await prisma.team.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: team });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Team not found', 404));

    await prisma.team.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
