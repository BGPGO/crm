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
