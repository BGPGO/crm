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
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
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

    const hostName = req.query.hostName as string | undefined;
    if (hostName) {
      where.hostName = hostName;
    }

    const [total, data] = await Promise.all([
      prisma.calendlyEvent.count({ where }),
      prisma.calendlyEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: period === 'past' ? 'desc' : 'asc' },
        include: {
          contact: {
            select: { id: true, name: true, email: true, phone: true },
          },
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

// GET /api/calendly/config/meetings/hosts — Unique host names for filter
router.get('/meetings/hosts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hosts = await prisma.calendlyEvent.findMany({
      where: { hostName: { not: null } },
      select: { hostName: true },
      distinct: ['hostName'],
      orderBy: { hostName: 'asc' },
    });
    res.json({ data: hosts.map(h => h.hostName).filter(Boolean) });
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
