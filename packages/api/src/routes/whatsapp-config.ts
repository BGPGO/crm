import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/whatsapp-config — Get WhatsApp config (first record or create default)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.whatsAppConfig.findFirst();

    if (!config) {
      config = await prisma.whatsAppConfig.create({ data: {} });
    }

    // Mask openaiApiKey
    const data = {
      ...config,
      openaiApiKey: config.openaiApiKey
        ? `${config.openaiApiKey.slice(0, 8)}...${config.openaiApiKey.slice(-4)}`
        : null,
    };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// PUT /api/whatsapp-config — Update config fields
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.whatsAppConfig.findFirst();

    if (!config) {
      config = await prisma.whatsAppConfig.create({ data: {} });
    }

    const allowedFields = [
      'evolutionApiUrl', 'evolutionApiKey', 'instanceName', 'baseUrl',
      'companyName', 'companyPhone', 'meetingLink', 'openaiApiKey',
      'botEnabled', 'botSystemPrompt', 'welcomeMessage', 'followUpEnabled',
      'leadQualificationEnabled', 'sdrAutoMessageEnabled', 'meetingReminderEnabled',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Don't overwrite secrets with masked values
    const sensitiveFields = ['openaiApiKey', 'evolutionApiKey'];
    for (const field of sensitiveFields) {
      const val = updateData[field];
      if (typeof val === 'string' && val.includes('...')) {
        delete updateData[field];
      }
    }

    const updated = await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    // Mask openaiApiKey in response
    const data = {
      ...updated,
      openaiApiKey: updated.openaiApiKey
        ? `${updated.openaiApiKey.slice(0, 8)}...${updated.openaiApiKey.slice(-4)}`
        : null,
    };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-config/follow-up-steps — Get follow-up steps ordered by order
router.get('/follow-up-steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const steps = await prisma.whatsAppFollowUpStep.findMany({
      orderBy: { order: 'asc' },
    });

    res.json({ data: steps });
  } catch (err) {
    next(err);
  }
});

// PUT /api/whatsapp-config/follow-up-steps — Replace all follow-up steps
router.put('/follow-up-steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { steps } = req.body as {
      steps: Array<{
        order: number;
        delayMinutes: number;
        tone?: string;
      }>;
    };

    if (!Array.isArray(steps)) {
      return next(createError('steps must be an array', 422));
    }

    // Need a config to link steps to
    let config = await prisma.whatsAppConfig.findFirst();
    if (!config) {
      config = await prisma.whatsAppConfig.create({ data: {} });
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.whatsAppFollowUpStep.deleteMany();

      return Promise.all(
        steps.map((step) =>
          tx.whatsAppFollowUpStep.create({
            data: {
              order: step.order,
              delayMinutes: step.delayMinutes,
              tone: (step.tone as any) || 'CASUAL',
              configId: config.id,
            },
          })
        )
      );
    });

    res.json({ data: created });
  } catch (err) {
    next(err);
  }
});

export default router;
