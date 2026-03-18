import { Router, Request, Response, NextFunction } from 'express';
import { AutomationActionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/automations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.automation.count({ where }),
      prisma.automation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { steps: true, enrollments: true } },
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

// GET /api/automations/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const automation = await prisma.automation.findUnique({
      where: { id: req.params.id },
      include: {
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    });

    if (!automation) return next(createError('Automation not found', 404));

    res.json({ data: automation });
  } catch (err) {
    next(err);
  }
});

// POST /api/automations
router.post(
  '/',
  validate({ name: 'required', triggerType: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, triggerType, triggerConfig = {} } = req.body;
      const automation = await prisma.automation.create({
        data: { name, description, triggerType, triggerConfig },
      });
      res.status(201).json({ data: automation });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/automations/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    const { name, description, triggerType, triggerConfig } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (triggerType !== undefined) data.triggerType = triggerType;
    if (triggerConfig !== undefined) data.triggerConfig = triggerConfig;

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ data: automation });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/automations/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    if (existing.status !== 'DRAFT' && existing.status !== 'ARCHIVED') {
      return next(createError('Only DRAFT or ARCHIVED automations can be deleted', 400));
    }

    await prisma.automation.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/automations/:id/archive
router.post('/:id/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    if (existing.status !== 'PAUSED' && existing.status !== 'DRAFT') {
      return next(createError('Only PAUSED or DRAFT automations can be archived', 400));
    }

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: { status: 'ARCHIVED' },
    });
    res.json({ data: automation });
  } catch (err) {
    next(err);
  }
});

// POST /api/automations/:id/activate
router.post('/:id/activate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    if (existing.status !== 'DRAFT' && existing.status !== 'PAUSED') {
      return next(createError('Only DRAFT or PAUSED automations can be activated', 400));
    }

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });
    res.json({ data: automation });
  } catch (err) {
    next(err);
  }
});

// POST /api/automations/:id/pause
router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    if (existing.status !== 'ACTIVE') {
      return next(createError('Only ACTIVE automations can be paused', 400));
    }

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
    });
    res.json({ data: automation });
  } catch (err) {
    next(err);
  }
});

// GET /api/automations/:id/steps
router.get('/:id/steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    const steps = await prisma.automationStep.findMany({
      where: { automationId: req.params.id },
      orderBy: { order: 'asc' },
    });

    res.json({ data: steps });
  } catch (err) {
    next(err);
  }
});

// PUT /api/automations/:id/steps
router.put('/:id/steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    const { steps } = req.body as {
      steps: Array<{
        id?: string;
        order: number;
        actionType: string;
        config: unknown;
        nextStepId?: string;
        trueStepId?: string;
        falseStepId?: string;
      }>;
    };

    if (!Array.isArray(steps)) {
      return next(createError('steps must be an array', 422));
    }

    // Validate actionType for every step before touching the DB
    const validActionTypes: string[] = [
      'ADD_TAG', 'REMOVE_TAG', 'SEND_EMAIL', 'SEND_WHATSAPP', 'SEND_WHATSAPP_AI',
      'WAIT', 'UPDATE_FIELD', 'MOVE_PIPELINE_STAGE', 'CONDITION', 'MARK_LOST',
    ];
    for (const step of steps) {
      if (!validActionTypes.includes(step.actionType)) {
        return next(
          createError(
            `Invalid actionType "${step.actionType}". Valid values: ${validActionTypes.join(', ')}`,
            422
          )
        );
      }
    }

    // Wrap delete + create in a transaction so steps are never lost
    const automationId = req.params.id;
    const created = await prisma.$transaction(async (tx) => {
      await tx.automationStep.deleteMany({ where: { automationId } });

      return Promise.all(
        steps.map((step) =>
          tx.automationStep.create({
            data: {
              order: step.order,
              actionType: step.actionType as AutomationActionType,
              config: step.config as any,
              nextStepId: step.nextStepId,
              trueStepId: step.trueStepId,
              falseStepId: step.falseStepId,
              automationId,
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

// GET /api/automations/:id/enrollments
router.get('/:id/enrollments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = { automationId: req.params.id };

    const [total, data] = await Promise.all([
      prisma.automationEnrollment.count({ where }),
      prisma.automationEnrollment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { enrolledAt: 'desc' },
        include: {
          contact: { select: { name: true, email: true } },
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

// GET /api/automations/:id/stats
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Automation not found', 404));

    const baseWhere = { automationId: req.params.id };

    const [total, active, completed, paused, failed] = await Promise.all([
      prisma.automationEnrollment.count({ where: baseWhere }),
      prisma.automationEnrollment.count({ where: { ...baseWhere, status: 'ACTIVE' } }),
      prisma.automationEnrollment.count({ where: { ...baseWhere, status: 'COMPLETED' } }),
      prisma.automationEnrollment.count({ where: { ...baseWhere, status: 'PAUSED' } }),
      prisma.automationEnrollment.count({ where: { ...baseWhere, status: 'FAILED' } }),
    ]);

    res.json({ data: { total, active, completed, paused, failed } });
  } catch (err) {
    next(err);
  }
});

// POST /api/automations/:id/test — Run automation in test mode with accelerated timers
router.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const automation = await prisma.automation.findUnique({
      where: { id: req.params.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!automation) return next(createError('Automation not found', 404));

    const { phone } = req.body;
    if (!phone) return next(createError('phone is required', 400));

    // Find or create contact for this phone
    let contact = await prisma.contact.findFirst({ where: { phone } });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { name: `Teste ${phone}`, phone, email: '' },
      });
    }

    // Import executeAction
    const { executeAction } = await import('../services/automationActions');

    // Execute steps sequentially with compressed timers
    const log: Array<{ stepId: string; order: number; actionType: string; success: boolean; output: any; durationMs: number }> = [];

    // Create a fake enrollment object for the executor
    const fakeEnrollment = {
      id: `test-${Date.now()}`,
      contactId: contact.id,
      automationId: automation.id,
      status: 'ACTIVE',
    };

    // Traverse the linear chain: start from step order 1
    const sortedSteps = [...automation.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      const start = Date.now();

      if (step.actionType === 'WAIT') {
        // In test mode, skip waits (just log them)
        log.push({
          stepId: step.id,
          order: step.order,
          actionType: 'WAIT',
          success: true,
          output: { skipped: true, originalDuration: (step.config as any)?.duration, originalUnit: (step.config as any)?.unit, testMode: 'Timer pulado no teste' },
          durationMs: 0,
        });
        continue;
      }

      try {
        const result = await executeAction(fakeEnrollment, step);
        log.push({
          stepId: step.id,
          order: step.order,
          actionType: step.actionType,
          success: result.success,
          output: result.output,
          durationMs: Date.now() - start,
        });

        // For CONDITION: log the branch taken
        if (step.actionType === 'CONDITION') {
          log[log.length - 1].output = {
            ...result.output,
            branchTaken: result.conditionResult ? 'Sim (true)' : 'Não (false)',
          };
        }

        // If a step fails, stop the test
        if (!result.success) {
          break;
        }
      } catch (err: any) {
        log.push({
          stepId: step.id,
          order: step.order,
          actionType: step.actionType,
          success: false,
          output: err?.message || 'Erro desconhecido',
          durationMs: Date.now() - start,
        });
        break;
      }
    }

    // Find conversation for the test phone to return its ID
    const conversation = await prisma.whatsAppConversation.findUnique({ where: { phone } });

    res.json({
      data: {
        automationId: automation.id,
        contactId: contact.id,
        conversationId: conversation?.id || null,
        phone,
        stepsExecuted: log.length,
        totalSteps: sortedSteps.length,
        log,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
