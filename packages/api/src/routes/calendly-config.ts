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
