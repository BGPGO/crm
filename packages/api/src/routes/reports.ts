import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { getCtwaInsights } from '../services/metaAds/client';

const router = Router();

// GET /api/reports/sales — Sales analytics dashboard data
router.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();

    // ── Date and user filters from query params ──────────────────────────
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const userId = req.query.userId as string | undefined;

    const thisMonthStart = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = dateTo ? (() => {
      const d = new Date(dateTo);
      if (!(dateTo).includes('T')) d.setHours(23, 59, 59, 999);
      return d;
    })() : now;
    const lastMonthStart = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart.getFullYear(), thisMonthStart.getMonth(), 0, 23, 59, 59, 999);

    // Base deal filter (optional userId)
    const userWhere = userId ? { userId } : {};

    // Get default pipeline
    const pipeline = await prisma.pipeline.findFirst({
      where: { brand: req.brand },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!pipeline) {
      return res.json({ data: null });
    }

    // ── 1. Funnel — ALL deals created in period, accumulated ──
    // Includes OPEN + WON + LOST created in the selected date range
    const funnelBaseWhere: Record<string, unknown> = {
      pipelineId: pipeline.id,
      brand: req.brand,
      createdAt: { gte: thisMonthStart, lte: thisMonthEnd },
      ...userWhere,
    };

    const funnelCounts = await prisma.deal.groupBy({
      by: ['stageId'],
      where: funnelBaseWhere,
      _count: { id: true },
    });

    const stageMap = new Map(pipeline.stages.map(s => [s.id, s]));
    const countByOrder = new Map<number, number>();
    let totalAll = 0;
    for (const g of funnelCounts) {
      const stage = stageMap.get(g.stageId);
      if (stage) {
        countByOrder.set(stage.order, (countByOrder.get(stage.order) || 0) + g._count.id);
        totalAll += g._count.id;
      }
    }

    // Accumulated: deals at stage X or any stage AFTER X
    const sortedOrders = [...pipeline.stages].sort((a, b) => a.order - b.order);
    const accumulatedByName = new Map<string, number>();
    for (let i = 0; i < sortedOrders.length; i++) {
      let acc = 0;
      for (let j = i; j < sortedOrders.length; j++) {
        acc += countByOrder.get(sortedOrders[j].order) || 0;
      }
      accumulatedByName.set(sortedOrders[i].name, acc);
    }

    // Key funnel numbers (accumulated) — case-insensitive lookup
    const findAccumulated = (keywords: string[]): number => {
      for (const [name, count] of accumulatedByName.entries()) {
        const lower = name.toLowerCase();
        if (keywords.some(kw => lower.includes(kw))) return count;
      }
      return 0;
    };
    const reunioesMarcadas = findAccumulated(['reunião agendada', 'reunião marcada', 'reuniao']);
    const propostasEnviadas = findAccumulated(['proposta enviada', 'proposta']);

    // Total deals created in period (for conversion rate)
    const totalDealsInPeriod = await prisma.deal.count({
      where: { pipelineId: pipeline.id, brand: req.brand, createdAt: { gte: thisMonthStart, lte: thisMonthEnd }, ...userWhere },
    });

    // ── 2. WON deals this month and last month ───────────────────────────
    const wonDateWhere = { closedAt: { gte: thisMonthStart, lte: thisMonthEnd } };
    const [wonThisMonth, wonLastMonth, lostThisMonth] = await Promise.all([
      prisma.deal.findMany({
        where: { status: 'WON', brand: req.brand, ...wonDateWhere, ...userWhere },
        include: {
          products: { include: { product: { select: { name: true } } } },
          contact: { select: { name: true } },
          organization: { select: { name: true } },
        },
      }),
      prisma.deal.findMany({
        where: { status: 'WON', brand: req.brand, closedAt: { gte: lastMonthStart, lte: lastMonthEnd } },
        include: {
          products: { include: { product: { select: { name: true } } } },
        },
      }),
      prisma.deal.aggregate({
        where: { status: 'LOST', brand: req.brand, updatedAt: { gte: thisMonthStart, lte: thisMonthEnd }, ...userWhere },
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

    // totalDealsInPeriod already calculated above in funnel section

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
      where: { status: 'WON', brand: req.brand, closedAt: { gte: sixMonthsAgo } },
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
          totalLeads: totalAll,
          reunioesMarcadas,
          propostasEnviadas,
          vendas: wonCount,
        },
        summary: {
          wonCount,
          wonTotalValue,
          wonMonthlyValue,
          wonSetupValue,
          lostCount,
          lostValue,
          totalDealsInPeriod,
          conversionRate: totalDealsInPeriod > 0 ? (wonCount / totalDealsInPeriod) * 100 : 0,
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

// ── CTWA: clicks nas campanhas de WhatsApp × conversas iniciadas ──────────────
//
// Junta duas fontes:
//  • Meta Insights (via ContIA): clicks/spend/conversas por anúncio e campanha
//  • Banco do CRM: conversas cuja 1ª mensagem inbound trouxe `referral` da Meta
//    (CTWA) — ground truth de quem chegou de anúncio, com contato vinculado.
// O referral fica em WaMessage.metadata.referral (gravado cru pelo webhook
// desde sempre), então o retroativo funciona até onde o histórico alcança.

interface CtwaConversationRow {
  conversation_id: string;
  started_at: Date;
  source_id: string | null;
  ctwa_clid: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

// GET /api/reports/ctwa-campaigns?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/ctwa-campaigns', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const fromStr = dateRe.test(String(req.query.from)) ? String(req.query.from) : '2026-01-01';
    const toStr = dateRe.test(String(req.query.to))
      ? String(req.query.to)
      : new Date().toISOString().slice(0, 10);

    const fromDate = new Date(`${fromStr}T00:00:00-03:00`);
    const toDate = new Date(`${toStr}T23:59:59.999-03:00`);

    // 1. Conversas iniciadas via anúncio (referral CTWA) no período — 1 linha
    //    por conversa (a 1ª mensagem com referral).
    const convRows = await prisma.$queryRaw<CtwaConversationRow[]>`
      SELECT DISTINCT ON (m."conversationId")
        m."conversationId"                        AS conversation_id,
        m."createdAt"                             AS started_at,
        m.metadata -> 'referral' ->> 'source_id'  AS source_id,
        m.metadata -> 'referral' ->> 'ctwa_clid'  AS ctwa_clid,
        m.metadata -> 'referral' ->> 'source_url' AS source_url,
        m.metadata -> 'referral' ->> 'headline'   AS headline,
        m.metadata -> 'referral' ->> 'body'       AS body,
        ct.id                                     AS contact_id,
        ct.name                                   AS contact_name,
        ct.phone                                  AS contact_phone
      FROM "WaMessage" m
      JOIN "WaConversation" c ON c.id = m."conversationId"
      LEFT JOIN "Contact" ct ON ct.id = c."contactId"
      WHERE m.direction = 'INBOUND'
        AND m.metadata -> 'referral' IS NOT NULL
        AND m."createdAt" >= ${fromDate}
        AND m."createdAt" <= ${toDate}
      ORDER BY m."conversationId", m."createdAt" ASC
    `;

    // 2. Insights da Meta (clicks etc.) — falha graciosa: sem ContIA, o
    //    relatório sai só com o lado do CRM.
    const insights = await getCtwaInsights(fromStr, toStr);

    // 3. Merge: conversa → anúncio (referral.source_id === ad_id) → campanha
    const adToCampaign = new Map<string, { campaignId: string; campaignName: string }>();
    for (const camp of insights?.campaigns ?? []) {
      for (const ad of camp.ads) {
        adToCampaign.set(ad.adId, { campaignId: camp.campaignId, campaignName: camp.campaignName });
      }
    }

    const crmConversations = convRows.map((r) => ({
      conversationId: r.conversation_id,
      startedAt: r.started_at,
      adId: r.source_id,
      sourceUrl: r.source_url,
      headline: r.headline,
      adBody: r.body,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      campaign: r.source_id ? adToCampaign.get(r.source_id) ?? null : null,
    }));

    const crmByCampaign = new Map<string, typeof crmConversations>();
    const semMatch: typeof crmConversations = [];
    for (const conv of crmConversations) {
      if (conv.campaign) {
        const list = crmByCampaign.get(conv.campaign.campaignId) ?? [];
        list.push(conv);
        crmByCampaign.set(conv.campaign.campaignId, list);
      } else {
        semMatch.push(conv);
      }
    }

    const campaigns = (insights?.campaigns ?? []).map((camp) => ({
      ...camp,
      crmConversations: crmByCampaign.get(camp.campaignId) ?? [],
    }));

    const totals = {
      spend: campaigns.reduce((s, c) => s + c.spend, 0),
      clicks: campaigns.reduce((s, c) => s + c.clicks, 0),
      linkClicks: campaigns.reduce((s, c) => s + c.linkClicks, 0),
      conversationsStartedMeta: campaigns.reduce((s, c) => s + c.conversationsStarted, 0),
      conversationsInCrm: crmConversations.length,
    };

    res.json({
      data: {
        from: fromStr,
        to: toStr,
        metaAvailable: !!insights,
        currency: insights?.currency ?? 'BRL',
        totals,
        campaigns,
        conversationsWithoutMatch: semMatch,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
