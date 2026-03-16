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
    if (status === 'OVERDUE') {
      where.status = 'PENDING';
      where.dueDate = { lt: new Date() };
    } else if (status) {
      where.status = status as string;
    }

    if (dueDateFrom || dueDateTo) {
      const existing = (where.dueDate as Record<string, Date>) || {};
      if (dueDateFrom) existing.gte = new Date(dueDateFrom as string);
      if (dueDateTo) existing.lte = new Date(dueDateTo as string);
      where.dueDate = existing;
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

    const [pending, completed, overdue] = await Promise.all([
      prisma.task.count({ where: { ...where, status: 'PENDING', OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }] } }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.task.count({ where: { ...where, status: 'PENDING', dueDate: { lt: new Date() } } }),
    ]);

    const all = pending + completed + overdue;
    const counts = { ALL: all, PENDING: pending, COMPLETED: completed, OVERDUE: overdue };

    res.json({ data: counts });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/batch — update multiple tasks at once
router.patch('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, data } = req.body as { ids: string[]; data: Record<string, unknown> };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return next(createError('ids array is required', 400));
    }
    if (!data || typeof data !== 'object') {
      return next(createError('data object is required', 400));
    }

    // Handle completedAt for status changes
    const updateData = { ...data };
    if (updateData.status === 'COMPLETED') {
      updateData.completedAt = new Date();
    } else if (updateData.status && updateData.status !== 'COMPLETED') {
      updateData.completedAt = null;
    }

    // Convert dueDate string to Date if present
    if (typeof updateData.dueDate === 'string') {
      updateData.dueDate = new Date(updateData.dueDate);
    }

    const result = await prisma.task.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    res.json({ data: { updated: result.count } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/batch — delete multiple tasks at once
router.delete('/batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return next(createError('ids array is required', 400));
    }

    const result = await prisma.task.deleteMany({
      where: { id: { in: ids } },
    });

    res.json({ data: { deleted: result.count } });
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
