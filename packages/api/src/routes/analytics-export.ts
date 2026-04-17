/**
 * GET /api/analytics/export
 *
 * Endpoint de exportação de analytics para integração externa (ContIA, BI, etc.).
 * Protegido por API key (header X-API-Key) em vez de JWT para uso servidor-a-servidor.
 *
 * Query params:
 *   empresa_id  — UUID da empresa (obrigatório — validado, mas CRM é single-tenant)
 *   date_from   — ISO date (obrigatório)
 *   date_to     — ISO date (obrigatório)
 *   metrics     — CSV: leads,funnel,email,whatsapp,greatpages (default: todos)
 *
 * NOTA SCHEMA: O CRM é single-tenant — não possui empresa_id nos modelos Prisma.
 * O parâmetro empresa_id é aceito para compatibilidade de interface com o ContIA,
 * mas as queries retornam dados de toda a instância CRM.
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { requireApiKey } from '../middleware/apiKey';

const router = Router();

// ── Validação de UUID ────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

// ── Tipos de resposta ────────────────────────────────────────────────────────

interface LeadsSection {
  totalNewLeads: number;
  byOrigin: Record<string, number>;
  byDay: { date: string; count: number }[];
  leadScoreDistribution: { hot: number; warm: number; cold: number };
}

interface FunnelSection {
  totalEntered: number;
  atStage: Record<string, number>;
  conversionRate: number;
  wonDeals: number;
  wonRevenue: number;
}

interface EmailSection {
  campaigns: number;
  totalSent: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
}

interface WhatsAppSection {
  messagesSent: number;
  messagesDelivered: number;
  replies: number;
  conversions: number;
}

interface GreatPagesSection {
  activeLandingPages: number;
  leadsGenerated: number;
  topLP: { name: string; leads: number }[];
  utmBreakdown: Record<string, number>;
}

interface ExportResponse {
  period: { from: string; to: string };
  leads?: LeadsSection;
  funnel?: FunnelSection;
  email?: EmailSection;
  whatsapp?: WhatsAppSection;
  greatpages?: GreatPagesSection;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normaliza uma data ISO para início do dia (00:00:00.000).
 */
function toStartOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Normaliza uma data ISO para fim do dia (23:59:59.999).
 */
function toEndOfDay(isoDate: string): Date {
  const d = new Date(isoDate);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ── Queries por seção ─────────────────────────────────────────────────────────

async function queryLeads(dateFrom: Date, dateTo: Date): Promise<LeadsSection> {
  // Leads criados no período = contatos criados no período
  const newContacts = await prisma.contact.findMany({
    where: { createdAt: { gte: dateFrom, lte: dateTo } },
    include: { leadTrackings: true, leadScore: true },
  });

  const totalNewLeads = newContacts.length;

  // Por origem: agrupa por utm_medium, utm_source e source do deal
  const byOrigin: Record<string, number> = {};
  for (const contact of newContacts) {
    const tracking = contact.leadTrackings[0];
    let origin = 'direto';

    if (tracking) {
      if (
        tracking.utmMedium?.toLowerCase() === 'greatpages' ||
        tracking.utmSource?.toLowerCase() === 'lp'
      ) {
        origin = 'greatpages';
      } else if (tracking.utmMedium) {
        origin = tracking.utmMedium.toLowerCase();
      } else if (tracking.utmSource) {
        origin = tracking.utmSource.toLowerCase();
      }
    }

    byOrigin[origin] = (byOrigin[origin] ?? 0) + 1;
  }

  // Por dia
  const byDayMap: Record<string, number> = {};
  for (const contact of newContacts) {
    const dateKey = contact.createdAt.toISOString().split('T')[0];
    byDayMap[dateKey] = (byDayMap[dateKey] ?? 0) + 1;
  }
  const byDay = Object.entries(byDayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Lead score distribution
  // hot = score >= 70 (ENGAGED com score alto), warm = INTERMEDIATE, cold = DISENGAGED
  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const contact of newContacts) {
    const score = contact.leadScore;
    if (!score) {
      cold++;
    } else if (score.engagementLevel === 'ENGAGED' && score.score >= 70) {
      hot++;
    } else if (score.engagementLevel === 'INTERMEDIATE' || score.score >= 30) {
      warm++;
    } else {
      cold++;
    }
  }

  return {
    totalNewLeads,
    byOrigin,
    byDay,
    leadScoreDistribution: { hot, warm, cold },
  };
}

async function queryFunnel(dateFrom: Date, dateTo: Date): Promise<FunnelSection> {
  const pipeline = await prisma.pipeline.findFirst({
    include: { stages: { orderBy: { order: 'asc' } } },
  });

  if (!pipeline) {
    return {
      totalEntered: 0,
      atStage: {},
      conversionRate: 0,
      wonDeals: 0,
      wonRevenue: 0,
    };
  }

  // Deals criados no período
  const totalEntered = await prisma.deal.count({
    where: { pipelineId: pipeline.id, createdAt: { gte: dateFrom, lte: dateTo } },
  });

  // Deals por etapa (ativos no período)
  const stageCounts = await prisma.deal.groupBy({
    by: ['stageId'],
    where: { pipelineId: pipeline.id, createdAt: { gte: dateFrom, lte: dateTo } },
    _count: { id: true },
  });

  const stageMap = new Map(pipeline.stages.map(s => [s.id, s.name]));
  const atStage: Record<string, number> = {};
  for (const g of stageCounts) {
    const stageName = stageMap.get(g.stageId) ?? g.stageId;
    atStage[stageName] = g._count.id;
  }

  // Deals ganhos no período
  const wonDealsData = await prisma.deal.aggregate({
    where: {
      status: 'WON',
      closedAt: { gte: dateFrom, lte: dateTo },
    },
    _count: { id: true },
    _sum: { value: true },
  });

  const wonDeals = wonDealsData._count.id;
  const wonRevenue = Number(wonDealsData._sum.value ?? 0);
  const conversionRate = totalEntered > 0 ? (wonDeals / totalEntered) * 100 : 0;

  return {
    totalEntered,
    atStage,
    conversionRate: Math.round(conversionRate * 100) / 100,
    wonDeals,
    wonRevenue,
  };
}

async function queryEmail(dateFrom: Date, dateTo: Date): Promise<EmailSection> {
  // Campanhas com sends no período
  const campaigns = await prisma.emailCampaign.count({
    where: {
      status: 'SENT',
      sentAt: { gte: dateFrom, lte: dateTo },
    },
  });

  // Totais de envios no período
  const [totalSent, opened, clicked, bounced] = await Promise.all([
    prisma.emailSend.count({
      where: { createdAt: { gte: dateFrom, lte: dateTo } },
    }),
    prisma.emailSend.count({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo },
        openedAt: { not: null },
      },
    }),
    prisma.emailSend.count({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo },
        clickedAt: { not: null },
      },
    }),
    prisma.emailSend.count({
      where: {
        createdAt: { gte: dateFrom, lte: dateTo },
        bouncedAt: { not: null },
      },
    }),
  ]);

  const avgOpenRate = totalSent > 0 ? Math.round((opened / totalSent) * 10000) / 100 : 0;
  const avgClickRate = totalSent > 0 ? Math.round((clicked / totalSent) * 10000) / 100 : 0;
  const avgBounceRate = totalSent > 0 ? Math.round((bounced / totalSent) * 10000) / 100 : 0;

  return {
    campaigns,
    totalSent,
    avgOpenRate,
    avgClickRate,
    avgBounceRate,
  };
}

async function queryWhatsApp(dateFrom: Date, dateTo: Date): Promise<WhatsAppSection> {
  // Mensagens WhatsApp no período — usando modelos legados (WhatsAppMessage)
  // e Cloud API (CloudWaMessageLog) + WaMessage (v2)
  const [
    legacySent,
    legacyDelivered,
    legacyReplies,
    cloudSent,
    cloudDelivered,
    cloudReplies,
  ] = await Promise.all([
    // Legado Z-API
    prisma.whatsAppMessage.count({
      where: {
        sender: 'BOT',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
    prisma.whatsAppMessage.count({
      where: {
        sender: 'BOT',
        delivered: true,
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
    prisma.whatsAppMessage.count({
      where: {
        sender: 'CLIENT',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
    // Cloud API
    prisma.cloudWaMessageLog.count({
      where: {
        direction: 'OUTBOUND',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
    prisma.cloudWaMessageLog.count({
      where: {
        direction: 'OUTBOUND',
        status: 'DELIVERED',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
    prisma.cloudWaMessageLog.count({
      where: {
        direction: 'INBOUND',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    }),
  ]);

  const messagesSent = legacySent + cloudSent;
  const messagesDelivered = legacyDelivered + cloudDelivered;
  const replies = legacyReplies + cloudReplies;

  // Conversions = deals fechados (WON) com contato que tem conversa WA no período
  const conversions = await prisma.deal.count({
    where: {
      status: 'WON',
      closedAt: { gte: dateFrom, lte: dateTo },
      contact: {
        whatsappConversations: { some: {} },
      },
    },
  });

  return {
    messagesSent,
    messagesDelivered,
    replies,
    conversions,
  };
}

async function queryGreatPages(dateFrom: Date, dateTo: Date): Promise<GreatPagesSection> {
  // GreatPages = leads com utm_medium='greatpages' OR utm_source='lp'
  const gpTrackings = await prisma.leadTracking.findMany({
    where: {
      createdAt: { gte: dateFrom, lte: dateTo },
      OR: [
        { utmMedium: { equals: 'greatpages', mode: 'insensitive' } },
        { utmSource: { equals: 'lp', mode: 'insensitive' } },
      ],
    },
    include: {
      contact: { select: { id: true } },
    },
  });

  const leadsGenerated = gpTrackings.length;

  // LPs ativas (únicas landingPages no período)
  const lpMap: Record<string, Set<string>> = {};
  const utmBreakdown: Record<string, number> = {};

  for (const t of gpTrackings) {
    // Landing pages
    const lpName = t.landingPage ?? t.utmCampaign ?? 'desconhecida';
    if (!lpMap[lpName]) lpMap[lpName] = new Set();
    lpMap[lpName].add(t.contactId);

    // UTM breakdown por campanha
    const campaign = t.utmCampaign ?? 'sem-campanha';
    utmBreakdown[campaign] = (utmBreakdown[campaign] ?? 0) + 1;
  }

  const activeLandingPages = Object.keys(lpMap).length;

  // Top 5 LPs por leads
  const topLP = Object.entries(lpMap)
    .map(([name, contacts]) => ({ name, leads: contacts.size }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 5);

  return {
    activeLandingPages,
    leadsGenerated,
    topLP,
    utmBreakdown,
  };
}

// ── Endpoint principal ────────────────────────────────────────────────────────

router.get(
  '/export',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ── Validação de params ──────────────────────────────────────────────
      const { empresa_id, date_from, date_to, metrics } = req.query as Record<string, string>;

      const errors: string[] = [];

      if (!empresa_id) {
        errors.push('empresa_id é obrigatório');
      } else if (!isValidUUID(empresa_id)) {
        errors.push('empresa_id deve ser um UUID válido');
      }

      if (!date_from) {
        errors.push('date_from é obrigatório');
      } else if (isNaN(Date.parse(date_from))) {
        errors.push('date_from deve ser uma data ISO válida (ex: 2026-01-01)');
      }

      if (!date_to) {
        errors.push('date_to é obrigatório');
      } else if (isNaN(Date.parse(date_to))) {
        errors.push('date_to deve ser uma data ISO válida (ex: 2026-01-31)');
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Parâmetros inválidos', details: errors });
      }

      const dateFrom = toStartOfDay(date_from);
      const dateTo = toEndOfDay(date_to);

      if (dateFrom > dateTo) {
        return res.status(400).json({
          error: 'Parâmetros inválidos',
          details: ['date_from deve ser anterior ou igual a date_to'],
        });
      }

      // ── Filtro de métricas ────────────────────────────────────────────────
      const ALL_METRICS = ['leads', 'funnel', 'email', 'whatsapp', 'greatpages'] as const;
      type MetricKey = (typeof ALL_METRICS)[number];

      let requestedMetrics: MetricKey[];
      if (metrics) {
        const parsed = metrics
          .split(',')
          .map(m => m.trim().toLowerCase())
          .filter(m => (ALL_METRICS as readonly string[]).includes(m)) as MetricKey[];

        requestedMetrics = parsed.length > 0 ? parsed : [...ALL_METRICS];
      } else {
        requestedMetrics = [...ALL_METRICS];
      }

      // ── Executa queries em paralelo ──────────────────────────────────────
      const [leadsData, funnelData, emailData, whatsappData, greatpagesData] = await Promise.all([
        requestedMetrics.includes('leads') ? queryLeads(dateFrom, dateTo) : Promise.resolve(undefined),
        requestedMetrics.includes('funnel') ? queryFunnel(dateFrom, dateTo) : Promise.resolve(undefined),
        requestedMetrics.includes('email') ? queryEmail(dateFrom, dateTo) : Promise.resolve(undefined),
        requestedMetrics.includes('whatsapp') ? queryWhatsApp(dateFrom, dateTo) : Promise.resolve(undefined),
        requestedMetrics.includes('greatpages') ? queryGreatPages(dateFrom, dateTo) : Promise.resolve(undefined),
      ]);

      // ── Monta resposta ───────────────────────────────────────────────────
      const response: ExportResponse = {
        period: {
          from: date_from,
          to: date_to,
        },
      };

      if (leadsData) response.leads = leadsData;
      if (funnelData) response.funnel = funnelData;
      if (emailData) response.email = emailData;
      if (whatsappData) response.whatsapp = whatsappData;
      if (greatpagesData) response.greatpages = greatpagesData;

      return res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
