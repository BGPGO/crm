import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/reports/sales — Sales analytics dashboard data
router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Get default pipeline
    const pipeline = await prisma.pipeline.findFirst({
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) {
      return res.json({ data: null });
    }

    // ── 1. Funnel counts (OPEN deals per key stage + total) ──────────────
    const funnelCounts = await prisma.deal.groupBy({
      by: ['stageId'],
      where: { pipelineId: pipeline.id, status: 'OPEN' },
      _count: { id: true },
    });
    const stageMap = new Map(pipeline.stages.map(s => [s.id, s]));
    const funnelByStage: Record<string, number> = {};
    let totalOpen = 0;
    for (const g of funnelCounts) {
      const stage = stageMap.get(g.stageId);
      if (stage) {
        funnelByStage[stage.name] = g._count.id;
        totalOpen += g._count.id;
      }
    }

    // ── 2. WON deals this month and last month ───────────────────────────
    const [wonThisMonth, wonLastMonth, lostThisMonth] = await Promise.all([
      prisma.deal.findMany({
        where: { status: 'WON', closedAt: { gte: thisMonthStart } },
        include: {
          products: { include: { product: { select: { name: true } } } },
          contact: { select: { name: true } },
          organization: { select: { name: true } },
        },
      }),
      prisma.deal.findMany({
        where: { status: 'WON', closedAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        include: {
          products: { include: { product: { select: { name: true } } } },
        },
      }),
      prisma.deal.aggregate({
        where: { status: 'LOST', updatedAt: { gte: thisMonthStart } },
        _count: { id: true },
        _sum: { value: true },
      }),
    ]);

    // ── 3. Sales summary cards ───────────────────────────────────────────
    const wonCount = wonThisMonth.length;
    const wonTotalValue = wonThisMonth.reduce((s, d) => s + Number(d.value ?? 0), 0);
    const wonMonthlyValue = wonThisMonth.reduce((s, d) => {
      const products = d.products ?? [];
      if (products.length === 0) return s + Number(d.value ?? 0);
      return s + products.reduce((ps, p) => ps + Number(p.recurrenceValue ?? p.unitPrice) * p.quantity, 0);
    }, 0);
    const wonSetupValue = wonThisMonth.reduce((s, d) => {
      return s + (d.products ?? []).reduce((ps, p) => ps + Number(p.setupPrice ?? 0), 0);
    }, 0);

    const lostCount = lostThisMonth._count.id;
    const lostValue = Number(lostThisMonth._sum.value ?? 0);

    const totalDealsThisMonth = await prisma.deal.count({
      where: { createdAt: { gte: thisMonthStart } },
    });

    // ── 4. Ticket médio by product (this month vs last month) ────────────
    const productTotals = new Map<string, { total: number; count: number }>();
    const productTotalsLastMonth = new Map<string, { total: number; count: number }>();

    for (const deal of wonThisMonth) {
      for (const dp of deal.products) {
        const name = dp.product.name;
        const value = Number(dp.recurrenceValue ?? dp.unitPrice) * dp.quantity;
        const existing = productTotals.get(name) || { total: 0, count: 0 };
        existing.total += value;
        existing.count += 1;
        productTotals.set(name, existing);
      }
    }

    for (const deal of wonLastMonth) {
      for (const dp of deal.products) {
        const name = dp.product.name;
        const value = Number(dp.recurrenceValue ?? dp.unitPrice) * dp.quantity;
        const existing = productTotalsLastMonth.get(name) || { total: 0, count: 0 };
        existing.total += value;
        existing.count += 1;
        productTotalsLastMonth.set(name, existing);
      }
    }

    const ticketMedio = [...productTotals.entries()].map(([name, data]) => {
      const lastMonth = productTotalsLastMonth.get(name);
      return {
        product: name,
        currentAvg: data.count > 0 ? data.total / data.count : 0,
        currentTotal: data.total,
        currentCount: data.count,
        lastMonthAvg: lastMonth && lastMonth.count > 0 ? lastMonth.total / lastMonth.count : 0,
      };
    }).sort((a, b) => b.currentTotal - a.currentTotal);

    // ── 5. Monthly sales trend (last 6 months) ──────────────────────────
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const wonLast6Months = await prisma.deal.findMany({
      where: { status: 'WON', closedAt: { gte: sixMonthsAgo } },
      include: { products: { include: { product: { select: { name: true } } } } },
      orderBy: { closedAt: 'asc' },
    });

    const monthlyTrend: Array<{ month: string; totalMonthly: number; totalSetup: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = mStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

      let totalMonthly = 0;
      let totalSetup = 0;
      for (const deal of wonLast6Months) {
        const closedAt = deal.closedAt ? new Date(deal.closedAt) : null;
        if (!closedAt || closedAt < mStart || closedAt > mEnd) continue;
        for (const dp of deal.products) {
          totalMonthly += Number(dp.recurrenceValue ?? dp.unitPrice) * dp.quantity;
          totalSetup += Number(dp.setupPrice ?? 0);
        }
      }
      monthlyTrend.push({ month: monthLabel, totalMonthly, totalSetup });
    }

    // ── 6. Sales by client (WON this month) ──────────────────────────────
    const salesByClient = wonThisMonth.map(deal => {
      const clientName = deal.organization?.name || deal.contact?.name || deal.title;
      const products = deal.products.map(p => p.product.name).join(', ') || '—';
      const monthlyValue = deal.products.reduce((s, p) => s + Number(p.recurrenceValue ?? p.unitPrice) * p.quantity, 0);
      const setupValue = deal.products.reduce((s, p) => s + Number(p.setupPrice ?? 0), 0);
      return {
        dealId: deal.id,
        clientName,
        products,
        monthlyValue: monthlyValue || Number(deal.value ?? 0),
        setupValue,
        totalValue: (monthlyValue || Number(deal.value ?? 0)) + setupValue,
      };
    }).sort((a, b) => b.totalValue - a.totalValue);

    // ── 7. Sales by product category (for metric cards) ─────────────────
    // Group WON deals this month by product category keywords
    const categoryKeywords: Record<string, string[]> = {
      'Controladoria': ['controladoria', 'controller'],
      'BI': ['bi', 'business intelligence'],
    };

    const salesByCategory: Record<string, { monthlyTotal: number; setupTotal: number; count: number }> = {};
    for (const deal of wonThisMonth) {
      for (const dp of deal.products) {
        const productName = dp.product.name.toLowerCase();
        for (const [category, keywords] of Object.entries(categoryKeywords)) {
          if (keywords.some(kw => productName.includes(kw))) {
            const existing = salesByCategory[category] || { monthlyTotal: 0, setupTotal: 0, count: 0 };
            existing.monthlyTotal += Number(dp.recurrenceValue ?? dp.unitPrice) * dp.quantity;
            existing.setupTotal += Number(dp.setupPrice ?? 0);
            existing.count += 1;
            salesByCategory[category] = existing;
            break; // Don't double-count if product matches multiple categories
          }
        }
      }
    }

    // ── Response ─────────────────────────────────────────────────────────
    res.json({
      data: {
        funnel: {
          total: totalOpen,
          byStage: funnelByStage,
          stages: pipeline.stages.map(s => ({ id: s.id, name: s.name, order: s.order })),
        },
        summary: {
          wonCount,
          wonTotalValue,
          wonMonthlyValue,
          wonSetupValue,
          lostCount,
          lostValue,
          totalDealsThisMonth,
          conversionRate: totalDealsThisMonth > 0 ? (wonCount / totalDealsThisMonth) * 100 : 0,
          ticketMedioGeral: wonCount > 0 ? wonMonthlyValue / wonCount : 0,
        },
        ticketMedio,
        monthlyTrend,
        salesByClient,
        salesByCategory,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
