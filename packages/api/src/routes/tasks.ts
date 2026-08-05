import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { logActivity } from '../services/activityLogger';
import { buildDueDatePersist, serializeTaskDueDate, normalizeDueDate } from '../utils/taskDateTime';

const router = Router();

// Não existe FK entre Task e CalendlyEvent: o par é inferido pela deal + o
// formato da tarefa. Centralizado aqui pra que "adiar a reunião junto" e
// "cancelar a reunião ao deixar de ser reunião" usem SEMPRE o mesmo critério.
function ehTarefaDeReuniao(task: { type: string; title: string }) {
  return (
    task.type === 'MEETING' ||
    (/reuni[ãa]o/i.test(task.title) && !/^\s*(re)?marcar\b/i.test(task.title))
  );
}

/**
 * Reunião FUTURA e ativa da deal — a única que ainda pode ser cancelada ou
 * movida. Reunião que já aconteceu não é candidata: continua `active` pra
 * sempre no banco e arrastá-la reescreve um fato passado.
 */
async function reuniaoFuturaDaDeal(dealId: string) {
  return prisma.calendlyEvent.findFirst({
    where: { dealId, status: 'active', startTime: { gt: new Date() } },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * A tarefa deixou de ser reunião → cancela a reunião futura da deal e os
 * lembretes dos DOIS canais. Quem decide é a tela (ela pergunta ao usuário);
 * aqui só executa. De propósito NÃO devolve a negociação pra "Marcar reunião",
 * ao contrário do cancelamento pela tela de reuniões: o caso aqui é reunião que
 * nunca deveria existir, não reunião desmarcada pelo lead.
 */
async function cancelarReuniaoDaTarefa(
  task: { id: string; title: string; dealId: string; contactId: string | null },
  actingUserId: string,
) {
  const meeting = await reuniaoFuturaDaDeal(task.dealId);
  if (!meeting) return null;

  await prisma.calendlyEvent.update({
    where: { id: meeting.id },
    data: {
      status: 'canceled',
      confirmationStatus: 'PENDING',
      confirmedAt: null,
      confirmedByName: null,
    },
  });

  const [{ cancelMeetingReminders }, waba] = await Promise.all([
    import('../services/meetingReminderScheduler'),
    import('../services/wa/meetingReminderWaba'),
  ]);
  await cancelMeetingReminders(meeting.id).catch(() => {});
  await waba.cancelWabaMeetingReminders(meeting.id).catch(() => {});

  await logActivity({
    type: 'MEETING',
    content: `Reunião de ${meeting.startTime.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })} cancelada: a tarefa "${task.title}" deixou de ser reunião`,
    userId: actingUserId,
    dealId: task.dealId,
    contactId: task.contactId ?? undefined,
    metadata: { meetingId: meeting.id, taskId: task.id, motivo: 'tipo-da-tarefa' },
  });

  return meeting.id;
}

// GET /api/tasks
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { userId, dealId, status, dueDateFrom, dueDateTo } = req.query;

    const where: Record<string, unknown> = {};

    if (dealId) where.dealId = dealId as string;

    // Brand-scoped status filter (need to merge with brand OR clause below)
    let statusOR: Array<Record<string, unknown>> | undefined;
    if (status === 'OVERDUE') {
      where.status = 'PENDING';
      const now = new Date();
      const nowMinus3h = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      statusOR = [
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

    // Brand filtering: Task has no brand field — filter via contact.brand or deal.brand.
    // Orphan tasks (no contact AND no deal) are shown only for BGP (legacy default).
    const brandClauses: Array<Record<string, unknown>> = [
      { contact: { brand: req.brand } },
      { deal: { brand: req.brand } },
    ];
    if (req.brand === 'BGP') {
      brandClauses.push({ AND: [{ contactId: null }, { dealId: null }] });
    }

    // Merge brand filter with optional statusOR via AND
    const andClauses: Array<Record<string, unknown>> = [{ OR: brandClauses }];
    if (statusOR) andClauses.push({ OR: statusOR });
    // Filtro por pessoa: task de deal pertence ao responsável OU closer da deal
    // (o assignee da task fica obsoleto quando a deal troca de dono — ex. task de
    // reunião criada pro dono da época); task sem deal segue pelo assignee.
    if (userId) {
      andClauses.push({
        OR: [
          { deal: { is: { OR: [{ userId: userId as string }, { closerId: userId as string }] } } },
          { dealId: null, userId: userId as string },
        ],
      });
    }
    where.AND = andClauses;

    const [total, data] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dueDate: 'asc' },
        include: {
          user: { select: { id: true, name: true } },
          deal: {
            select: {
              id: true,
              title: true,
              value: true,
              status: true,
              pipelineId: true,
              stage: { select: { id: true, name: true, color: true, order: true } },
            },
          },
          contact: { select: { id: true, name: true, phone: true, email: true } },
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
    // Mesmo critério de pessoa do GET /tasks: responsável OU closer da deal;
    // task sem deal vai pelo assignee.
    const personId = req.query.userId as string | undefined;
    const personFilter = personId
      ? {
          OR: [
            { deal: { is: { OR: [{ userId: personId }, { closerId: personId }] } } },
            { dealId: null, userId: personId },
          ],
        }
      : null;

    // Brand filter via JOIN with contact/deal (Task has no brand field).
    // Orphans (no contact AND no deal) only count for BGP.
    const brandClauses: Array<Record<string, unknown>> = [
      { contact: { brand: req.brand } },
      { deal: { brand: req.brand } },
    ];
    if (req.brand === 'BGP') {
      brandClauses.push({ AND: [{ contactId: null }, { dealId: null }] });
    }
    const brandFilter = { OR: brandClauses };

    const now = new Date();
    const nowMinus3h = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const personClauses = personFilter ? [personFilter] : [];
    const [pending, completed, overdue] = await Promise.all([
      prisma.task.count({ where: { ...where, status: 'PENDING', AND: [brandFilter, ...personClauses, { OR: [{ dueDate: null }, { dueDateFormat: 'UTC', dueDate: { gte: now } }, { dueDateFormat: 'LEGACY', dueDate: { gte: nowMinus3h } }] }] } }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED', AND: [brandFilter, ...personClauses] } }),
      prisma.task.count({ where: { ...where, status: 'PENDING', AND: [brandFilter, ...personClauses, { OR: [{ dueDateFormat: 'UTC', dueDate: { lt: now } }, { dueDateFormat: 'LEGACY', dueDate: { lt: nowMinus3h } }] }] } }),
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
    const { ids, data, cancelLinkedMeetings } = req.body as {
      ids: string[];
      data: Record<string, unknown>;
      cancelLinkedMeetings?: boolean;
    };

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

    // Tarefas que eram reunião ANTES do update — depois do updateMany o tipo
    // antigo já se perdeu, e é ele que diz quais tinham reunião vinculada.
    const eramReuniao =
      updateData.type !== undefined && updateData.type !== 'MEETING'
        ? (await prisma.task.findMany({
            where: { id: { in: ids }, dealId: { not: null } },
            select: { id: true, title: true, type: true, dealId: true, contactId: true, userId: true },
          })).filter(ehTarefaDeReuniao)
        : [];

    const result = await prisma.task.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });

    // Mesma regra do update individual: quem decide é a tela, aqui só executa.
    let reunioesCanceladas = 0;
    if (cancelLinkedMeetings === true && eramReuniao.length > 0) {
      const actingUserId = (req as any).user?.id;
      for (const t of eramReuniao) {
        const cancelada = await cancelarReuniaoDaTarefa(
          { id: t.id, title: t.title, dealId: t.dealId!, contactId: t.contactId },
          actingUserId ?? t.userId,
        ).catch(() => null);
        if (cancelada) reunioesCanceladas++;
      }
    }

    res.json({ data: { updated: result.count, reunioesCanceladas } });
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
  validate({ title: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, type, dueDate, dealId, contactId, description, meetingSource } = req.body;
      // Tarefa de negociação sem responsável explícito → responsável da deal
      let userId = req.body.userId as string | undefined;
      if (!userId && dealId) {
        const parentDeal = await prisma.deal.findUnique({
          where: { id: dealId },
          select: { userId: true },
        });
        userId = parentDeal?.userId;
      }
      if (!userId) return next(createError('userId is required', 400));
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

// GET /api/tasks/:id/linked-meeting
// A tela usa isso antes de trocar o tipo da tarefa (reunião → ligação): se
// existe reunião futura vinculada, ela pergunta se cancela em vez de deixar a
// reunião viva e o lembrete indo pro lead.
router.get('/:id/linked-meeting', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return next(createError('Task not found', 404));
    if (!task.dealId || !ehTarefaDeReuniao(task)) return res.json({ data: null });

    const meeting = await reuniaoFuturaDaDeal(task.dealId);
    if (!meeting) return res.json({ data: null });

    res.json({
      data: {
        id: meeting.id,
        eventType: meeting.eventType,
        startTime: meeting.startTime,
        inviteeName: meeting.inviteeName,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Task not found', 404));

    const { title, type, dueDate, userId, description, status, meetingSource, cancelLinkedMeeting } = req.body;
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

      // ── Tarefa de reunião: a reunião vai junto ─────────────────────────────
      // Adiar só a tarefa deixava a reunião (e o lembrete do lead) na data
      // antiga — a reunião sumia do Início e ninguém era avisado. Vale pra
      // QUALQUER tela que adie a tarefa (central, /tasks, negociação).
      if (data.dueDate instanceof Date && task.dealId) {
        if (ehTarefaDeReuniao(task)) {
          // Só reunião FUTURA acompanha a tarefa. Antes daqui a busca pegava a
          // reunião ativa mais recente da deal e reunião realizada continua
          // `active` pra sempre — adiar o follow up de uma deal antiga arrastava
          // a reunião que já tinha acontecido pra data nova, ressuscitava ela em
          // "Próximas reuniões" e mandava lembrete pro lead (caso 05/08).
          const meeting = await reuniaoFuturaDaDeal(task.dealId);
          if (meeting && meeting.startTime.getTime() !== data.dueDate.getTime()) {
            const novoInicio = data.dueDate;
            const duracao = meeting.endTime.getTime() - meeting.startTime.getTime();
            await prisma.calendlyEvent.update({
              where: { id: meeting.id },
              data: {
                startTime: novoInicio,
                endTime: new Date(novoInicio.getTime() + duracao),
                rescheduledAt: new Date(),
                // horário novo → confirmação anterior não vale mais
                confirmationStatus: 'PENDING',
                confirmedAt: null,
                confirmedByName: null,
              },
            });
            const fmt = (d: Date) =>
              d.toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              });
            await logActivity({
              type: 'MEETING',
              content: `Reunião movida junto com a tarefa: de ${fmt(meeting.startTime)} para ${fmt(novoInicio)}`,
              userId: actingUserId,
              dealId: task.dealId,
              contactId: task.contactId ?? undefined,
              metadata: { meetingId: meeting.id, taskId: task.id, from: meeting.startTime, to: novoInicio },
            });
            // Lembretes acompanham o novo horário
            const [{ cancelMeetingReminders, scheduleMeetingReminders }, waba] = await Promise.all([
              import('../services/meetingReminderScheduler'),
              import('../services/wa/meetingReminderWaba'),
            ]);
            await cancelMeetingReminders(meeting.id).catch(() => {});
            await scheduleMeetingReminders(meeting.id).catch(() => {});
            await waba.scheduleWabaMeetingReminders(meeting.id).catch(() => {});
          }
        }
      }

      // ── Deixou de ser reunião: a reunião não fica órfã ────────────────────
      // Trocar o tipo (reunião → ligação) não mexia em nada: a reunião seguia
      // viva no card "Próximas reuniões" e o lembrete ia pro lead. Quem decide
      // é a tela — ela pergunta e manda `cancelLinkedMeeting`. Aqui só executa.
      if (cancelLinkedMeeting === true && task.dealId) {
        await cancelarReuniaoDaTarefa(
          { id: task.id, title: task.title, dealId: task.dealId, contactId: task.contactId },
          actingUserId,
        );
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
