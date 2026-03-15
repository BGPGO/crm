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
      const { name, description, triggerType, triggerConfig } = req.body;
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

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: req.body,
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

    // Delete all existing steps, then create new ones
    await prisma.automationStep.deleteMany({ where: { automationId: req.params.id } });

    const created = await Promise.all(
      steps.map((step) =>
        prisma.automationStep.create({
          data: {
            order: step.order,
            actionType: step.actionType as AutomationActionType,
            config: step.config as any,
            nextStepId: step.nextStepId,
            trueStepId: step.trueStepId,
            falseStepId: step.falseStepId,
            automationId: req.params.id,
          },
        })
      )
    );

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

export default router;
