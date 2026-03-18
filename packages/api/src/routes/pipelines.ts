import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// ── Shared helper: build Deal where clause from query params ────────────────

function buildDealWhere(query: Record<string, unknown>, basePipelineId?: string): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (basePipelineId) where.pipelineId = basePipelineId;

  const str = (key: string) => query[key] as string | undefined;

  if (str('status')) where.status = str('status');
  if (str('userId')) where.userId = str('userId');
  if (str('stageId')) where.stageId = str('stageId');
  if (str('sourceId')) where.sourceId = str('sourceId');
  if (str('campaignId')) where.campaignId = str('campaignId');
  if (str('lostReasonId')) where.lostReasonId = str('lostReasonId');
  if (str('organizationId')) where.organizationId = str('organizationId');
  if (str('contactId')) where.contactId = str('contactId');
  if (str('classification')) where.classification = str('classification');

  // Value range
  const valueMin = str('valueMin');
  const valueMax = str('valueMax');
  if (valueMin || valueMax) {
    const valueFilter: Record<string, number> = {};
    if (valueMin) valueFilter.gte = parseFloat(valueMin);
    if (valueMax) valueFilter.lte = parseFloat(valueMax);
    where.value = valueFilter;
  }

  // Search across title, contact name/email, org name
  const search = str('search');
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { contact: { name: { contains: search, mode: 'insensitive' } } },
      { contact: { email: { contains: search, mode: 'insensitive' } } },
      { organization: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // Period preset filter (always applies to createdAt)
  const period = str('period');
  if (period) {
    const now = new Date();
    let from: Date;
    switch (period) {
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_3':
        from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'last_6':
        from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        break;
      case 'this_year':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        from = new Date(0);
    }
    where.createdAt = { gte: from };
  }

  // Created date range
  const createdFrom = str('createdAtFrom');
  const createdTo = str('createdAtTo');
  if (createdFrom || createdTo) {
    const createdFilter: Record<string, Date> = {};
    if (createdFrom) createdFilter.gte = new Date(createdFrom);
    if (createdTo) createdFilter.lte = new Date(createdTo + 'T23:59:59.999Z');
    where.createdAt = { ...((where.createdAt as Record<string, Date>) || {}), ...createdFilter };
  }

  // Updated date range
  const updatedFrom = str('updatedAtFrom');
  const updatedTo = str('updatedAtTo');
  if (updatedFrom || updatedTo) {
    const updatedFilter: Record<string, Date> = {};
    if (updatedFrom) updatedFilter.gte = new Date(updatedFrom);
    if (updatedTo) updatedFilter.lte = new Date(updatedTo + 'T23:59:59.999Z');
    where.updatedAt = updatedFilter;
  }

  // Closed date range
  const closedFrom = str('closedAtFrom');
  const closedTo = str('closedAtTo');
  if (closedFrom || closedTo) {
    const closedFilter: Record<string, Date> = {};
    if (closedFrom) closedFilter.gte = new Date(closedFrom);
    if (closedTo) closedFilter.lte = new Date(closedTo + 'T23:59:59.999Z');
    where.closedAt = closedFilter;
  }

  // Expected close date range
  const expectedFrom = str('expectedCloseDateFrom');
  const expectedTo = str('expectedCloseDateTo');
  if (expectedFrom || expectedTo) {
    const expectedFilter: Record<string, Date> = {};
    if (expectedFrom) expectedFilter.gte = new Date(expectedFrom);
    if (expectedTo) expectedFilter.lte = new Date(expectedTo);
    where.expectedCloseDate = expectedFilter;
  }

  return where;
}

// GET /api/pipelines
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.pipeline.count(),
      prisma.pipeline.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: {
          stages: { orderBy: { order: 'asc' } },
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

// GET /api/pipelines/:id
// Returns pipeline with stages and deal count per stage (no deals inline)
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: req.params.id },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: { _count: { select: { deals: true } } },
        },
        _count: { select: { deals: true } },
      },
    });

    if (!pipeline) return next(createError('Pipeline not found', 404));

    res.json({ data: pipeline });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipelines/:id/summary
// Efficient per-stage counts and totals using groupBy/aggregate
router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pipeline = await prisma.pipeline.findUnique({
      where: { id: req.params.id },
      include: { stages: { orderBy: { order: 'asc' } } },
    });

    if (!pipeline) return next(createError('Pipeline not found', 404));

    const where = buildDealWhere(req.query as Record<string, unknown>, req.params.id);

    const [grouped, totals, countsByStatusRaw] = await Promise.all([
      prisma.deal.groupBy({
        by: ['stageId'],
        where,
        _count: { id: true },
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where,
        _count: { id: true },
        _sum: { value: true },
      }),
      prisma.deal.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
    ]);

    const countsByStatus: Record<string, number> = { OPEN: 0, WON: 0, LOST: 0 };
    for (const g of countsByStatusRaw) {
      countsByStatus[g.status] = g._count.id;
    }

    const groupedMap = new Map(
      grouped.map((g) => [g.stageId, { dealCount: g._count.id, totalValue: g._sum.value }])
    );

    const stages = pipeline.stages.map((stage) => {
      const stats = groupedMap.get(stage.id);
      return {
        id: stage.id,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        dealCount: stats?.dealCount ?? 0,
        totalValue: stats?.totalValue ?? 0,
      };
    });

    res.json({
      data: {
        stages,
        totalDeals: totals._count.id,
        totalValue: totals._sum.value ?? 0,
        countsByStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipelines/:id/deals
// Paginated deals for a pipeline with filters
router.get('/:id/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pipelineId = req.params.id;

    // Validate pipeline exists
    const pipeline = await prisma.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline) return next(createError('Pipeline not found', 404));

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const where = buildDealWhere(req.query as Record<string, unknown>, pipelineId);

    const [total, data] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          stage: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
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

// GET /api/pipelines/:id/deals-by-stage
// Returns all deals grouped by stage in a single request
router.get('/:id/deals-by-stage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pipelineId = req.params.id;

    const pipeline = await prisma.pipeline.findUnique({
      where: { id: pipelineId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) return next(createError('Pipeline not found', 404));

    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

    const baseWhere = buildDealWhere(req.query as Record<string, unknown>, pipelineId);

    const dealInclude = {
      stage: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      dealContacts: { include: { contact: { select: { id: true, name: true } } } },
    };

    // Query each stage in parallel — guarantees `limit` deals per stage
    const stageResults = await Promise.all(
      pipeline.stages.map(async (stage) => {
        const where = { ...baseWhere, stageId: stage.id };
        const [deals, count] = await Promise.all([
          prisma.deal.findMany({
            where,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: dealInclude,
          }),
          prisma.deal.count({ where }),
        ]);
        return { stageId: stage.id, deals, total: count };
      })
    );

    // Collect all unique contactIds across every stage
    const allContactIds = [
      ...new Set(
        stageResults.flatMap((r) => r.deals.map((d) => d.contactId).filter((id): id is string => !!id))
      ),
    ];

    // Single batch query: which contacts have a WhatsApp conversation?
    const contactsWithConversation = new Set<string>();
    if (allContactIds.length > 0) {
      const convs = await prisma.whatsAppConversation.findMany({
        where: { contactId: { in: allContactIds } },
        select: { contactId: true },
      });
      convs.forEach((c) => { if (c.contactId) contactsWithConversation.add(c.contactId); });
    }

    const stages: Record<string, { deals: unknown[]; total: number }> = {};
    for (const result of stageResults) {
      stages[result.stageId] = {
        deals: result.deals.map((deal) => ({
          ...deal,
          hasWhatsAppConversation: deal.contactId ? contactsWithConversation.has(deal.contactId) : false,
        })),
        total: result.total,
      };
    }

    res.json({ data: { stages } });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipelines
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pipeline = await prisma.pipeline.create({
        data: req.body,
        include: { stages: { orderBy: { order: 'asc' } } },
      });
      res.status(201).json({ data: pipeline });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/pipelines/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipeline.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline not found', 404));

    const pipeline = await prisma.pipeline.update({
      where: { id: req.params.id },
      data: req.body,
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    res.json({ data: pipeline });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pipelines/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.pipeline.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Pipeline not found', 404));

    await prisma.pipeline.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
