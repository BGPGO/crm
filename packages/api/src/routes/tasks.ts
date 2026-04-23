import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { logActivity } from '../services/activityLogger';
import { buildDueDatePersist, serializeTaskDueDate, normalizeDueDate } from '../utils/taskDateTime';

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
      const now = new Date();
      const nowMinus3h = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      where.OR = [
        { dueDateFormat: 'UTC', dueDate: { lt: now } },
        { dueDateFormat: 'LEGACY', dueDate: { lt: nowMinus3h } },
      ];
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
      data: data.map(serializeTaskDueDate),
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

    const now = new Date();
    const nowMinus3h = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const [pending, completed, overdue] = await Promise.all([
      prisma.task.count({ where: { ...where, status: 'PENDING', OR: [{ dueDate: null }, { dueDateFormat: 'UTC', dueDate: { gte: now } }, { dueDateFormat: 'LEGACY', dueDate: { gte: nowMinus3h } }] } }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.task.count({ where: { ...where, status: 'PENDING', OR: [{ dueDateFormat: 'UTC', dueDate: { lt: now } }, { dueDateFormat: 'LEGACY', dueDate: { lt: nowMinus3h } }] } }),
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

    // Convert dueDate string to Date if present, marking as UTC format
    if (updateData.dueDate !== undefined) {
      const duePayload = buildDueDatePersist(updateData.dueDate as string | Date | null | undefined);
      updateData.dueDate = duePayload.dueDate;
      updateData.dueDateFormat = duePayload.dueDateFormat;
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

    res.json({ data: serializeTaskDueDate(task) });
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
      const { title, type, dueDate, userId, dealId, contactId, description, meetingSource } = req.body;
      const duePayload = buildDueDatePersist(dueDate);
      // When creating a MEETING task manually, default to HUMANO unless caller specifies otherwise
      const resolvedMeetingSource = meetingSource ?? (type === 'MEETING' ? 'HUMANO' : undefined);
      const task = await prisma.task.create({
        data: {
          title, type, userId, dealId, contactId, description,
          meetingSource: resolvedMeetingSource,
          ...duePayload,
        },
        include: {
          user: { select: { id: true, name: true } },
          deal: { select: { id: true, title: true } },
          contact: { select: { id: true, name: true } },
        },
      });

      // Mirror meetingSource to the Deal whenever a MEETING task is created manually
      if (task.type === 'MEETING' && task.dealId && resolvedMeetingSource) {
        await prisma.deal.update({
          where: { id: task.dealId },
          data: { meetingSource: resolvedMeetingSource },
        });
      }

      // Log activity on the associated deal
      if (task.dealId) {
        const actingUserId = (req as any).user?.id ?? userId;
        const dueDateStr = duePayload.dueDate
          ? duePayload.dueDate.toLocaleDateString('pt-BR')
          : null;
        await logActivity({
          type: 'TASK_CREATED',
          content: dueDateStr
            ? `Tarefa "${title}" criada para ${dueDateStr}`
            : `Tarefa "${title}" criada`,
          userId: actingUserId,
          dealId: task.dealId,
          contactId: task.contactId ?? undefined,
          metadata: { taskId: task.id, taskTitle: title, dueDate: duePayload.dueDate ?? null },
        });
      }

      res.status(201).json({ data: serializeTaskDueDate(task) });
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

    const { title, type, dueDate, userId, description, status, meetingSource } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (type !== undefined) data.type = type;
    if (dueDate !== undefined) {
      const duePayload = buildDueDatePersist(dueDate);
      data.dueDate = duePayload.dueDate;
      data.dueDateFormat = duePayload.dueDateFormat;
    }
    if (userId !== undefined) data.userId = userId;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (meetingSource !== undefined) data.meetingSource = meetingSource;

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

    // Mirror meetingSource to the Deal when task type is set to MEETING or
    // when meetingSource is explicitly updated on an existing MEETING task
    const effectiveType = (data.type as string | undefined) ?? existing.type;
    const effectiveMeetingSource = (data.meetingSource as string | undefined) ?? undefined;
    if (task.dealId && effectiveType === 'MEETING' && effectiveMeetingSource !== undefined) {
      await prisma.deal.update({
        where: { id: task.dealId },
        data: { meetingSource: effectiveMeetingSource as 'SDR_IA' | 'CALENDLY_EMAIL' | 'CALENDLY_LP' | 'HUMANO' },
      });
    }

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
        normalizeDueDate(existing)?.toISOString() !== (data.dueDate instanceof Date ? data.dueDate.toISOString() : undefined)
      ) {
        const normalizedOld = normalizeDueDate(existing);
        const oldDateStr = normalizedOld
          ? normalizedOld.toLocaleDateString('pt-BR')
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

    res.json({ data: serializeTaskDueDate(task) });
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
