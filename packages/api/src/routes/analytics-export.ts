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
import { Brand } from '@prisma/client';
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

async function queryLeads(dateFrom: Date, dateTo: Date, brand: Brand): Promise<LeadsSection> {
  // Leads criados no período = contatos criados no período
  const newContacts = await prisma.contact.findMany({
    where: { createdAt: { gte: dateFrom, lte: dateTo }, brand },
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

async function queryFunnel(dateFrom: Date, dateTo: Date, brand: Brand): Promise<FunnelSection> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { brand },
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
    where: { pipelineId: pipeline.id, brand, createdAt: { gte: dateFrom, lte: dateTo } },
  });

  // Deals por etapa (ativos no período)
  const stageCounts = await prisma.deal.groupBy({
    by: ['stageId'],
    where: { pipelineId: pipeline.id, brand, createdAt: { gte: dateFrom, lte: dateTo } },
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
      brand,
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

async function queryEmail(dateFrom: Date, dateTo: Date, brand: Brand): Promise<EmailSection> {
  // Campanhas com sends no período
  const campaigns = await prisma.emailCampaign.count({
    where: {
      status: 'SENT',
      brand,
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

async function queryWhatsApp(dateFrom: Date, dateTo: Date, brand: Brand): Promise<WhatsAppSection> {
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
      brand,
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
        requestedMetrics.includes('leads') ? queryLeads(dateFrom, dateTo, req.brand) : Promise.resolve(undefined),
        requestedMetrics.includes('funnel') ? queryFunnel(dateFrom, dateTo, req.brand) : Promise.resolve(undefined),
        requestedMetrics.includes('email') ? queryEmail(dateFrom, dateTo, req.brand) : Promise.resolve(undefined),
        requestedMetrics.includes('whatsapp') ? queryWhatsApp(dateFrom, dateTo, req.brand) : Promise.resolve(undefined),
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

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/attribution
//
// Retorna dados granulares de atribuição cross-channel para o ContIA cruzar
// com Meta Ads e Instagram. Protegido por X-API-Key (igual ao /export).
//
// Query params:
//   from         — ISO date, início do período (obrigatório)
//   to           — ISO date, fim do período (obrigatório)
//   empresa_id   — ignorado (single-tenant), aceito por compatibilidade
// ═══════════════════════════════════════════════════════════════════════════════

// ── Tipos internos ────────────────────────────────────────────────────────────

interface FirstTouchData {
  at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landingPage: string | null;
  referrer: string | null;
}

interface DealData {
  id: string;
  value: number;
  status: 'OPEN' | 'WON' | 'LOST';
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
  createdAt: string;
  closedAt: string | null;
}

interface LeadAttribution {
  id: string;
  contactId: string;
  name: string;
  createdAt: string;
  leadScore: number | null;
  leadTemperature: 'hot' | 'warm' | 'cold' | null;
  firstTouch: FirstTouchData;
  deal: DealData | null;
}

interface ChannelSummary {
  source: string;
  medium: string | null;
  leadsCount: number;
  dealsCount: number;
  dealsWonCount: number;
  dealsWonRevenue: number;
  avgLeadToWon_days: number;
  conversionRate: number;
}

interface CampaignSummary {
  campaign: string;
  source: string;
  leadsCount: number;
  dealsWonCount: number;
  dealsWonRevenue: number;
  avgDealValue: number;
}

interface CreativeSummary {
  content: string;
  campaign: string;
  leadsCount: number;
  dealsWonCount: number;
  dealsWonRevenue: number;
}

interface FunnelStep {
  stage: string;
  count: number;
  revenue: number;
}

interface AttributionTotals {
  leads: number;
  deals: number;
  dealsWon: number;
  revenue: number;
  avgTicket: number;
  avgLeadToWon_days: number;
}

interface AttributionResponse {
  period: { from: string; to: string };
  leads: LeadAttribution[];
  channelSummary: ChannelSummary[];
  campaignSummary: CampaignSummary[];
  creativeSummary: CreativeSummary[];
  funnel: FunnelStep[];
  totals: AttributionTotals;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converte EngagementLevel + score em temperatura de lead. */
function toTemperature(
  engagementLevel: string | null,
  score: number | null
): 'hot' | 'warm' | 'cold' | null {
  if (!engagementLevel && score === null) return null;
  if (engagementLevel === 'ENGAGED' && (score ?? 0) >= 70) return 'hot';
  if (engagementLevel === 'INTERMEDIATE' || (score ?? 0) >= 30) return 'warm';
  return 'cold';
}

/** Diferença em dias entre duas datas. */
function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** Safe string normalizer — retorna null se vazio/undefined. */
function strOrNull(v: string | null | undefined): string | null {
  if (!v || v.trim() === '') return null;
  return v.trim();
}

// ── Attribution query ─────────────────────────────────────────────────────────

router.get(
  '/attribution',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ── Validação de params ──────────────────────────────────────────────
      const { from, to } = req.query as Record<string, string>;

      const errors: string[] = [];

      if (!from) {
        errors.push('from é obrigatório');
      } else if (isNaN(Date.parse(from))) {
        errors.push('from deve ser uma data ISO válida (ex: 2026-01-01)');
      }

      if (!to) {
        errors.push('to é obrigatório');
      } else if (isNaN(Date.parse(to))) {
        errors.push('to deve ser uma data ISO válida (ex: 2026-01-31)');
      }

      if (errors.length > 0) {
        return res.status(400).json({ error: 'Parâmetros inválidos', details: errors });
      }

      const dateFrom = toStartOfDay(from);
      const dateTo = toEndOfDay(to);

      if (dateFrom > dateTo) {
        return res.status(400).json({
          error: 'Parâmetros inválidos',
          details: ['from deve ser anterior ou igual a to'],
        });
      }

      // ── Query principal: contatos criados no período com UTM + deal ──────
      const contacts = await prisma.contact.findMany({
        where: { createdAt: { gte: dateFrom, lte: dateTo }, brand: req.brand },
        select: {
          id: true,
          name: true,
          createdAt: true,
          leadScore: {
            select: { score: true, engagementLevel: true },
          },
          leadTrackings: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              createdAt: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              utmContent: true,
              utmTerm: true,
              landingPage: true,
              referrer: true,
            },
          },
          deals: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: {
              id: true,
              value: true,
              status: true,
              createdAt: true,
              closedAt: true,
              stageId: true,
              pipelineId: true,
              stage: { select: { name: true } },
              pipeline: { select: { name: true } },
            },
          },
        },
      });

      // ── Montar lista de leads com atribuição ─────────────────────────────
      const leads: LeadAttribution[] = contacts.map(contact => {
        const tracking = contact.leadTrackings[0] ?? null;
        const deal = contact.deals[0] ?? null;
        const score = contact.leadScore;

        const firstTouch: FirstTouchData = {
          at: tracking ? tracking.createdAt.toISOString() : contact.createdAt.toISOString(),
          utm_source: strOrNull(tracking?.utmSource),
          utm_medium: strOrNull(tracking?.utmMedium),
          utm_campaign: strOrNull(tracking?.utmCampaign),
          utm_content: strOrNull(tracking?.utmContent),
          utm_term: strOrNull(tracking?.utmTerm),
          landingPage: strOrNull(tracking?.landingPage),
          referrer: strOrNull(tracking?.referrer),
        };

        const dealData: DealData | null = deal
          ? {
              id: deal.id,
              value: Number(deal.value ?? 0),
              status: deal.status as 'OPEN' | 'WON' | 'LOST',
              stageId: deal.stageId,
              stageName: deal.stage.name,
              pipelineId: deal.pipelineId,
              pipelineName: deal.pipeline.name,
              createdAt: deal.createdAt.toISOString(),
              closedAt: deal.closedAt ? deal.closedAt.toISOString() : null,
            }
          : null;

        return {
          id: contact.id,
          contactId: contact.id,
          name: contact.name,
          createdAt: contact.createdAt.toISOString(),
          leadScore: score?.score ?? null,
          leadTemperature: score
            ? toTemperature(score.engagementLevel, score.score)
            : null,
          firstTouch,
          deal: dealData,
        };
      });

      // ── Resumo por canal (utm_source + utm_medium) ───────────────────────
      const channelMap = new Map<
        string,
        {
          source: string;
          medium: string | null;
          leadsCount: number;
          dealsCount: number;
          dealsWonCount: number;
          dealsWonRevenue: number;
          leadToWonDays: number[];
        }
      >();

      for (const lead of leads) {
        const source = lead.firstTouch.utm_source ?? 'direto';
        const medium = lead.firstTouch.utm_medium;
        const key = `${source}|||${medium ?? ''}`;

        if (!channelMap.has(key)) {
          channelMap.set(key, {
            source,
            medium,
            leadsCount: 0,
            dealsCount: 0,
            dealsWonCount: 0,
            dealsWonRevenue: 0,
            leadToWonDays: [],
          });
        }

        const entry = channelMap.get(key)!;
        entry.leadsCount++;

        if (lead.deal) {
          entry.dealsCount++;
          if (lead.deal.status === 'WON') {
            entry.dealsWonCount++;
            entry.dealsWonRevenue += lead.deal.value;
            if (lead.deal.closedAt) {
              const days = daysBetween(
                new Date(lead.createdAt),
                new Date(lead.deal.closedAt)
              );
              entry.leadToWonDays.push(days);
            }
          }
        }
      }

      const channelSummary: ChannelSummary[] = Array.from(channelMap.values())
        .map(ch => ({
          source: ch.source,
          medium: ch.medium,
          leadsCount: ch.leadsCount,
          dealsCount: ch.dealsCount,
          dealsWonCount: ch.dealsWonCount,
          dealsWonRevenue: Math.round(ch.dealsWonRevenue * 100) / 100,
          avgLeadToWon_days:
            ch.leadToWonDays.length > 0
              ? Math.round(
                  (ch.leadToWonDays.reduce((a, b) => a + b, 0) / ch.leadToWonDays.length) * 10
                ) / 10
              : 0,
          conversionRate:
            ch.leadsCount > 0
              ? Math.round((ch.dealsWonCount / ch.leadsCount) * 10000) / 100
              : 0,
        }))
        .sort((a, b) => b.leadsCount - a.leadsCount);

      // ── Resumo por campanha (utm_campaign) ───────────────────────────────
      const campaignMap = new Map<
        string,
        {
          campaign: string;
          source: string;
          leadsCount: number;
          dealsWonCount: number;
          dealsWonRevenue: number;
          dealValues: number[];
        }
      >();

      for (const lead of leads) {
        const campaign = lead.firstTouch.utm_campaign ?? '(sem campanha)';
        const source = lead.firstTouch.utm_source ?? 'direto';
        const key = `${campaign}|||${source}`;

        if (!campaignMap.has(key)) {
          campaignMap.set(key, {
            campaign,
            source,
            leadsCount: 0,
            dealsWonCount: 0,
            dealsWonRevenue: 0,
            dealValues: [],
          });
        }

        const entry = campaignMap.get(key)!;
        entry.leadsCount++;

        if (lead.deal?.status === 'WON') {
          entry.dealsWonCount++;
          entry.dealsWonRevenue += lead.deal.value;
          entry.dealValues.push(lead.deal.value);
        }
      }

      const campaignSummary: CampaignSummary[] = Array.from(campaignMap.values())
        .map(c => ({
          campaign: c.campaign,
          source: c.source,
          leadsCount: c.leadsCount,
          dealsWonCount: c.dealsWonCount,
          dealsWonRevenue: Math.round(c.dealsWonRevenue * 100) / 100,
          avgDealValue:
            c.dealValues.length > 0
              ? Math.round(
                  (c.dealValues.reduce((a, b) => a + b, 0) / c.dealValues.length) * 100
                ) / 100
              : 0,
        }))
        .sort((a, b) => b.leadsCount - a.leadsCount);

      // ── Resumo por criativo (utm_content) ────────────────────────────────
      const creativeMap = new Map<
        string,
        {
          content: string;
          campaign: string;
          leadsCount: number;
          dealsWonCount: number;
          dealsWonRevenue: number;
        }
      >();

      for (const lead of leads) {
        const content = lead.firstTouch.utm_content ?? '(sem criativo)';
        const campaign = lead.firstTouch.utm_campaign ?? '(sem campanha)';
        const key = `${content}|||${campaign}`;

        if (!creativeMap.has(key)) {
          creativeMap.set(key, {
            content,
            campaign,
            leadsCount: 0,
            dealsWonCount: 0,
            dealsWonRevenue: 0,
          });
        }

        const entry = creativeMap.get(key)!;
        entry.leadsCount++;

        if (lead.deal?.status === 'WON') {
          entry.dealsWonCount++;
          entry.dealsWonRevenue += lead.deal.value;
        }
      }

      const creativeSummary: CreativeSummary[] = Array.from(creativeMap.values())
        .map(c => ({
          content: c.content,
          campaign: c.campaign,
          leadsCount: c.leadsCount,
          dealsWonCount: c.dealsWonCount,
          dealsWonRevenue: Math.round(c.dealsWonRevenue * 100) / 100,
        }))
        .sort((a, b) => b.leadsCount - a.leadsCount);

      // ── Funil agregado (leads no período usando stage atual dos deals) ───
      // Busca todos os deals do período para o funil completo
      const allDeals = await prisma.deal.findMany({
        where: { createdAt: { gte: dateFrom, lte: dateTo }, brand: req.brand },
        select: {
          status: true,
          value: true,
          stage: { select: { name: true, order: true } },
        },
      });

      // Map stage name → { count, revenue }
      const funnelStageMap = new Map<string, { count: number; revenue: number }>();

      // Contatos sem deal = "lead" puro
      const leadsWithoutDeal = leads.filter(l => !l.deal).length;
      if (leadsWithoutDeal > 0) {
        funnelStageMap.set('Lead', { count: leadsWithoutDeal, revenue: 0 });
      }

      for (const deal of allDeals) {
        const stageName =
          deal.status === 'WON'
            ? 'Ganho'
            : deal.status === 'LOST'
            ? 'Perdido'
            : deal.stage.name;

        const existing = funnelStageMap.get(stageName) ?? { count: 0, revenue: 0 };
        existing.count++;
        existing.revenue += deal.status === 'WON' ? Number(deal.value ?? 0) : 0;
        funnelStageMap.set(stageName, existing);
      }

      const funnel: FunnelStep[] = Array.from(funnelStageMap.entries()).map(
        ([stage, data]) => ({
          stage,
          count: data.count,
          revenue: Math.round(data.revenue * 100) / 100,
        })
      );

      // ── Totais globais ───────────────────────────────────────────────────
      const totalLeads = leads.length;
      const totalDeals = leads.filter(l => l.deal).length;
      const wonLeads = leads.filter(l => l.deal?.status === 'WON');
      const totalDealsWon = wonLeads.length;
      const totalRevenue = wonLeads.reduce((sum, l) => sum + (l.deal?.value ?? 0), 0);
      const avgTicket = totalDealsWon > 0 ? totalRevenue / totalDealsWon : 0;

      const allLeadToWonDays = wonLeads
        .filter(l => l.deal?.closedAt)
        .map(l => daysBetween(new Date(l.createdAt), new Date(l.deal!.closedAt!)));

      const avgLeadToWon_days =
        allLeadToWonDays.length > 0
          ? Math.round(
              (allLeadToWonDays.reduce((a, b) => a + b, 0) / allLeadToWonDays.length) * 10
            ) / 10
          : 0;

      const totals: AttributionTotals = {
        leads: totalLeads,
        deals: totalDeals,
        dealsWon: totalDealsWon,
        revenue: Math.round(totalRevenue * 100) / 100,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgLeadToWon_days,
      };

      // ── Resposta ─────────────────────────────────────────────────────────
      const response: AttributionResponse = {
        period: { from, to },
        leads,
        channelSummary,
        campaignSummary,
        creativeSummary,
        funnel,
        totals,
      };

      return res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
