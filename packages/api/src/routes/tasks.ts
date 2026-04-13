import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { logActivity } from '../services/activityLogger';

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

    // Whitelist allowed fields for batch update
    const allowedBatchFields = ['title', 'type', 'dueDate', 'userId', 'description', 'status'];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedBatchFields) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        updateData[key] = (data as Record<string, unknown>)[key];
      }
    }

    // Handle completedAt for status changes
    if (updateData.status === 'COMPLETED') {
      updateData.completedAt = new Date();
    } else if (updateData.status && updateData.status !== 'COMPLETED') {
      updateData.completedAt = null;
    }

    // Convert dueDate string to Date if present
    if (typeof updateData.dueDate === 'string') {
      const dateStr = updateData.dueDate as string;
      if (dateStr.length === 10) {
        updateData.dueDate = new Date(dateStr + 'T12:00:00Z');
      } else {
        updateData.dueDate = new Date(dateStr);
      }
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
      const { title, type, dueDate, userId, dealId, contactId, description } = req.body;
      let parsedDueDate = dueDate;
      if (typeof dueDate === 'string' && dueDate.length > 0) {
        // If date-only (no time component), set to noon UTC to avoid timezone shift
        if (dueDate.length === 10) { // "YYYY-MM-DD"
          parsedDueDate = new Date(dueDate + 'T12:00:00Z');
        } else {
          parsedDueDate = new Date(dueDate);
        }
      }
      const task = await prisma.task.create({
        data: { title, type, dueDate: parsedDueDate, userId, dealId, contactId, description },
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
        },
      });

      // Log activity on the associated deal
      if (task.dealId) {
        const actingUserId = (req as any).user?.id ?? userId;
        const dueDateStr = parsedDueDate
          ? new Date(parsedDueDate).toLocaleDateString('pt-BR')
          : null;
        await logActivity({
          type: 'TASK_CREATED',
          content: dueDateStr
            ? `Tarefa "${title}" criada para ${dueDateStr}`
            : `Tarefa "${title}" criada`,
          userId: actingUserId,
          dealId: task.dealId,
          contactId: task.contactId ?? undefined,
          metadata: { taskId: task.id, taskTitle: title, dueDate: parsedDueDate ?? null },
        });
      }

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

    const { title, type, dueDate, userId, description, status } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (type !== undefined) data.type = type;
    if (dueDate !== undefined) {
      if (typeof dueDate === 'string' && dueDate.length > 0) {
        if (dueDate.length === 10) {
          data.dueDate = new Date(dueDate + 'T12:00:00Z');
        } else {
          data.dueDate = new Date(dueDate);
        }
      } else {
        data.dueDate = dueDate;
      }
    }
    if (userId !== undefined) data.userId = userId;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;

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

    // Log activity on the associated deal
    if (task.dealId) {
      const actingUserId = (req as any).user?.id ?? existing.userId;

      // Status change: COMPLETED
      if (data.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
        await logActivity({
          type: 'TASK_COMPLETED',
          content: `Tarefa "${task.title}" concluída`,
          userId: actingUserId,
          dealId: task.dealId,
          contactId: task.contactId ?? undefined,
          metadata: { taskId: task.id, taskTitle: task.title },
        });
      }
      // dueDate changed (reschedule) — only when not also changing status
      else if (
        data.dueDate !== undefined &&
        existing.dueDate?.toISOString() !== (data.dueDate instanceof Date ? data.dueDate.toISOString() : undefined)
      ) {
        const oldDateStr = existing.dueDate
          ? existing.dueDate.toLocaleDateString('pt-BR')
          : 'sem data';
        const newDateStr = task.dueDate
          ? task.dueDate.toLocaleDateString('pt-BR')
          : 'sem data';
        if (oldDateStr !== newDateStr) {
          await logActivity({
            type: 'TASK_RESCHEDULED',
            content: `Tarefa "${task.title}" reagendada de ${oldDateStr} para ${newDateStr}`,
            userId: actingUserId,
            dealId: task.dealId,
            contactId: task.contactId ?? undefined,
            metadata: { taskId: task.id, taskTitle: task.title, fromDate: existing.dueDate, toDate: task.dueDate },
          });
        }
      }

      // Responsible changed (reassigned)
      if (data.userId !== undefined && data.userId !== existing.userId) {
        const newUser = task.user?.name ?? String(data.userId);
        await logActivity({
          type: 'TASK_REASSIGNED',
          content: `Tarefa "${task.title}" reatribuída para ${newUser}`,
          userId: actingUserId,
          dealId: task.dealId,
          contactId: task.contactId ?? undefined,
          metadata: { taskId: task.id, taskTitle: task.title, fromUserId: existing.userId, toUserId: data.userId },
        });
      }
    }

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

    // Log cancellation on the associated deal
    if (existing.dealId) {
      const actingUserId = (req as any).user?.id ?? existing.userId;
      await logActivity({
        type: 'TASK_CANCELLED',
        content: `Tarefa "${existing.title}" excluída`,
        userId: actingUserId,
        dealId: existing.dealId,
        contactId: existing.contactId ?? undefined,
        metadata: { taskId: existing.id, taskTitle: existing.title },
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
