import { Router, Request, Response, NextFunction } from 'express';
import { AutomationActionType } from '@prisma/client';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/automations/stats/global
router.get('/stats/global', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeAutomations, enrollmentsActive, executionsToday] = await Promise.all([
      prisma.automation.count({ where: { status: 'ACTIVE' } }),
      prisma.automationEnrollment.count({ where: { status: 'ACTIVE' } }),
      prisma.automationLog.count({ where: { executedAt: { gte: todayStart } } }),
    ]);

    const errorsRows = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM "AutomationLog"
      WHERE "executedAt" >= ${todayStart}
        AND (result->>'success')::boolean = false
    `;
    const errorsToday = Number(errorsRows[0]?.count ?? 0);

    res.json({ data: { activeAutomations, enrollmentsActive, executionsToday, errorsToday } });
  } catch (err) {
    next(err);
  }
});

// GET /api/automations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const includeSteps = req.query.includeSteps === 'true';

    const [total, data] = await Promise.all([
      prisma.automation.count({ where }),
      prisma.automation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { steps: true, enrollments: true } },
          ...(includeSteps ? { steps: { orderBy: { order: 'asc' as const } } } : {}),
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
      'SEND_WA_TEMPLATE',
      'WAIT', 'UPDATE_FIELD', 'MOVE_PIPELINE_STAGE', 'CONDITION', 'MARK_LOST',
      'WAIT_FOR_RESPONSE',
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
      // Snapshot old steps so we can map enrollment progress by order
      const oldSteps = await tx.automationStep.findMany({ where: { automationId } });
      const oldStepOrderById = new Map<string, number>();
      for (const s of oldSteps) oldStepOrderById.set(s.id, s.order);

      // Snapshot active enrollments and their current step order
      const activeEnrollments = await tx.automationEnrollment.findMany({
        where: { automationId, status: { in: ['ACTIVE', 'PAUSED'] } },
        select: { id: true, currentStepId: true },
      });

      // Clear references before deleting steps
      await tx.automationEnrollment.updateMany({ where: { automationId }, data: { currentStepId: null } });
      await tx.automationStep.updateMany({ where: { automationId }, data: { nextStepId: null, trueStepId: null, falseStepId: null } });
      // Delete logs that reference old steps (FK constraint blocks step deletion otherwise)
      const oldStepIds = oldSteps.map((s) => s.id);
      if (oldStepIds.length > 0) {
        await tx.automationLog.deleteMany({ where: { stepId: { in: oldStepIds } } });
      }
      await tx.automationStep.deleteMany({ where: { automationId } });

      // Phase 1: Create all steps WITHOUT references (to get new IDs)
      const oldToNewId = new Map<string, string>();
      const createdSteps = [];

      for (const step of steps) {
        const newStep = await tx.automationStep.create({
          data: {
            order: step.order,
            actionType: step.actionType as AutomationActionType,
            config: step.config as any,
            automationId,
          },
        });
        if (step.id) oldToNewId.set(step.id, newStep.id);
        createdSteps.push({ ...newStep, _oldNextStepId: step.nextStepId, _oldTrueStepId: step.trueStepId, _oldFalseStepId: step.falseStepId });
      }

      // Phase 2: Update references with new IDs
      for (const step of createdSteps) {
        const nextStepId = step._oldNextStepId ? (oldToNewId.get(step._oldNextStepId) || null) : null;
        const trueStepId = step._oldTrueStepId ? (oldToNewId.get(step._oldTrueStepId) || null) : null;
        const falseStepId = step._oldFalseStepId ? (oldToNewId.get(step._oldFalseStepId) || null) : null;

        if (nextStepId || trueStepId || falseStepId) {
          await tx.automationStep.update({
            where: { id: step.id },
            data: { nextStepId, trueStepId, falseStepId },
          });
        }
      }

      // Phase 3: Preserve enrollment progress by mapping old step order → new step
      // Build a sorted list of new steps by order for quick lookup
      const newStepsByOrder = [...createdSteps].sort((a, b) => a.order - b.order);
      const firstNewStep = newStepsByOrder[0];

      for (const enrollment of activeEnrollments) {
        const oldOrder = enrollment.currentStepId
          ? oldStepOrderById.get(enrollment.currentStepId)
          : undefined;

        let targetStep = firstNewStep; // fallback: start from beginning

        if (oldOrder !== undefined) {
          // Find the new step at the same order, or the next one after it
          const sameOrNext = newStepsByOrder.find((s) => s.order >= oldOrder);
          if (sameOrNext) {
            targetStep = sameOrNext;
          } else {
            // Was past the last step — mark as completed
            await tx.automationEnrollment.update({
              where: { id: enrollment.id },
              data: { status: 'COMPLETED', completedAt: new Date(), currentStepId: null, nextActionAt: null },
            });
            continue;
          }
        }

        await tx.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { currentStepId: targetStep.id },
          // Keep existing nextActionAt — don't reset the timer
        });
      }

      return createdSteps;
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
          contact: { select: { name: true, email: true, phone: true } },
          currentStep: { select: { id: true, order: true, actionType: true, config: true } },
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

    // Build step map for quick lookup
    const stepMap = new Map(automation.steps.map(s => [s.id, s]));

    // Find root step (not referenced by any other step)
    const referencedIds = new Set<string>();
    automation.steps.forEach(s => {
      if (s.nextStepId) referencedIds.add(s.nextStepId);
      if (s.trueStepId) referencedIds.add(s.trueStepId);
      if (s.falseStepId) referencedIds.add(s.falseStepId);
    });
    const rootStep = automation.steps.find(s => !referencedIds.has(s.id));

    // Traverse the flow tree
    let currentStepId: string | null = rootStep?.id || null;
    let safety = 0;
    const MAX_STEPS = 50;

    while (currentStepId && safety < MAX_STEPS) {
      safety++;
      const step = stepMap.get(currentStepId);
      if (!step) break;

      const start = Date.now();

      if (step.actionType === 'WAIT') {
        log.push({
          stepId: step.id,
          order: step.order,
          actionType: 'WAIT',
          success: true,
          output: { skipped: true, originalDuration: (step.config as any)?.duration, originalUnit: (step.config as any)?.unit, testMode: 'Timer pulado no teste' },
          durationMs: 0,
        });
        currentStepId = step.nextStepId;
        continue;
      }

      if (step.actionType === 'WAIT_FOR_RESPONSE') {
        const stepConfig = step.config as any;
        log.push({
          stepId: step.id,
          order: step.order,
          actionType: 'WAIT_FOR_RESPONSE',
          success: true,
          output: {
            skipped: true,
            waitHours: stepConfig?.waitHours,
            channel: stepConfig?.channel,
            testMode: 'Wait for response pulado no teste — seguindo caminho "não respondeu" (trueStepId)',
          },
          durationMs: 0,
        });
        // In test mode, follow the "não respondeu" path (trueStepId) by default
        currentStepId = step.trueStepId;
        continue;
      }

      try {
        const result = await executeAction(fakeEnrollment, step);

        log.push({
          stepId: step.id,
          order: step.order,
          actionType: step.actionType,
          success: result.success,
          output: step.actionType === 'CONDITION' ? { ...result.output, branchTaken: result.conditionResult ? 'Sim (true)' : 'Não (false)' } : result.output,
          durationMs: Date.now() - start,
        });

        if (!result.success) break;

        // Follow branches for CONDITIONS
        if (step.actionType === 'CONDITION') {
          currentStepId = result.conditionResult ? step.trueStepId : step.falseStepId;
        } else {
          currentStepId = step.nextStepId;
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
        totalSteps: automation.steps.length,
        log,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
