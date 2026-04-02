import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// Ensure unaccent extension exists (idempotent, runs once at startup)
prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent').catch(() => {});

/**
 * Accent-insensitive search: find Deal IDs matching search term across
 * title, contact name/email, and organization name using PostgreSQL unaccent().
 */
async function searchDealIds(term: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT d.id
    FROM "Deal" d
    LEFT JOIN "Contact" c ON d."contactId" = c.id
    LEFT JOIN "Organization" o ON d."organizationId" = o.id
    WHERE unaccent(COALESCE(d.title, '')) ILIKE '%' || unaccent(${term}) || '%'
       OR unaccent(COALESCE(c.name, ''))  ILIKE '%' || unaccent(${term}) || '%'
       OR unaccent(COALESCE(c.email, '')) ILIKE '%' || unaccent(${term}) || '%'
       OR unaccent(COALESCE(o.name, ''))  ILIKE '%' || unaccent(${term}) || '%'
  `;
  return rows.map(r => r.id);
}

/**
 * Apply accent-insensitive search to a where clause if _searchTerm is present.
 * Mutates the where object in-place.
 */
async function applySearch(where: Record<string, unknown>): Promise<void> {
  const term = (where as any)._searchTerm as string | undefined;
  if (!term) return;
  delete (where as any)._searchTerm;
  const ids = await searchDealIds(term);
  where.id = { in: ids };
}

// ── Shared helper: build Deal where clause from query params ────────────────

function buildDealWhere(query: Record<string, unknown>, basePipelineId?: string): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (basePipelineId) where.pipelineId = basePipelineId;

  const str = (key: string) => query[key] as string | undefined;

  if (str('status')) where.status = str('status');
  if (str('userId')) where.userId = str('userId');
  if (str('stageId')) where.stageId = str('stageId');
  if (str('sourceId')) where.sourceId = str('sourceId');
  const campaignIds = str('campaignIds');
  if (campaignIds) {
    where.campaignId = { in: campaignIds.split(',').filter(Boolean) };
  } else if (str('campaignId')) {
    where.campaignId = str('campaignId');
  }
  // Product filter: deals that have this product
  if (str('productId')) {
    where.products = { some: { productId: str('productId') } };
  }
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

  // Search across title, contact name/email, org name (accent-insensitive)
  const search = str('search');
  if (search) {
    (where as any)._searchTerm = search; // marker for accent-insensitive search
  }

  // Period preset filter
  // For WON deals, period applies to closedAt (when the sale happened)
  // For all others, period applies to createdAt (when the lead entered)
  const period = str('period');
  if (period) {
    const now = new Date();
    let from: Date;
    switch (period) {
      case 'today': {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        from = todayStart;
        break;
      }
      case 'this_week': {
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = start of week
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
        break;
      }
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
    const dateField = where.status === 'WON' ? 'closedAt' : 'createdAt';
    where[dateField] = { gte: from };
  }

  // Helper: parse a date string that may be date-only (YYYY-MM-DD) or datetime (YYYY-MM-DDTHH:mm)
  // For "to" dates without time, append end-of-day; with time, use as-is
  const parseFrom = (val: string): Date => new Date(val);
  const parseTo = (val: string): Date => {
    // If it contains 'T' it has a time component — use as-is
    if (val.includes('T')) return new Date(val);
    // Otherwise it's date-only — use end of day
    return new Date(val + 'T23:59:59.999Z');
  };

  // Created date range
  const createdFrom = str('createdAtFrom');
  const createdTo = str('createdAtTo');
  if (createdFrom || createdTo) {
    const createdFilter: Record<string, Date> = {};
    if (createdFrom) createdFilter.gte = parseFrom(createdFrom);
    if (createdTo) createdFilter.lte = parseTo(createdTo);
    where.createdAt = { ...((where.createdAt as Record<string, Date>) || {}), ...createdFilter };
  }

  // Updated date range
  const updatedFrom = str('updatedAtFrom');
  const updatedTo = str('updatedAtTo');
  if (updatedFrom || updatedTo) {
    const updatedFilter: Record<string, Date> = {};
    if (updatedFrom) updatedFilter.gte = parseFrom(updatedFrom);
    if (updatedTo) updatedFilter.lte = parseTo(updatedTo);
    where.updatedAt = updatedFilter;
  }

  // Closed date range
  const closedFrom = str('closedAtFrom');
  const closedTo = str('closedAtTo');
  if (closedFrom || closedTo) {
    const closedFilter: Record<string, Date> = {};
    if (closedFrom) closedFilter.gte = parseFrom(closedFrom);
    if (closedTo) closedFilter.lte = parseTo(closedTo);
    where.closedAt = closedFilter;
  }

  // Expected close date range
  const expectedFrom = str('expectedCloseDateFrom');
  const expectedTo = str('expectedCloseDateTo');
  if (expectedFrom || expectedTo) {
    const expectedFilter: Record<string, Date> = {};
    if (expectedFrom) expectedFilter.gte = parseFrom(expectedFrom);
    if (expectedTo) expectedFilter.lte = parseTo(expectedTo);
    where.expectedCloseDate = expectedFilter;
  }

  // Filter: deals with at least one overdue task (dueDate < now and not completed)
  if (str('hasOverdueTask') === 'true') {
    where.tasks = {
      some: {
        status: { not: 'COMPLETED' },
        dueDate: { lt: new Date() },
      },
    };
  }

  return where;
}

/**
 * Aplica filtro UTM ao where de deals (async — requer query raw).
 * Filtra pelo primeiro LeadTracking do contato (atribuição de origem).
 */
async function applyUtmFilter(where: Record<string, unknown>, query: Record<string, unknown>): Promise<void> {
  const str = (key: string) => query[key] as string | undefined;
  const utmCampaign = str('utmCampaign');
  const utmSource = str('utmSource');
  const utmMedium = str('utmMedium');

  if (!utmCampaign && !utmSource && !utmMedium) return;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (utmCampaign) { conditions.push(`lt."utmCampaign" = $${params.length + 1}`); params.push(utmCampaign); }
  if (utmSource) { conditions.push(`lt."utmSource" = $${params.length + 1}`); params.push(utmSource); }
  if (utmMedium) { conditions.push(`lt."utmMedium" = $${params.length + 1}`); params.push(utmMedium); }

  const contactIds: Array<{ contactId: string }> = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT lt."contactId"
    FROM "LeadTracking" lt
    WHERE ${conditions.join(' AND ')}
      AND lt."createdAt" = (
        SELECT MIN(lt2."createdAt")
        FROM "LeadTracking" lt2
        WHERE lt2."contactId" = lt."contactId"
      )
  `, ...params);

  if (contactIds.length > 0) {
    where.contactId = { in: contactIds.map(r => r.contactId) };
  } else {
    where.contactId = { in: [] };
  }
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
    await applySearch(where);
    await applyUtmFilter(where, req.query as Record<string, unknown>);

    // When status is not explicitly WON, we need a separate WON count using closedAt
    // because the main where uses createdAt for period filtering
    const status = req.query.status as string | undefined;
    const period = req.query.period as string | undefined;
    const needsSeparateWonCount = period && status !== 'WON';

    let wonWhere: Record<string, unknown> | undefined;
    if (needsSeparateWonCount) {
      wonWhere = buildDealWhere(
        { ...req.query as Record<string, unknown>, status: 'WON' },
        req.params.id,
      );
      await applySearch(wonWhere);
      await applyUtmFilter(wonWhere, req.query as Record<string, unknown>);
    }

    // When no status filter + period: also include WON deals with closedAt in period
    // so they appear in the funnel stages (not just created-this-month deals)
    let enrichedWhere = where;
    if (needsSeparateWonCount && wonWhere && !status) {
      enrichedWhere = {
        pipelineId: req.params.id,
        OR: [
          where,
          wonWhere,
        ],
      };
    }

    const [grouped, totals, countsByStatusRaw, wonCountResult] = await Promise.all([
      prisma.deal.groupBy({
        by: ['stageId'],
        where: enrichedWhere,
        _count: { id: true },
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: enrichedWhere,
        _count: { id: true },
        _sum: { value: true },
      }),
      prisma.deal.groupBy({
        by: ['status'],
        where: enrichedWhere,
        _count: { id: true },
      }),
      wonWhere
        ? prisma.deal.count({ where: wonWhere })
        : Promise.resolve(null),
    ]);

    // Calculate setup vs monthly breakdown for WON deals
    let wonSetupTotal = 0;
    let wonMonthlyTotal = 0;
    let wonTotalValue = 0;

    // Build WON-specific where for value breakdown
    const wonValueWhere = buildDealWhere(
      { ...req.query as Record<string, unknown>, status: 'WON' },
      req.params.id,
    );
    await applySearch(wonValueWhere);
    await applyUtmFilter(wonValueWhere, req.query as Record<string, unknown>);

    const wonProducts = await prisma.dealProduct.findMany({
      where: { deal: wonValueWhere },
      select: { unitPrice: true, quantity: true, setupPrice: true, recurrenceValue: true },
    });

    for (const p of wonProducts) {
      const monthly = Number(p.recurrenceValue ?? p.unitPrice) * p.quantity;
      const setup = Number(p.setupPrice ?? 0);
      wonMonthlyTotal += monthly;
      wonSetupTotal += setup;
    }
    wonTotalValue = wonMonthlyTotal + wonSetupTotal;

    const countsByStatus: Record<string, number> = { OPEN: 0, WON: 0, LOST: 0 };
    for (const g of countsByStatusRaw) {
      countsByStatus[g.status] = g._count.id;
    }
    // Override WON count with closedAt-based count when applicable
    if (wonCountResult !== null) {
      countsByStatus.WON = wonCountResult;
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
        wonValueBreakdown: {
          total: wonTotalValue,
          monthly: wonMonthlyTotal,
          setup: wonSetupTotal,
        },
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
    await applySearch(where);
    await applyUtmFilter(where, req.query as Record<string, unknown>);

    const sortBy = req.query.sortBy as string | undefined;
    let orderBy: Record<string, unknown> = { createdAt: 'desc' };
    if (sortBy === 'value_desc') orderBy = { value: 'desc' };
    else if (sortBy === 'value_asc') orderBy = { value: 'asc' };
    else if (sortBy === 'oldest') orderBy = { createdAt: 'asc' };

    const [total, data] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          stage: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          tasks: { where: { status: 'PENDING' as any }, orderBy: { dueDate: 'asc' as const }, take: 1, select: { id: true, title: true, dueDate: true, type: true } },
        },
      }),
    ]);

    // Sort by nearest pending task dueDate if requested
    let sortedData = data as any[];
    if (sortBy === 'task') {
      sortedData = [...data].sort((a: any, b: any) => {
        const aDate = a.tasks?.[0]?.dueDate;
        const bDate = b.tasks?.[0]?.dueDate;
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      });
    }

    res.json({
      data: sortedData.map((deal) => ({ ...deal, nextTask: deal.tasks?.[0] ?? null })),
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
    await applySearch(baseWhere);
    await applyUtmFilter(baseWhere, req.query as Record<string, unknown>);

    const sortBy = req.query.sortBy as string | undefined;
    let orderBy: Record<string, unknown> = { createdAt: 'desc' };
    if (sortBy === 'value_desc') orderBy = { value: 'desc' };
    else if (sortBy === 'value_asc') orderBy = { value: 'asc' };
    else if (sortBy === 'oldest') orderBy = { createdAt: 'asc' };

    const dealInclude = {
      stage: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      dealContacts: { include: { contact: { select: { id: true, name: true } } } },
      tasks: { where: { status: 'PENDING' as any }, orderBy: { dueDate: 'asc' as const }, take: 1, select: { id: true, title: true, dueDate: true, type: true } },
    };

    // Query each stage in parallel — guarantees `limit` deals per stage
    const stageResults = await Promise.all(
      pipeline.stages.map(async (stage) => {
        const where = { ...baseWhere, stageId: stage.id };
        const [deals, count] = await Promise.all([
          prisma.deal.findMany({
            where,
            take: limit,
            orderBy,
            include: dealInclude as any,
          }),
          prisma.deal.count({ where }),
        ]);

        // Sort by nearest pending task dueDate if requested
        let sortedDeals = deals as any[];
        if (sortBy === 'task') {
          sortedDeals = [...deals].sort((a: any, b: any) => {
            const aDate = a.tasks?.[0]?.dueDate;
            const bDate = b.tasks?.[0]?.dueDate;
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return new Date(aDate).getTime() - new Date(bDate).getTime();
          });
        }

        return { stageId: stage.id, deals: sortedDeals, total: count };
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
          nextTask: (deal as any).tasks?.[0] ?? null,
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
