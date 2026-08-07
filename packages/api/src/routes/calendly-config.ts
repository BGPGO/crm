import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { resolveSdrOwner } from '../lib/pipelines';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { onStageChanged } from '../services/automationTriggerListener';

const router = Router();

/**
 * A reunião (CalendlyEvent) é a FONTE DA VERDADE do horário. A tarefa de
 * reunião na negociação ("Reunião marcada", "Reunião: ...") é só o lembrete
 * operacional — quando a reunião muda de horário, a tarefa vai junto.
 *
 * Sem isso as duas datas divergem: foi assim que uma reunião "de amanhã 17h"
 * existia só como tarefa, invisível pro card do Início e sem lembrete pro lead.
 */
const MEETING_TASK_TITLE = /reuni[ãa]o/i;

async function syncMeetingTaskDueDate(
  dealId: string | null,
  newStart: Date,
  actingUserId?: string
): Promise<number> {
  if (!dealId) return 0;
  const tasks = await prisma.task.findMany({
    where: { dealId, status: 'PENDING' },
    select: { id: true, title: true },
  });
  const targets = tasks.filter((t) => MEETING_TASK_TITLE.test(t.title));
  if (targets.length === 0) return 0;

  await prisma.task.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    // dueDate passa a ser UTC real — o horário vem da reunião, que é sempre UTC
    data: { dueDate: newStart, dueDateFormat: 'UTC' },
  });

  if (actingUserId) {
    await prisma.activity.create({
      data: {
        type: 'TASK_RESCHEDULED',
        content: `${targets.length} tarefa(s) de reunião movida(s) para o novo horário da reunião`,
        userId: actingUserId,
        dealId,
        metadata: { taskIds: targets.map((t) => t.id), dueDate: newStart.toISOString() },
      },
    }).catch(() => {});
  }
  return targets.length;
}

/** Cancela os lembretes do horário antigo e agenda pro novo (Z-API legado + WABA). */
async function rescheduleMeetingReminders(meetingId: string): Promise<void> {
  const [{ cancelMeetingReminders, scheduleMeetingReminders }, { scheduleWabaMeetingReminders }] =
    await Promise.all([
      import('../services/meetingReminderScheduler'),
      import('../services/wa/meetingReminderWaba'),
    ]);
  await cancelMeetingReminders(meetingId).catch(() => {});
  await scheduleMeetingReminders(meetingId).catch(() => {});
  await scheduleWabaMeetingReminders(meetingId).catch(() => {});
}

/** Cancela os lembretes de uma reunião (Z-API legado + WABA). */
async function cancelAllMeetingReminders(meetingId: string): Promise<void> {
  const [{ cancelMeetingReminders }, { cancelWabaMeetingReminders }] = await Promise.all([
    import('../services/meetingReminderScheduler'),
    import('../services/wa/meetingReminderWaba'),
  ]);
  await cancelMeetingReminders(meetingId).catch(() => {});
  await cancelWabaMeetingReminders(meetingId).catch(() => {});
}

/**
 * Reunião cancelada / no-show → negociação volta pra "Marcar reunião" do
 * próprio funil, com os mesmos efeitos do kanban (activity, webhook,
 * automações, dono SDR). Quem já avançou além de "Reunião agendada"
 * (proposta em diante) NÃO é rebaixado.
 */
async function moveDealParaMarcarReuniao(dealId: string, actingUserId: string | undefined, motivo: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { stage: true } });
  if (!deal) return;

  const target = await prisma.pipelineStage.findFirst({
    where: { pipelineId: deal.pipelineId, name: { contains: 'marcar reuni', mode: 'insensitive' } },
  });
  if (!target || deal.stageId === target.id) return;
  if (deal.stage.order > target.order + 1) return; // já passou de "Reunião agendada"

  const fromStage = deal.stage.name;
  const sdrOwner = resolveSdrOwner({ pipelineId: deal.pipelineId, stageId: target.id, currentUserId: deal.userId });
  await prisma.deal.update({
    where: { id: deal.id },
    data: { stageId: target.id, ...(sdrOwner ? { userId: sdrOwner } : {}) },
  });

  await logActivity({
    type: 'STAGE_CHANGE',
    content: `Etapa alterada de "${fromStage}" para "${target.name}" (${motivo})`,
    userId: actingUserId ?? deal.userId,
    dealId: deal.id,
    contactId: deal.contactId ?? undefined,
    metadata: { fromStage, toStage: target.name, motivo },
  });
  dispatchWebhook('deal.stage_changed', {
    dealId: deal.id,
    dealTitle: deal.title,
    fromStage,
    toStage: target.name,
  });
  if (deal.contactId) onStageChanged(deal.contactId, target.id, deal.id);
}

// GET /api/calendly/config — Get Calendly config (first record or create default)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.calendlyConfig.findFirst();

    if (!config) {
      config = await prisma.calendlyConfig.create({ data: {} });
    }

    // Mask apiKey
    const data = {
      ...config,
      apiKey: config.apiKey
        ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}`
        : '',
    };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/calendly/config — Update config fields
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.calendlyConfig.findFirst();

    if (!config) {
      config = await prisma.calendlyConfig.create({ data: {} });
    }

    const allowedFields = ['apiKey', 'webhookSecret', 'isActive', 'organizationUri'];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const updated = await prisma.calendlyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    // Mask apiKey in response
    const data = {
      ...updated,
      apiKey: updated.apiKey
        ? `${updated.apiKey.slice(0, 8)}...${updated.apiKey.slice(-4)}`
        : '',
    };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/meetings — List upcoming meetings ordered by proximity
router.get('/meetings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { period } = req.query; // upcoming, fromToday, past, all
    const now = new Date();

    const where: Record<string, unknown> = {};
    if (period === 'past') {
      where.startTime = { lt: now };
    } else if (period === 'fromToday') {
      // De hoje 00:00 (BRT) em diante, TODOS os status — a Central mostra as
      // de hoje que já passaram com o selo (confirmada, no-show, cancelada),
      // igual ao card do Início.
      const todayBRT = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      where.startTime = { gte: new Date(`${todayBRT}T00:00:00-03:00`) };
    } else if (period !== 'all') {
      // Default: upcoming
      where.startTime = { gte: now };
      where.status = 'active';
    }

    // Filter by responsible: check deal owner OR Calendly hostName
    const hostName = req.query.hostName as string | undefined;
    if (hostName) {
      // Find dealIds where the deal owner matches
      const matchingDeals = await prisma.deal.findMany({
        where: { user: { name: hostName } },
        select: { id: true },
      });
      const matchingDealIds = matchingDeals.map(d => d.id);

      where.OR = [
        { hostName },
        ...(matchingDealIds.length > 0 ? [{ dealId: { in: matchingDealIds } }] : []),
      ];
    }

    // For "all" period, order newest first so recent meetings aren't cut off by limit
    const orderBy = period === 'all'
      ? { startTime: 'desc' as const }
      : period === 'past'
        ? { startTime: 'desc' as const }
        : { startTime: 'asc' as const };

    // Filter by CRM user id e/ou funil: reuniões onde a pessoa é dona OU closer
    // da deal. O match pelo host do Calendly (primeiro nome, ex. "Oliver
    // Wittmann Wilsmann" vs "Oliver") vale SÓ para reunião sem deal vinculada:
    // quando a deal existe, dono/closer mandam — senão a reunião agendada pelo
    // link de um usuário aparece pra ele mesmo depois de repassada a outro
    // responsável. pipelineId filtra pelo funil da deal vinculada.
    // Pós-filtro é seguro aqui: o conjunto upcoming/past consultado é pequeno.
    const filterUserId = req.query.userId as string | undefined;
    const filterPipelineId = req.query.pipelineId as string | undefined;
    if (filterUserId || filterPipelineId) {
      const [filterUser, all] = await Promise.all([
        filterUserId
          ? prisma.user.findUnique({ where: { id: filterUserId }, select: { name: true } })
          : Promise.resolve(null),
        prisma.calendlyEvent.findMany({
          where,
          take: 500,
          orderBy,
          include: {
            contact: { select: { id: true, name: true, email: true, phone: true } },
          },
        }),
      ]);

      const dealIds = all.map(m => m.dealId).filter((id): id is string => !!id);
      const dealMap = new Map<string, { userId: string; closerId: string | null; pipelineId: string; ownerName: string | null }>();
      if (dealIds.length > 0) {
        const deals = await prisma.deal.findMany({
          where: { id: { in: dealIds } },
          select: { id: true, userId: true, closerId: true, pipelineId: true, user: { select: { name: true } } },
        });
        deals.forEach(d => dealMap.set(d.id, { userId: d.userId, closerId: d.closerId, pipelineId: d.pipelineId, ownerName: d.user?.name ?? null }));
      }

      const firstName = (filterUser?.name || '').trim().split(/\s+/)[0]?.toLowerCase();
      const filtered = all.filter(m => {
        const d = m.dealId ? dealMap.get(m.dealId) : undefined;
        // Filtro de funil: reunião precisa ter deal no funil pedido
        if (filterPipelineId && (!d || d.pipelineId !== filterPipelineId)) return false;
        if (!filterUserId) return true;
        if (d) return d.userId === filterUserId || d.closerId === filterUserId;
        if (firstName && (m.hostName || '').toLowerCase().includes(firstName)) return true;
        return false;
      });

      const pageData = filtered.slice(skip, skip + limit).map(m => ({
        ...m,
        dealOwnerName: m.dealId ? dealMap.get(m.dealId)?.ownerName ?? null : null,
      }));

      return res.json({
        data: pageData,
        meta: { total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) },
      });
    }

    const [total, data] = await Promise.all([
      prisma.calendlyEvent.count({ where }),
      prisma.calendlyEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          contact: {
            select: { id: true, name: true, email: true, phone: true },
          },
        },
      }),
    ]);

    // Batch load deal owners (CalendlyEvent.dealId has no Prisma relation)
    const dealIds = data.map(m => m.dealId).filter((id): id is string => !!id);
    const dealOwners = new Map<string, string>();
    if (dealIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, user: { select: { name: true } } },
      });
      deals.forEach(d => { if (d.user?.name) dealOwners.set(d.id, d.user.name); });
    }

    const enrichedData = data.map(m => ({
      ...m,
      dealOwnerName: m.dealId ? dealOwners.get(m.dealId) || null : null,
    }));

    res.json({
      data: enrichedData,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/meetings/hosts — Unique responsible names for filter
// Uses deal owner (CRM responsible) with fallback to Calendly hostName
router.get('/meetings/hosts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get all meetings with dealId to resolve deal owners
    const meetings = await prisma.calendlyEvent.findMany({
      where: { OR: [{ hostName: { not: null } }, { dealId: { not: null } }] },
      select: { hostName: true, dealId: true },
    });

    const dealIds = meetings.map(m => m.dealId).filter((id): id is string => !!id);
    const dealOwners = new Map<string, string>();
    if (dealIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: { id: { in: [...new Set(dealIds)] } },
        select: { id: true, user: { select: { name: true } } },
      });
      deals.forEach(d => { if (d.user?.name) dealOwners.set(d.id, d.user.name); });
    }

    // Collect unique names: dealOwnerName preferred, fallback to hostName
    const nameSet = new Set<string>();
    meetings.forEach(m => {
      const name = (m.dealId && dealOwners.get(m.dealId)) || m.hostName;
      if (name) nameSet.add(name);
    });

    res.json({ data: [...nameSet].sort() });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/meetings/stats — Meeting counts
router.get('/meetings/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [today, thisWeek, total] = await Promise.all([
      prisma.calendlyEvent.count({ where: { startTime: { gte: todayStart, lt: todayEnd }, status: 'active' } }),
      prisma.calendlyEvent.count({ where: { startTime: { gte: now, lt: weekEnd }, status: 'active' } }),
      prisma.calendlyEvent.count({ where: { startTime: { gte: now }, status: 'active' } }),
    ]);

    res.json({ data: { today, thisWeek, total } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/calendly/config/meetings/:id/confirmation — confirmação MANUAL da reunião
// body: { status: 'CONFIRMED' | 'PENDING' | 'DECLINED' | 'NO_SHOW' }
router.patch('/meetings/:id/confirmation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !['CONFIRMED', 'PENDING', 'DECLINED', 'NO_SHOW'].includes(status)) {
      return next(createError('status must be CONFIRMED, PENDING, DECLINED or NO_SHOW', 400));
    }

    const meeting = await prisma.calendlyEvent.findUnique({ where: { id: req.params.id } });
    if (!meeting) return next(createError('Meeting not found', 404));

    const actingUser = (req as any).user as { id: string; name: string } | undefined;
    const updated = await prisma.calendlyEvent.update({
      where: { id: meeting.id },
      data: {
        confirmationStatus: status,
        confirmedAt: status === 'CONFIRMED' ? new Date() : null,
        confirmedByName: status === 'PENDING' ? null : actingUser?.name ?? null,
      },
    });

    // Registra no histórico da negociação
    if (meeting.dealId && actingUser?.id) {
      const label =
        status === 'CONFIRMED'
          ? `Reunião de ${meeting.startTime.toLocaleDateString('pt-BR')} confirmada`
          : status === 'DECLINED'
            ? `Lead avisou que NÃO vem na reunião de ${meeting.startTime.toLocaleDateString('pt-BR')}`
            : status === 'NO_SHOW'
              ? `Lead NÃO compareceu (no-show) na reunião de ${meeting.startTime.toLocaleDateString('pt-BR')}`
              : `Confirmação da reunião de ${meeting.startTime.toLocaleDateString('pt-BR')} desfeita`;
      await prisma.activity.create({
        data: {
          type: 'MEETING',
          content: label,
          userId: actingUser.id,
          dealId: meeting.dealId,
          contactId: meeting.contactId,
          metadata: { meetingId: meeting.id, confirmationStatus: status },
        },
      });
    }

    // No-show → lead precisa remarcar: negociação volta pra "Marcar reunião"
    if (status === 'NO_SHOW' && meeting.dealId) {
      await moveDealParaMarcarReuniao(meeting.dealId, actingUser?.id, 'no-show na reunião');
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/calendly/config/meetings/:id/status — cancela ou reativa a reunião manualmente
// body: { status: 'canceled' | 'active' }
router.patch('/meetings/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !['canceled', 'active'].includes(status)) {
      return next(createError('status must be canceled or active', 400));
    }

    const meeting = await prisma.calendlyEvent.findUnique({ where: { id: req.params.id } });
    if (!meeting) return next(createError('Meeting not found', 404));

    const actingUser = (req as any).user as { id: string; name: string } | undefined;
    const updated = await prisma.calendlyEvent.update({
      where: { id: meeting.id },
      data: {
        status,
        // mexeu no status → confirmação volta pro zero
        confirmationStatus: 'PENDING',
        confirmedAt: null,
        confirmedByName: null,
      },
    });

    if (meeting.dealId && actingUser?.id) {
      const label =
        status === 'canceled'
          ? `Reunião de ${meeting.startTime.toLocaleDateString('pt-BR')} cancelada`
          : `Reunião de ${meeting.startTime.toLocaleDateString('pt-BR')} reativada`;
      await prisma.activity.create({
        data: {
          type: 'MEETING',
          content: label,
          userId: actingUser.id,
          dealId: meeting.dealId,
          contactId: meeting.contactId,
          metadata: { meetingId: meeting.id, status },
        },
      });
    }

    // Reunião cancelada não pode seguir lembrando o lead. Só a guarda do envio
    // segurava isso (o agendador legado nem recheca o status no disparo), e os
    // lembretes ficavam PENDING pra sempre. Reativar volta a agendar — sem isso,
    // reunião reativada ficaria sem lembrete nenhum.
    if (status === 'canceled') {
      await cancelAllMeetingReminders(meeting.id);
    } else {
      await rescheduleMeetingReminders(meeting.id);
    }

    // Cancelou → precisa remarcar: negociação volta pra "Marcar reunião"
    if (status === 'canceled' && meeting.dealId) {
      await moveDealParaMarcarReuniao(meeting.dealId, actingUser?.id, 'reunião cancelada');
    }

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/calendly/config/meetings/:id/reschedule — reagenda manualmente (mantém a duração)
// body: { startTime: ISO string }
router.patch('/meetings/:id/reschedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { startTime } = req.body as { startTime?: string };
    const newStart = startTime ? new Date(startTime) : null;
    if (!newStart || isNaN(newStart.getTime())) {
      return next(createError('startTime inválido', 400));
    }

    const meeting = await prisma.calendlyEvent.findUnique({ where: { id: req.params.id } });
    if (!meeting) return next(createError('Meeting not found', 404));

    const fmt = (d: Date) =>
      d.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    const oldLabel = fmt(meeting.startTime);
    const duration = meeting.endTime.getTime() - meeting.startTime.getTime();

    const actingUser = (req as any).user as { id: string; name: string } | undefined;
    const updated = await prisma.calendlyEvent.update({
      where: { id: meeting.id },
      data: {
        startTime: newStart,
        endTime: new Date(newStart.getTime() + duration),
        status: 'active',
        rescheduledAt: new Date(),
        // novo horário → precisa confirmar de novo
        confirmationStatus: 'PENDING',
        confirmedAt: null,
        confirmedByName: null,
      },
    });

    if (meeting.dealId && actingUser?.id) {
      await prisma.activity.create({
        data: {
          type: 'MEETING',
          content: `Reunião reagendada de ${oldLabel} para ${fmt(newStart)}`,
          userId: actingUser.id,
          dealId: meeting.dealId,
          contactId: meeting.contactId,
          metadata: { meetingId: meeting.id, rescheduledFrom: meeting.startTime.toISOString(), rescheduledTo: newStart.toISOString() },
        },
      });
    }

    // Tarefa de reunião acompanha o novo horário (evita as duas datas divergirem)
    const tasksMoved = await syncMeetingTaskDueDate(meeting.dealId, newStart, actingUser?.id);

    // Lembretes do horário antigo são cancelados e reagendados pro novo.
    // skipReminders=true quando o operador não quer avisar o lead de novo.
    const skipReminders = (req.body as { skipReminders?: boolean }).skipReminders === true;
    if (!skipReminders) await rescheduleMeetingReminders(meeting.id);

    res.json({ data: updated, meta: { tasksMoved, remindersRescheduled: !skipReminders } });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/meetings/confirmation-summary — reuniões por funil
// (total ativas, confirmadas, pendentes, recusadas, canceladas) + lista.
// ?range=today (padrão) | tomorrow | week (hoje até domingo) | all (de hoje em diante)
router.get('/meetings/confirmation-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Dia em BRT (UTC-3 fixo desde 2019)
    const todayBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const dayStart = new Date(`${todayBRT}T00:00:00-03:00`);
    const DAY = 24 * 60 * 60 * 1000;
    let rangeStart = dayStart;
    let rangeEnd: Date | null = new Date(dayStart.getTime() + DAY);
    if (req.query.range === 'tomorrow') {
      rangeStart = new Date(dayStart.getTime() + DAY);
      rangeEnd = new Date(dayStart.getTime() + 2 * DAY);
    } else if (req.query.range === 'week') {
      // até o fim do próximo domingo (BRT)
      for (let i = 0; i < 7; i++) {
        const d = new Date(dayStart.getTime() + i * DAY);
        if (d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }) === 'Sun') {
          rangeEnd = new Date(d.getTime() + DAY);
          break;
        }
      }
    } else if (req.query.range === 'all') {
      rangeEnd = null; // tudo de hoje em diante
    }

    const meetings = await prisma.calendlyEvent.findMany({
      where: { startTime: { gte: rangeStart, ...(rangeEnd ? { lt: rangeEnd } : {}) } },
      orderBy: { startTime: 'asc' },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });

    // Resolve o funil via deal vinculada
    const dealIds = meetings.map(m => m.dealId).filter((id): id is string => !!id);
    const dealMap = new Map<string, { pipelineId: string; pipelineName: string; ownerName: string | null; closerName: string | null }>();
    if (dealIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, pipelineId: true, pipeline: { select: { name: true } }, user: { select: { name: true } }, closer: { select: { name: true } } },
      });
      deals.forEach(d => dealMap.set(d.id, { pipelineId: d.pipelineId, pipelineName: d.pipeline?.name ?? 'Sem funil', ownerName: d.user?.name ?? null, closerName: d.closer?.name ?? null }));
    }

    // Link de reagendamento do próprio lead — persistido pelo calendly-webhook
    // em Activity.metadata, casando pelo calendlyEventId do MESMO evento.
    const contactIds = meetings.map(m => m.contactId).filter((id): id is string => !!id);
    const rescheduleLinkByEvent = new Map<string, string>();
    if (dealIds.length > 0 || contactIds.length > 0) {
      const acts = await prisma.activity.findMany({
        where: {
          type: 'MEETING',
          OR: [
            ...(dealIds.length > 0 ? [{ dealId: { in: dealIds } }] : []),
            ...(contactIds.length > 0 ? [{ contactId: { in: contactIds } }] : []),
          ],
        },
        orderBy: { createdAt: 'asc' }, // o mais recente sobrescreve
        select: { metadata: true },
      });
      for (const a of acts) {
        const meta = (a.metadata ?? {}) as Record<string, unknown>;
        if (typeof meta.calendlyEventId === 'string' && typeof meta.rescheduleUrl === 'string') {
          rescheduleLinkByEvent.set(meta.calendlyEventId, meta.rescheduleUrl);
        }
      }
    }

    type Bucket = { pipelineId: string; pipelineName: string; total: number; confirmed: number; pending: number; declined: number; noShow: number; rescheduled: number; canceled: number };
    const buckets = new Map<string, Bucket>();
    const enriched = meetings.map(m => {
      const deal = m.dealId ? dealMap.get(m.dealId) : undefined;
      const pipelineId = deal?.pipelineId ?? 'none';
      const pipelineName = deal?.pipelineName ?? 'Sem funil';
      const b = buckets.get(pipelineId) ?? { pipelineId, pipelineName, total: 0, confirmed: 0, pending: 0, declined: 0, noShow: 0, rescheduled: 0, canceled: 0 };
      if (m.status === 'canceled') {
        b.canceled++;
      } else {
        b.total++;
        if (m.rescheduledAt) b.rescheduled++;
        if (m.confirmationStatus === 'CONFIRMED') b.confirmed++;
        else if (m.confirmationStatus === 'DECLINED') b.declined++;
        else if (m.confirmationStatus === 'NO_SHOW') b.noShow++;
        else b.pending++;
      }
      buckets.set(pipelineId, b);
      return {
        id: m.id,
        startTime: m.startTime,
        endTime: m.endTime,
        status: m.status,
        confirmationStatus: m.confirmationStatus,
        confirmedByName: m.confirmedByName,
        rescheduledAt: m.rescheduledAt,
        rescheduleUrl: rescheduleLinkByEvent.get(m.calendlyEventId) ?? null,
        name: m.contact?.name || m.inviteeName || m.inviteeEmail,
        phone: m.contact?.phone ?? null,
        dealId: m.dealId,
        pipelineId,
        pipelineName,
        ownerName: deal?.ownerName ?? m.hostName ?? null,
        closerName: deal?.closerName ?? null,
      };
    });

    res.json({ data: { funis: [...buckets.values()].sort((a, b) => a.pipelineName.localeCompare(b.pipelineName)), meetings: enriched } });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/events — List CalendlyEvents with pagination
router.get('/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      prisma.calendlyEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          contact: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.calendlyEvent.count(),
    ]);

    res.json({
      data: events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/calendly/config/subscribe — Create webhook subscription on Calendly
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.calendlyConfig.findFirst();

    if (!config || !config.apiKey) {
      return next(createError('Calendly API key não configurada', 400));
    }

    if (!config.organizationUri) {
      return next(createError('Organization URI não configurada', 400));
    }

    // The callbackUrl should be the public URL of this API + /api/calendly/webhook
    const { callbackUrl } = req.body;
    if (!callbackUrl) {
      return next(createError('callbackUrl é obrigatório', 400));
    }

    // Create webhook subscription via Calendly API
    const response = await fetch('https://api.calendly.com/webhook_subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        url: callbackUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: config.organizationUri,
        scope: 'organization',
        signing_key: config.webhookSecret || undefined,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[calendly-config] Subscribe error:', errorData);
      return next(
        createError(
          `Erro ao criar webhook no Calendly: ${response.status} - ${JSON.stringify(errorData)}`,
          400
        )
      );
    }

    const result = await response.json();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
