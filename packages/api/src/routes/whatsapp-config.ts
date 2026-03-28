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

    // Mask sensitive fields
    const maskSecret = (val: string | null) =>
      val ? `${val.slice(0, 8)}...${val.slice(-4)}` : null;

    const data = {
      ...config,
      openaiApiKey: maskSecret(config.openaiApiKey),
      zapiToken: maskSecret(config.zapiToken),
      zapiClientToken: maskSecret(config.zapiClientToken),
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
      // Credenciais / conexão
      'zapiInstanceId', 'zapiToken', 'zapiClientToken', 'baseUrl',
      'companyName', 'companyPhone', 'botPhoneNumber', 'meetingLink', 'openaiApiKey', 'readAiApiKey',
      // Feature flags
      'botEnabled', 'followUpEnabled', 'leadQualificationEnabled',
      'sdrAutoMessageEnabled', 'meetingReminderEnabled', 'cadenceEnabled',
      // Identidade SDR
      'botName', 'botCompany',
      // Comportamento da conversa
      'conversationRules', 'funnelInstructions', 'welcomeMessage',
      // Modo avançado (prompt bruto — override)
      'botSystemPrompt',
      // Tons de follow-up customizados
      'followUpToneCasual', 'followUpToneReforco', 'followUpToneEncerramento',
      // Contato frio
      'coldContactMaxMessages',
      // Horário comercial
      'businessHoursStart', 'businessHoursEndWeekday', 'businessHoursEndSaturday',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Don't overwrite secrets with masked values
    const sensitiveFields = ['openaiApiKey', 'zapiToken', 'zapiClientToken'];
    for (const field of sensitiveFields) {
      const val = updateData[field];
      if (typeof val === 'string' && val.includes('...')) {
        delete updateData[field];
      }
    }

    // Auto-ativar warmup quando cadências ou follow-ups são ligados sem warmup prévio
    if (
      (updateData.cadenceEnabled === true || updateData.followUpEnabled === true) &&
      !config.warmupEnabled && !config.warmupStartDate
    ) {
      updateData.warmupEnabled = true;
      updateData.warmupStartDate = new Date();
      console.log('[whatsapp-config] Warmup ativado automaticamente ao habilitar cadências/follow-ups');
    }

    const updated = await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    // Sync business hours into sendingWindow module when changed
    if (
      updateData.businessHoursStart !== undefined ||
      updateData.businessHoursEndWeekday !== undefined ||
      updateData.businessHoursEndSaturday !== undefined
    ) {
      const { setBusinessHours } = await import('../utils/sendingWindow');
      setBusinessHours(
        updated.businessHoursStart,
        updated.businessHoursEndWeekday,
        updated.businessHoursEndSaturday,
      );
    }

    // Mask sensitive fields in response
    const maskSecret = (val: string | null) =>
      val ? `${val.slice(0, 8)}...${val.slice(-4)}` : null;

    const data = {
      ...updated,
      openaiApiKey: maskSecret(updated.openaiApiKey),
      zapiToken: maskSecret(updated.zapiToken),
      zapiClientToken: maskSecret(updated.zapiClientToken),
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
