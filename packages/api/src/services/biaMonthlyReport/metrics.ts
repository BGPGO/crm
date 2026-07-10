/**
 * biaMonthlyReport/metrics — números canônicos do relatório mensal da BIA.
 *
 * Definições fixas (iguais todo mês, auditáveis — rodapé do email; calibradas
 * pra reproduzir EXATAMENTE os números canônicos do relatório de jul/2026):
 * - Janela: [dia 7 do mês anterior 00:00 UTC, dia 7 do mês atual 00:00 UTC)
 * - Conversa BIA   = WaConversation com >=1 WaMessage senderType=WA_BOT na janela
 * - Respondeu      = dessas, >=1 INBOUND após a 1ª msg do bot na janela
 *                    (a resposta pode chegar depois do fim da janela — sem teto)
 * - Reunião atrib. = contato distinto com CalendlyEvent.createdAt na janela E
 *                    >=1 msg WA_BOT antes do createdAt do evento (qualquer data)
 * - Msgs da BIA    = WA_BOT (livre + template). WA_SYSTEM (broadcasts/lançamentos)
 *                    fica FORA de tudo.
 * - Outlier        = conversa com >OUTLIER_BOT_MSGS msgs do bot na janela (ex.:
 *                    loop bot-vs-bot de 23/06 com 1.130 msgs). Excluída de todas
 *                    as métricas e reportada à parte como incidente.
 */
import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export const OUTLIER_BOT_MSGS = 300;

export interface BiaWindow {
  start: Date;
  end: Date;
}

export interface BiaIncident {
  conversationId: string;
  phone: string;
  pushName: string | null;
  botMessages: number;
}

export interface CadenceStepStat {
  step: number;
  sent: number;
  failed: number;
  replied: number;
}

export interface TemplateStat {
  templateName: string;
  sent: number;
  read: number;
  failed: number;
  replied: number;
}

export interface BiaMetrics {
  window: BiaWindow;
  conversations: number;
  distinctLeads: number;
  responded: number;
  botMessages: number;
  optOuts: number;
  medianResponseSeconds: number | null;
  meetingsAttributed: number;
  proposals: number;
  wins: number;
  incidents: BiaIncident[];
  outlierConversationIds: string[];
}

/** Janela canônica terminando no dia 7 do mês de `now` (ou anterior, se antes do dia 7). */
export function computeWindows(now = new Date()): { current: BiaWindow; previous: BiaWindow } {
  const day7 = (y: number, monthIndex: number) => new Date(Date.UTC(y, monthIndex, 7));
  let end = day7(now.getUTCFullYear(), now.getUTCMonth());
  if (now < end) end = day7(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const start = day7(end.getUTCFullYear(), end.getUTCMonth() - 1);
  const prevStart = day7(start.getUTCFullYear(), start.getUTCMonth() - 1);
  return { current: { start, end }, previous: { start: prevStart, end: start } };
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "07 de junho a 07 de julho de 2026" */
export function windowLabel(w: BiaWindow): string {
  return `07 de ${MONTHS_PT[w.start.getUTCMonth()]} a 07 de ${MONTHS_PT[w.end.getUTCMonth()]} de ${w.end.getUTCFullYear()}`;
}

/** "julho/2026" — mês de referência (mês do fim da janela) */
export function windowShortLabel(w: BiaWindow): string {
  return `${MONTHS_PT[w.end.getUTCMonth()]}/${w.end.getUTCFullYear()}`;
}

interface BotCountRow {
  conversationId: string;
  botCount: number;
}

export async function collectMetrics(window: BiaWindow): Promise<BiaMetrics> {
  const { start, end } = window;

  // 1) Msgs do bot por conversa na janela → conversas + outliers
  const botCounts = await prisma.$queryRaw<BotCountRow[]>(Prisma.sql`
    SELECT "conversationId", COUNT(*)::int AS "botCount"
    FROM "WaMessage"
    WHERE "senderType"::text = 'WA_BOT'
      AND "createdAt" >= ${start} AND "createdAt" < ${end}
    GROUP BY "conversationId"
  `);

  const outliers = botCounts.filter((r) => r.botCount > OUTLIER_BOT_MSGS);
  const outlierIds = outliers.map((r) => r.conversationId);
  const valid = botCounts.filter((r) => r.botCount <= OUTLIER_BOT_MSGS);
  const validIds = valid.map((r) => r.conversationId);
  const botMessages = valid.reduce((acc, r) => acc + r.botCount, 0);

  const notOutlier = outlierIds.length
    ? Prisma.sql`AND fb."conversationId" NOT IN (${Prisma.join(outlierIds)})`
    : Prisma.empty;

  const empty: BiaMetrics = {
    window,
    conversations: valid.length,
    distinctLeads: 0,
    responded: 0,
    botMessages,
    optOuts: 0,
    medianResponseSeconds: null,
    meetingsAttributed: 0,
    proposals: 0,
    wins: 0,
    incidents: [],
    outlierConversationIds: outlierIds,
  };

  // 2) Incidentes (detalhe dos outliers)
  if (outlierIds.length) {
    const convs = await prisma.waConversation.findMany({
      where: { id: { in: outlierIds } },
      select: { id: true, phone: true, pushName: true },
    });
    empty.incidents = outliers.map((o) => {
      const c = convs.find((x) => x.id === o.conversationId);
      return {
        conversationId: o.conversationId,
        phone: c?.phone ?? '?',
        pushName: c?.pushName ?? null,
        botMessages: o.botCount,
      };
    });
  }

  // 3) Leads distintos das conversas válidas
  if (validIds.length) {
    const leadRows = await prisma.$queryRaw<Array<{ leads: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT COALESCE("contactId", phone))::int AS leads
      FROM "WaConversation"
      WHERE id IN (${Prisma.join(validIds)})
    `);
    empty.distinctLeads = leadRows[0]?.leads ?? 0;

    // 4) Responderam: INBOUND após a 1ª msg do bot na janela (sem teto de data)
    const respondedRows = await prisma.$queryRaw<Array<{ responded: number }>>(Prisma.sql`
      WITH fb AS (
        SELECT "conversationId", MIN("createdAt") AS first_bot
        FROM "WaMessage"
        WHERE "senderType"::text = 'WA_BOT'
          AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY "conversationId"
      )
      SELECT COUNT(*)::int AS responded
      FROM fb
      WHERE EXISTS (
        SELECT 1 FROM "WaMessage" m
        WHERE m."conversationId" = fb."conversationId"
          AND m."direction"::text = 'INBOUND'
          AND m."createdAt" > fb.first_bot
      )
      ${notOutlier}
    `);
    empty.responded = respondedRows[0]?.responded ?? 0;
  }

  // 5) Opt-outs na janela
  empty.optOuts = await prisma.waConversation.count({
    where: { optedOutAt: { gte: start, lt: end } },
  });

  // 6) Mediana de resposta bot→cliente (pares cliente→bot consecutivos, cap 30min)
  const outlierFilterM = outlierIds.length
    ? Prisma.sql`AND o."conversationId" NOT IN (${Prisma.join(outlierIds)})`
    : Prisma.empty;
  const medianRows = await prisma.$queryRaw<Array<{ median: number | null }>>(Prisma.sql`
    WITH ordered AS (
      SELECT "conversationId", "createdAt",
             "senderType"::text AS st,
             LAG("senderType"::text) OVER w AS prev_st,
             LAG("createdAt") OVER w AS prev_at
      FROM "WaMessage"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
      WINDOW w AS (PARTITION BY "conversationId" ORDER BY "createdAt")
    )
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (o."createdAt" - o.prev_at))
    )::float AS median
    FROM ordered o
    WHERE o.st = 'WA_BOT' AND o.prev_st = 'WA_CLIENT'
      AND o."createdAt" - o.prev_at < interval '30 minutes'
      ${outlierFilterM}
  `);
  empty.medianResponseSeconds = medianRows[0]?.median ?? null;

  // 7) Reuniões atribuídas + funil de dinheiro (propostas/ganhos dos atribuídos)
  const attributed = await prisma.$queryRaw<Array<{ contactId: string }>>(Prisma.sql`
    SELECT DISTINCT ce."contactId"
    FROM "CalendlyEvent" ce
    WHERE ce."createdAt" >= ${start} AND ce."createdAt" < ${end}
      AND ce."contactId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "WaConversation" c
        JOIN "WaMessage" m ON m."conversationId" = c.id
        WHERE c."contactId" = ce."contactId"
          AND m."senderType"::text = 'WA_BOT'
          AND m."createdAt" < ce."createdAt"
      )
  `);
  empty.meetingsAttributed = attributed.length;

  if (attributed.length) {
    const ids = attributed.map((r) => r.contactId);
    const funnel = await prisma.$queryRaw<Array<{ proposals: number; wins: number }>>(Prisma.sql`
      SELECT
        COUNT(DISTINCT d."contactId") FILTER (WHERE s.name ILIKE '%proposta%')::int AS proposals,
        COUNT(DISTINCT d."contactId") FILTER (WHERE s.name ILIKE '%ganho%')::int AS wins
      FROM "Deal" d
      JOIN "PipelineStage" s ON s.id = d."stageId"
      WHERE d."contactId" IN (${Prisma.join(ids)})
    `);
    empty.proposals = funnel[0]?.proposals ?? 0;
    empty.wins = funnel[0]?.wins ?? 0;
  }

  return empty;
}

/** Cadência: taxa por passo (só msgs do bot marcadas como follow-up). */
export async function collectCadenceStats(window: BiaWindow): Promise<CadenceStepStat[]> {
  return prisma.$queryRaw<CadenceStepStat[]>(Prisma.sql`
    SELECT m."followUpStep" AS step,
           COUNT(*)::int AS sent,
           COUNT(*) FILTER (WHERE m.status::text = 'WA_FAILED')::int AS failed,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "WaMessage" r
             WHERE r."conversationId" = m."conversationId"
               AND r."direction"::text = 'INBOUND'
               AND r."createdAt" > m."createdAt"
               AND r."createdAt" < m."createdAt" + interval '72 hours'
           ))::int AS replied
    FROM "WaMessage" m
    WHERE m."isFollowUp" = true AND m."followUpStep" IS NOT NULL
      AND m."senderType"::text = 'WA_BOT'
      AND m."createdAt" >= ${window.start} AND m."createdAt" < ${window.end}
    GROUP BY 1
    ORDER BY 1
  `);
}

/** Templates enviados pela BIA na janela (broadcasts WA_SYSTEM ficam fora). */
export async function collectTemplateStats(window: BiaWindow): Promise<TemplateStat[]> {
  return prisma.$queryRaw<TemplateStat[]>(Prisma.sql`
    SELECT m."templateName",
           COUNT(*)::int AS sent,
           COUNT(*) FILTER (WHERE m.status::text = 'WA_READ')::int AS read,
           COUNT(*) FILTER (WHERE m.status::text = 'WA_FAILED')::int AS failed,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "WaMessage" r
             WHERE r."conversationId" = m."conversationId"
               AND r."direction"::text = 'INBOUND'
               AND r."createdAt" > m."createdAt"
               AND r."createdAt" < m."createdAt" + interval '72 hours'
           ))::int AS replied
    FROM "WaMessage" m
    WHERE m."templateName" IS NOT NULL
      AND m."senderType"::text = 'WA_BOT'
      AND m."createdAt" >= ${window.start} AND m."createdAt" < ${window.end}
    GROUP BY 1
    ORDER BY sent DESC
    LIMIT 12
  `);
}

export interface ConversationSample {
  phone: string;
  pushName: string | null;
  kind: string;
  transcript: string;
}

/**
 * Amostras qualitativas pra IA: conversas da janela em 3 recortes —
 * precisou de humano / respondeu / nunca respondeu.
 */
export async function collectSamples(
  window: BiaWindow,
  outlierIds: string[],
): Promise<ConversationSample[]> {
  const base = {
    messages: { some: { senderType: 'WA_BOT' as const, createdAt: { gte: window.start, lt: window.end } } },
    id: outlierIds.length ? { notIn: outlierIds } : undefined,
  };

  const pick = async (kind: string, extra: Record<string, unknown>, take: number) => {
    const convs = await prisma.waConversation.findMany({
      where: { ...base, ...extra },
      orderBy: { lastMessageAt: 'desc' },
      take,
      select: {
        phone: true,
        pushName: true,
        messages: {
          where: { createdAt: { gte: window.start, lt: window.end } },
          orderBy: { createdAt: 'asc' },
          take: 40,
          select: { direction: true, senderType: true, body: true, templateName: true },
        },
      },
    });
    return convs.map((c) => ({
      phone: c.phone,
      pushName: c.pushName,
      kind,
      transcript: c.messages
        .map((m) => {
          const who = m.direction === 'INBOUND' ? 'CLIENTE' : m.senderType;
          const text = (m.body ?? (m.templateName ? `[template ${m.templateName}]` : '[mídia]')).slice(0, 280);
          return `[${who}] ${text}`;
        })
        .join('\n'),
    }));
  };

  const [humanNeeded, replied, silent] = await Promise.all([
    pick('precisou de atendimento humano', { needsHumanAttention: true }, 4),
    pick('lead respondeu', {
      messages: { some: { direction: 'INBOUND' as const, createdAt: { gte: window.start, lt: window.end } } },
      needsHumanAttention: false,
    }, 5),
    pick('lead nunca respondeu na janela', {
      NOT: { messages: { some: { direction: 'INBOUND' as const, createdAt: { gte: window.start, lt: window.end } } } },
    }, 3),
  ]);

  return [...humanNeeded, ...replied, ...silent].filter((s) => s.transcript.length > 0);
}
