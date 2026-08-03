import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

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

    const { period } = req.query; // upcoming, past, all
    const now = new Date();

    const where: Record<string, unknown> = {};
    if (period === 'past') {
      where.startTime = { lt: now };
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
    // da deal, ou onde o host do Calendly bate com o primeiro nome (nomes do
    // Calendly diferem dos nomes do CRM, ex. "Oliver Wittmann Wilsmann" vs
    // "Oliver"). pipelineId filtra pelo funil da deal vinculada.
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
        if (d && (d.userId === filterUserId || d.closerId === filterUserId)) return true;
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
// body: { status: 'CONFIRMED' | 'PENDING' | 'DECLINED' }
router.patch('/meetings/:id/confirmation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !['CONFIRMED', 'PENDING', 'DECLINED'].includes(status)) {
      return next(createError('status must be CONFIRMED, PENDING or DECLINED', 400));
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

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/calendly/config/meetings/confirmation-summary — reuniões por funil
// (total ativas, confirmadas, pendentes, recusadas, canceladas) + lista.
// ?range=today (padrão) | week (hoje até domingo)
router.get('/meetings/confirmation-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Dia em BRT (UTC-3 fixo desde 2019)
    const todayBRT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const dayStart = new Date(`${todayBRT}T00:00:00-03:00`);
    let rangeEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (req.query.range === 'week') {
      // até o fim do próximo domingo (BRT)
      for (let i = 0; i < 7; i++) {
        const d = new Date(dayStart.getTime() + i * 24 * 60 * 60 * 1000);
        if (d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }) === 'Sun') {
          rangeEnd = new Date(d.getTime() + 24 * 60 * 60 * 1000);
          break;
        }
      }
    }

    const meetings = await prisma.calendlyEvent.findMany({
      where: { startTime: { gte: dayStart, lt: rangeEnd } },
      orderBy: { startTime: 'asc' },
      include: { contact: { select: { id: true, name: true, phone: true } } },
    });

    // Resolve o funil via deal vinculada
    const dealIds = meetings.map(m => m.dealId).filter((id): id is string => !!id);
    const dealMap = new Map<string, { pipelineId: string; pipelineName: string; ownerName: string | null }>();
    if (dealIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, pipelineId: true, pipeline: { select: { name: true } }, user: { select: { name: true } } },
      });
      deals.forEach(d => dealMap.set(d.id, { pipelineId: d.pipelineId, pipelineName: d.pipeline?.name ?? 'Sem funil', ownerName: d.user?.name ?? null }));
    }

    type Bucket = { pipelineId: string; pipelineName: string; total: number; confirmed: number; pending: number; declined: number; canceled: number };
    const buckets = new Map<string, Bucket>();
    const enriched = meetings.map(m => {
      const deal = m.dealId ? dealMap.get(m.dealId) : undefined;
      const pipelineId = deal?.pipelineId ?? 'none';
      const pipelineName = deal?.pipelineName ?? 'Sem funil';
      const b = buckets.get(pipelineId) ?? { pipelineId, pipelineName, total: 0, confirmed: 0, pending: 0, declined: 0, canceled: 0 };
      if (m.status === 'canceled') {
        b.canceled++;
      } else {
        b.total++;
        if (m.confirmationStatus === 'CONFIRMED') b.confirmed++;
        else if (m.confirmationStatus === 'DECLINED') b.declined++;
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
        name: m.contact?.name || m.inviteeName || m.inviteeEmail,
        phone: m.contact?.phone ?? null,
        dealId: m.dealId,
        pipelineId,
        pipelineName,
        ownerName: deal?.ownerName ?? m.hostName ?? null,
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
