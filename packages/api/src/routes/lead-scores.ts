import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { recalculateAllScores } from '../services/leadScoreEngine';

const router = Router();

// GET /api/lead-scores
// List contacts with their lead scores (paginated, ordered by score desc)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { engagementLevel } = req.query;

    const validLevels = ['ENGAGED', 'INTERMEDIATE', 'DISENGAGED'];
    if (engagementLevel && !validLevels.includes(engagementLevel as string)) {
      return next(createError('engagementLevel inválido. Use: ENGAGED, INTERMEDIATE ou DISENGAGED', 400));
    }

    const where: Record<string, unknown> = {};
    if (engagementLevel) {
      where.engagementLevel = engagementLevel as string;
    }

    // LeadScore has no brand — filter via the related Contact's brand.
    where.contact = { brand: req.brand };

    const [total, data] = await Promise.all([
      prisma.leadScore.count({ where }),
      prisma.leadScore.findMany({
        where,
        skip,
        take: limit,
        orderBy: { score: 'desc' },
        include: {
          contact: {
            include: {
              organization: { select: { id: true, name: true } },
              tags: { include: { tag: true } },
            },
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

// POST /api/lead-scores/recalculate
// Trigger a full recalculation of all lead scores
router.post('/recalculate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await recalculateAllScores();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/lead-scores/rules
// List all lead score rules
router.get('/rules', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.leadScoreRule.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: rules });
  } catch (err) {
    next(err);
  }
});

// POST /api/lead-scores/rules
// Create a new lead score rule
router.post('/rules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, field, operator, value, points, isActive } = req.body;

    if (!name || !field || !operator || value === undefined || points === undefined) {
      return next(createError('Missing required fields: name, field, operator, value, points', 400));
    }

    const rule = await prisma.leadScoreRule.create({
      data: {
        name,
        field,
        operator,
        value: String(value),
        points: Number(points),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    res.status(201).json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// PUT /api/lead-scores/rules/:id
// Update an existing lead score rule
router.put('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.leadScoreRule.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Rule not found', 404));

    const { name, field, operator, value, points, isActive } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (field !== undefined) updateData.field = field;
    if (operator !== undefined) updateData.operator = operator;
    if (value !== undefined) updateData.value = String(value);
    if (points !== undefined) updateData.points = Number(points);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const rule = await prisma.leadScoreRule.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ data: rule });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/lead-scores/rules/:id
// Delete a lead score rule
router.delete('/rules/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.leadScoreRule.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Rule not found', 404));

    await prisma.leadScoreRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
