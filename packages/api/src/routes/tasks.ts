import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/tasks
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { userId, dealId, status, dueDateFrom, dueDateTo } = req.query;

    const where: Record<string, unknown> = {};

    if (userId) where.userId = userId as string;
    if (dealId) where.dealId = dealId as string;
    if (status) where.status = status as string;

    if (dueDateFrom || dueDateTo) {
      const dueDateFilter: Record<string, Date> = {};
      if (dueDateFrom) dueDateFilter.gte = new Date(dueDateFrom as string);
      if (dueDateTo) dueDateFilter.lte = new Date(dueDateTo as string);
      where.dueDate = dueDateFilter;
    }

    const [total, data] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
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

// GET /api/tasks/counts — grouped counts by status
router.get('/counts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.userId) where.userId = req.query.userId as string;

    const grouped = await prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    const counts: Record<string, number> = { ALL: 0, PENDING: 0, COMPLETED: 0, OVERDUE: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count.id;
      counts.ALL += g._count.id;
    }

    res.json({ data: counts });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true, email: true } },
      },
    });

    if (!task) return next(createError('Task not found', 404));

    res.json({ data: task });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks
router.post(
  '/',
  validate({ title: 'required', userId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await prisma.task.create({
        data: req.body,
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
        },
      });
      res.status(201).json({ data: task });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/tasks/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Task not found', 404));

    const data = { ...req.body };
    if (data.status === 'COMPLETED') {
      data.completedAt = new Date();
    } else if (data.status && data.status !== 'COMPLETED') {
      data.completedAt = null;
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        user: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
        contact: { select: { id: true, name: true } },
      },
    });
    res.json({ data: task });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Task not found', 404));

    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
