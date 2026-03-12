import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/pipeline-stages
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { pipelineId } = req.query;
    const where: Record<string, unknown> = {};
    if (pipelineId) where.pipelineId = pipelineId as string;

    const [total, data] = await Promise.all([
      prisma.pipelineStage.count({ where }),
      prisma.pipelineStage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { order: 'asc' },
        include: {
          pipeline: { select: { id: true, name: true } },
          _count: { select: { deals: true } },
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

// GET /api/pipeline-stages/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: req.params.id },
      include: {
        pipeline: true,
        deals: {
          where: { status: 'OPEN' },
          include: {
            contact: { select: { id: true, name: true } },
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!stage) return next(createError('Pipeline stage not found', 404));

    res.json({ data: stage });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline-stages
router.post(
  '/',
  validate({ name: 'required', pipelineId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Auto-assign order if not provided
      if (req.body.order === undefined) {
        const lastStage = await prisma.pipelineStage.findFirst({
          where: { pipelineId: req.body.pipelineId },
          orderBy: { order: 'desc' },
        });
        req.body.order = lastStage ? lastStage.order + 1 : 0;
      }

      const stage = await prisma.pipelineStage.create({
        data: req.body,
        include: { pipeline: { select: { id: true, name: true } } },
      });
      res.status(201).json({ data: stage });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/pipeline-stages/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipelineStage.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline stage not found', 404));

    const stage = await prisma.pipelineStage.update({
      where: { id: req.params.id },
      data: req.body,
      include: { pipeline: { select: { id: true, name: true } } },
    });
    res.json({ data: stage });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pipeline-stages/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipelineStage.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline stage not found', 404));

    // Check if there are deals in this stage
    const dealsCount = await prisma.deal.count({ where: { stageId: req.params.id } });
    if (dealsCount > 0) {
      return next(
        createError(
          `Cannot delete stage with ${dealsCount} active deal(s). Move or delete the deals first.`,
          409
        )
      );
    }

    await prisma.pipelineStage.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pipeline-stages/reorder — bulk reorder stages
router.patch('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stages } = req.body as { stages: Array<{ id: string; order: number }> };

    if (!Array.isArray(stages) || stages.length === 0) {
      return next(createError('stages must be a non-empty array of { id, order }', 400));
    }

    const updates = await prisma.$transaction(
      stages.map(({ id, order }) =>
        prisma.pipelineStage.update({ where: { id }, data: { order } })
      )
    );

    res.json({ data: updates });
  } catch (err) {
    next(err);
  }
});

export default router;
