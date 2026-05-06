/**
 * Página 2 — Tráfego Pago.
 *
 * Consome:
 *   - ../../metaAds  (Squad Beta)
 *   - ../../googleAds (Squad Gamma)
 *
 * Layout segue o PDF modelo crm/relatorio-modelo.pdf.
 * render() NUNCA lança — devolve HTML de fallback em caso de erro.
 */

import type { ReportSection, DailyAdsSpend, AdsCampaignSpend, ConnectionStatus } from '../types';
import { getMetaAdsDaily, getMetaAdsMTD } from '../../metaAds';
import { getGoogleAdsDaily, getGoogleAdsMTD } from '../../googleAds';
import prisma from '../../../lib/prisma';

// ─── Constantes ───────────────────────────────────────────────────────────────

const PIPELINE_ID = '64fb7516ea4eb400219457de';
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

// ─── Helpers de data ──────────────────────────────────────────────────────────

function startOfDayBRT(utcDate: Date): Date {
  const brtTime = utcDate.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtTime);
  const midnightBRT = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  return new Date(midnightBRT.getTime() - BRT_OFFSET_MS);
}

function startOfMonthBRT(utcDate: Date): Date {
  const brtTime = utcDate.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtTime);
  const firstDayBRT = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1));
  return new Date(firstDayBRT.getTime() - BRT_OFFSET_MS);
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

function formatBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

function formatDateFull(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMonthName(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long' }).toUpperCase();
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface CrmCampaignRow {
  utmCampaign: string;
  utmSource: string | null;
  leads: number;
  meetings: number;
  spend: number; // gasto do dia matched com Meta/Google ads pelo nome da campanha
}

interface PaidTrafficData {
  referenceDate: Date;
  metaDaily: DailyAdsSpend;
  googleDaily: DailyAdsSpend;
  mtdMeta: { spend: number; leads: number };
  mtdGoogle: { spend: number; leads: number };
  leadsTotalDay: number;
  meetingsScheduledDay: number;
  meetingsPerCampaign: Map<string, number>;
  crmCampaigns: CrmCampaignRow[]; // detalhamento por campanha vindo do CRM (UTMs reais)
  paidLeadsMTD: number; // contagem real de leads pagos no mês via CRM (LeadTracking)
}

// ─── Queries no CRM ──────────────────────────────────────────────────────────

async function countLeadsCreatedOn(date: Date): Promise<number> {
  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return prisma.deal.count({
    where: {
      pipelineId: PIPELINE_ID,
      // Daily report é BGP-only (multi-brand pending)
      brand: 'BGP',
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });
}

/**
 * Conta leads pagos do mês até a data de referência via CRM (LeadTracking).
 *
 * Por que não usar `monthToDate.leads` do Meta? O Meta conta como "lead"
 * toda ação de form/click/iniciar mensagem — número infla 2-3x sobre o
 * que efetivamente vira registro no CRM. Aqui contamos deals reais cuja
 * primeira UTM source casa com /facebook|instagram|meta|google|adwords|youtube/i.
 */
const PAID_SOURCE_RX = /facebook|instagram|meta|google|adwords|youtube/i;
async function countPaidLeadsMTD(referenceDate: Date): Promise<number> {
  const monthStart = startOfMonthBRT(referenceDate);
  const dayEnd = new Date(startOfDayBRT(referenceDate).getTime() + 86_400_000);

  const monthDeals = await prisma.deal.findMany({
    // Daily report é BGP-only (multi-brand pending)
    where: { pipelineId: PIPELINE_ID, brand: 'BGP', createdAt: { gte: monthStart, lt: dayEnd } },
    select: { contactId: true },
  });
  const contactIds = monthDeals
    .map((d) => d.contactId)
    .filter((id): id is string => !!id);
  if (contactIds.length === 0) return 0;

  const trackings = await prisma.leadTracking.findMany({
    where: { contactId: { in: contactIds } },
    orderBy: { createdAt: 'asc' },
    select: { contactId: true, utmSource: true },
  });
  const firstUtmByContact = new Map<string, string | null>();
  for (const t of trackings) {
    if (!firstUtmByContact.has(t.contactId)) firstUtmByContact.set(t.contactId, t.utmSource);
  }

  let paid = 0;
  for (const d of monthDeals) {
    if (!d.contactId) continue;
    const src = firstUtmByContact.get(d.contactId);
    if (src && PAID_SOURCE_RX.test(src)) paid++;
  }
  return paid;
}

async function countMeetingsScheduledOn(date: Date): Promise<number> {
  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  // CalendlyEvent é a fonte autoritativa: o webhook upserta o registro antes
  // de qualquer outra etapa (find contact, find/create deal). Se algo falhar
  // adiante, o evento ainda existe com dealId=null. Por isso NÃO filtramos
  // por dealId — queremos contar TODAS as reuniões reportadas pelo Calendly
  // ontem, mesmo que o link com o CRM tenha falhado parcialmente.
  const calendlyCount = await prisma.calendlyEvent.count({
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      status: 'active',
    },
  });

  // Sanity check: conta também via Activity (criadas só quando deal é vinculado).
  // Se Calendly diverge muito da Activity, log warning — sintoma de webhook quebrando
  // entre o upsert do CalendlyEvent e a criação do Activity/dealId.
  const activityCount = await prisma.activity.count({
    where: {
      type: 'MEETING',
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });

  if (calendlyCount > activityCount) {
    console.warn(
      `[paidTrafficSection] Discrepância Calendly vs Activity: ${calendlyCount} eventos Calendly mas só ${activityCount} Activities. Webhook pode estar quebrando entre upsert e link com Deal.`,
    );
  }

  return calendlyCount;
}

/**
 * Detalhamento por campanha baseado nos LEADS DO CRM (não no array de campanhas
 * do ContIA, que é global aggregate). Usa LeadTracking pra atribuir cada lead
 * à primeira campanha que o trouxe, e cruza com CalendlyEvents do mesmo dia
 * pra contar reuniões por campanha.
 *
 * Vantagem: funciona mesmo quando Meta Ads ainda não consolidou o spend do
 * dia anterior (delay de 24-48h). O usuário sempre vê de onde vieram os leads
 * do dia, mesmo que a coluna de gasto venha vazia.
 */
async function getCrmCampaignBreakdown(date: Date): Promise<CrmCampaignRow[]> {
  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  // Deals criados ontem
  const yesterdayDeals = await prisma.deal.findMany({
    // Daily report é BGP-only (multi-brand pending)
    where: { pipelineId: PIPELINE_ID, brand: 'BGP', createdAt: { gte: dayStart, lt: dayEnd } },
    select: { contactId: true },
  });
  const yesterdayContactIds = yesterdayDeals
    .map((d) => d.contactId)
    .filter((id): id is string => !!id);

  // Reuniões agendadas ontem (contactIds)
  const yesterdayCalendly = await prisma.calendlyEvent.findMany({
    where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'active', contactId: { not: null } },
    select: { contactId: true },
  });
  const yesterdayMeetingContactIds = new Set(
    yesterdayCalendly.map((e) => e.contactId).filter((id): id is string => !!id),
  );

  // Toda contactId que precisamos de UTM
  const allContactIds = Array.from(
    new Set([...yesterdayContactIds, ...yesterdayMeetingContactIds]),
  );
  if (allContactIds.length === 0) return [];

  const trackings = await prisma.leadTracking.findMany({
    where: { contactId: { in: allContactIds }, utmCampaign: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { contactId: true, utmSource: true, utmCampaign: true },
  });
  const utmByContact = new Map<string, { source: string | null; campaign: string }>();
  for (const t of trackings) {
    if (t.utmCampaign && !utmByContact.has(t.contactId)) {
      utmByContact.set(t.contactId, { source: t.utmSource, campaign: t.utmCampaign });
    }
  }

  // Agrega por campanha
  const rowsByCampaign = new Map<string, CrmCampaignRow>();
  const ensureRow = (campaign: string, source: string | null) => {
    if (!rowsByCampaign.has(campaign)) {
      rowsByCampaign.set(campaign, { utmCampaign: campaign, utmSource: source, leads: 0, meetings: 0, spend: 0 });
    }
    return rowsByCampaign.get(campaign)!;
  };

  for (const dealContactId of yesterdayContactIds) {
    const utm = utmByContact.get(dealContactId);
    if (!utm) continue;
    ensureRow(utm.campaign, utm.source).leads += 1;
  }
  for (const meetingContactId of yesterdayMeetingContactIds) {
    const utm = utmByContact.get(meetingContactId);
    if (!utm) continue;
    ensureRow(utm.campaign, utm.source).meetings += 1;
  }

  return Array.from(rowsByCampaign.values()).sort((a, b) => b.leads - a.leads);
}

/**
 * Cruza reuniões por campanha via CalendlyEvent → Contact → LeadTracking → utmCampaign.
 *
 * Estratégia: pra cada CalendlyEvent criado ontem com contactId, busca o
 * LeadTracking MAIS ANTIGO desse contato com utmCampaign não-nulo (= primeira
 * fonte de aquisição). Conta reuniões agrupadas por utmCampaign, depois casa
 * com o nome OU id da campanha vinda do Meta/Google.
 *
 * Match: tenta exato no campaignName, depois exato no campaignId, depois
 * substring (utm contém name ou name contém utm) pra tolerar variações de
 * encoding/case.
 */
async function getMeetingsPerCampaign(
  campaigns: AdsCampaignSpend[],
  date: Date,
): Promise<Map<string, number>> {
  if (campaigns.length === 0) return new Map();

  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const events = await prisma.calendlyEvent.findMany({
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      status: 'active',
      contactId: { not: null },
    },
    select: { contactId: true },
  });

  const contactIds = events
    .map((e) => e.contactId)
    .filter((id): id is string => !!id);
  if (contactIds.length === 0) return new Map();

  const trackings = await prisma.leadTracking.findMany({
    where: { contactId: { in: contactIds }, utmCampaign: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { contactId: true, utmCampaign: true },
  });

  // Primeira utmCampaign por contato = fonte de aquisição
  const utmByContact = new Map<string, string>();
  for (const t of trackings) {
    if (t.utmCampaign && !utmByContact.has(t.contactId)) {
      utmByContact.set(t.contactId, t.utmCampaign);
    }
  }

  // Agrega por utmCampaign
  const meetingsByUtm = new Map<string, number>();
  for (const event of events) {
    if (!event.contactId) continue;
    const utm = utmByContact.get(event.contactId);
    if (!utm) continue;
    meetingsByUtm.set(utm, (meetingsByUtm.get(utm) ?? 0) + 1);
  }

  // Casa utmCampaign com Meta/Google campaigns (exact, depois fuzzy)
  const result = new Map<string, number>();
  for (const [utm, count] of meetingsByUtm) {
    const utmLower = utm.toLowerCase();
    const matched = campaigns.find((c) => {
      const nameLower = c.campaignName.toLowerCase();
      return (
        c.campaignName === utm ||
        c.campaignId === utm ||
        nameLower === utmLower ||
        nameLower.includes(utmLower) ||
        utmLower.includes(nameLower)
      );
    });
    if (matched) {
      result.set(matched.campaignId, (result.get(matched.campaignId) ?? 0) + count);
    } else {
      console.log(
        `[paidTrafficSection] utmCampaign "${utm}" (${count} reuniões) sem match com nenhuma campanha ativa do dia.`,
      );
    }
  }

  return result;
}

// ─── PaidTrafficSection ──────────────────────────────────────────────────────

export class PaidTrafficSection implements ReportSection {
  constructor(private referenceDate: Date) {}

  async render(): Promise<string> {
    try {
      const data = await this.gatherData();
      return this.buildHtml(data);
    } catch (err) {
      console.error('[paidTrafficSection] erro ao renderizar:', err);
      return this.buildErrorFallback();
    }
  }

  private async gatherData(): Promise<PaidTrafficData> {
    const [metaDaily, googleDaily, mtdMeta, mtdGoogle, leadsTotalDay, meetingsScheduledDay, paidLeadsMTD] =
      await Promise.all([
        getMetaAdsDaily(this.referenceDate),
        getGoogleAdsDaily(this.referenceDate),
        getMetaAdsMTD(this.referenceDate),
        getGoogleAdsMTD(this.referenceDate),
        countLeadsCreatedOn(this.referenceDate),
        countMeetingsScheduledOn(this.referenceDate),
        countPaidLeadsMTD(this.referenceDate),
      ]);

    // ⚠️ ContIA/finhub retorna o array `campaigns` como dados ACUMULADOS (lifetime),
    // não diários. Confiamos só em totalSpend/totalLeads pra valores diários.
    // Pro detalhamento por campanha, usamos a LeadTracking do próprio CRM (funciona
    // mesmo quando Meta atrasa em consolidar o spend do dia anterior).

    const crmCampaigns = await getCrmCampaignBreakdown(this.referenceDate);

    // Enriquece cada linha do CRM com spend matched do Meta/Google ads
    // (match exato → fuzzy por substring/case-insensitive).
    const allAdsCampaigns: AdsCampaignSpend[] = [
      ...metaDaily.campaigns,
      ...googleDaily.campaigns,
    ];
    for (const row of crmCampaigns) {
      const utmLower = row.utmCampaign.toLowerCase();
      const matched = allAdsCampaigns.find((c) => {
        const nameLower = c.campaignName.toLowerCase();
        return (
          c.campaignName === row.utmCampaign ||
          c.campaignId === row.utmCampaign ||
          nameLower === utmLower ||
          nameLower.includes(utmLower) ||
          utmLower.includes(nameLower)
        );
      });
      row.spend = matched?.spend ?? 0;
    }

    return {
      referenceDate: this.referenceDate,
      metaDaily,
      googleDaily,
      mtdMeta,
      mtdGoogle,
      leadsTotalDay,
      meetingsScheduledDay,
      meetingsPerCampaign: new Map(),
      crmCampaigns,
      paidLeadsMTD,
    };
  }

  // ─── Build HTML ─────────────────────────────────────────────────────────────

  private buildHtml(d: PaidTrafficData): string {
    const totalSpend = d.metaDaily.totalSpend + d.googleDaily.totalSpend;
    const mtdTotalSpend = d.mtdMeta.spend + d.mtdGoogle.spend;
    // Leads do mês: usa contagem do CRM, NÃO o monthToDate.leads do Meta API.
    // Meta conta como "lead" toda ação (clique/iniciar mensagem) e infla 2-3x
    // sobre o que efetivamente vira registro no CRM.
    const mtdTotalLeads = d.paidLeadsMTD;

    // Leads pagos: usa contagem do CRM (LeadTracking com utm_source de fonte paga).
    // Meta às vezes atrasa em consolidar leads do dia anterior (delay 24-48h),
    // mas o CRM registra a hora que o lead chega via webhook GreatPages com UTMs.
    const leadsPaid = d.crmCampaigns.reduce(
      (sum, r) => sum + ((r.utmSource ?? '').match(PAID_SOURCE_RX) ? r.leads : 0),
      0,
    );

    // "Sem investimento" só se TUDO está zerado: spend daily, leads do CRM e
    // sem dados de campanha. Antes ocultava a seção mesmo quando havia leads
    // tracked do CRM (Meta com delay).
    // Se status for STALE (live+snapshot ambos zerados — falha invisível),
    // NUNCA mostra "sem investimento" — força os cards zerados aparecerem
    // junto do banner de alerta vermelho.
    const isStale = d.metaDaily.connectionStatus === 'STALE' || d.googleDaily.connectionStatus === 'STALE';
    const noAds = !isStale && totalSpend === 0 && leadsPaid === 0 && d.crmCampaigns.length === 0;

    const costPerLeadPaid = leadsPaid > 0 && totalSpend > 0 ? totalSpend / leadsPaid : null;
    const mtdCPL = mtdTotalLeads > 0 ? mtdTotalSpend / mtdTotalLeads : null;
    const costPerMeeting = d.meetingsScheduledDay > 0 && totalSpend > 0 ? totalSpend / d.meetingsScheduledDay : null;

    const dateLabel = formatDate(d.referenceDate);
    const dateLabelFull = formatDateFull(d.referenceDate);
    const monthName = formatMonthName(d.referenceDate);

    return `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto 32px;">

  <!-- ── Header ── -->
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">Tráfego Pago</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">
      Data de referência: ${dateLabelFull} &nbsp;·&nbsp; Meta Ads + Google Ads
    </p>
  </div>

  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px;">

    ${this.buildConnectionWarnings(d.metaDaily.connectionStatus, d.googleDaily.connectionStatus)}

    ${noAds ? this.buildNoAdsBlock() : this.buildOverviewBlock(d, totalSpend, leadsPaid, costPerLeadPaid, mtdCPL, mtdTotalLeads, mtdTotalSpend, dateLabel)}

    <!-- ── Custo por Reunião Agendada ── -->
    <div style="margin-top:24px;">
      <p style="font-size:13px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
        Custo por Reunião Agendada
      </p>
      <div style="display:flex;gap:12px;">
        ${this.buildCard(
          'REUNIÕES AGENDADAS ONTEM',
          d.meetingsScheduledDay === 0 ? '0' : String(d.meetingsScheduledDay),
          d.meetingsScheduledDay === 0 ? 'nenhuma reunião marcada' : `ontem (${dateLabel})`,
          '#374151',
        )}
        ${this.buildCard(
          'CUSTO / REUNIÃO AGENDADA',
          costPerMeeting !== null ? formatBRL(costPerMeeting) : '—',
          d.meetingsScheduledDay === 0 ? 'sem base (0 agend.)' : `gasto total ÷ ${d.meetingsScheduledDay} reuniões`,
          costPerMeeting !== null ? '#1e40af' : '#374151',
        )}
      </div>
    </div>

    <!-- ── Detalhamento por Campanha (vindo do CRM via LeadTracking) ── -->
    ${this.buildCrmCampaignTable(d, dateLabel)}

    <!-- ── Google Ads sem dados ── -->
    ${this.buildGoogleAdsNote(d, dateLabelFull)}

    <!-- ── Footer ── -->
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin:20px 0 0;border-top:1px solid #f3f4f6;padding-top:12px;">
      Fonte: Meta Ads (finhub) · Google Ads (finhub) · CRM BGPGO — Gerado automaticamente<br>
      Relatório referente a ${dateLabelFull}
    </p>

  </div>
</div>`;
  }

  // ─── Banner de "sem conexão" ─────────────────────────────────────────────────

  private buildConnectionWarnings(
    metaStatus: ConnectionStatus | undefined,
    googleStatus: ConnectionStatus | undefined,
  ): string {
    const labelFor = (s: ConnectionStatus): string => {
      if (s === 'NO_CONFIG') return 'não configurado';
      if (s === 'STALE') return 'dados indisponíveis (live + snapshot zerados — verificar manualmente)';
      return 'sem conexão';
    };
    const isStale = metaStatus === 'STALE' || googleStatus === 'STALE';
    const warnings: string[] = [];
    if (metaStatus && metaStatus !== 'OK') warnings.push(`Meta Ads ${labelFor(metaStatus)}`);
    if (googleStatus && googleStatus !== 'OK') warnings.push(`Google Ads ${labelFor(googleStatus)}`);
    if (warnings.length === 0) return '';

    // STALE = falha invisível (live e snapshot ambos zeraram). Banner vermelho
    // pra forçar atenção em vez do "sem investimento ontem" silencioso.
    const bg = isStale ? '#fee2e2' : '#fef3c7';
    const border = isStale ? '#fca5a5' : '#fcd34d';
    const fg = isStale ? '#991b1b' : '#92400e';
    const prefix = isStale ? '🚨 ALERTA:' : '⚠ Atenção:';
    const suffix = isStale
      ? ' Possíveis causas: token expirado, Meta API instável, ou cron noturno furado. Confira no Gerenciador de Anúncios.'
      : ' Os números abaixo podem estar zerados por falta de dados.';
    return `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:${fg};">
      <strong>${prefix}</strong> ${warnings.join(' · ')}.${suffix}
    </div>`;
  }

  // ─── Bloco "sem investimento" ────────────────────────────────────────────────

  private buildNoAdsBlock(): string {
    return `
    <div style="text-align:center;padding:32px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
      <p style="font-size:16px;color:#6b7280;margin:0;font-weight:bold;">Sem investimento em ads ontem</p>
      <p style="font-size:13px;color:#9ca3af;margin:6px 0 0;">Nenhum gasto registrado em Meta Ads ou Google Ads para a data de referência.</p>
    </div>`;
  }

  // ─── Cards de visão geral ────────────────────────────────────────────────────

  private buildOverviewBlock(
    d: PaidTrafficData,
    totalSpend: number,
    leadsPaid: number,
    costPerLeadPaid: number | null,
    mtdCPL: number | null,
    mtdTotalLeads: number,
    mtdTotalSpend: number,
    dateLabel: string,
  ): string {
    const monthName = formatMonthName(d.referenceDate);
    return `
    <p style="font-size:13px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
      Visão Geral — Ontem (${dateLabel})
    </p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      ${this.buildCard(
        'GASTO TOTAL',
        formatBRL(totalSpend),
        'Meta + Google',
        '#1e40af',
      )}
      ${this.buildCard(
        'LEADS PAGOS',
        String(leadsPaid),
        `de ${d.leadsTotalDay} leads totais`,
        '#374151',
      )}
      ${this.buildCard(
        'CUSTO / LEAD PAGO',
        costPerLeadPaid !== null ? formatBRL(costPerLeadPaid) : '—',
        'tráfego pago',
        costPerLeadPaid !== null ? '#1e40af' : '#374151',
      )}
      ${this.buildCard(
        `CPL MÉDIO (${monthName})`,
        mtdCPL !== null ? formatBRL(mtdCPL) : '—',
        `${mtdTotalLeads} leads, ${formatBRL(mtdTotalSpend)}`,
        mtdCPL !== null ? '#1e40af' : '#374151',
      )}
    </div>`;
  }

  // ─── Card genérico ────────────────────────────────────────────────────────────

  private buildCard(
    label: string,
    value: string,
    subtitle: string,
    valueColor: string,
  ): string {
    return `
    <div style="flex:1;min-width:140px;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;">
      <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${label}</p>
      <p style="font-size:24px;font-weight:bold;color:${valueColor};margin:0 0 4px;">${value}</p>
      <p style="font-size:11px;color:#9ca3af;margin:0;">${subtitle}</p>
    </div>`;
  }

  // ─── Tabela de campanhas vindo do CRM (LeadTracking) ─────────────────────────

  private buildCrmCampaignTable(d: PaidTrafficData, dateLabel: string): string {
    const rows = d.crmCampaigns;
    const totalLeads = rows.reduce((s, r) => s + r.leads, 0);
    const totalMeetings = rows.reduce((s, r) => s + r.meetings, 0);
    const totalSpend = d.metaDaily.totalSpend + d.googleDaily.totalSpend;

    if (rows.length === 0) {
      return `
    <div style="margin-top:24px;">
      <p style="font-size:13px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
        Detalhamento por Campanha — ${dateLabel}
      </p>
      <p style="font-size:13px;color:#9ca3af;text-align:center;padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
        Nenhum lead vindo de campanha rastreada (UTM) ontem.
      </p>
    </div>`;
    }

    // Banner se Meta zerou mas CRM tem leads pagos — sinal de delay no Meta
    const metaIsBlankWithPaidLeads =
      d.metaDaily.totalSpend === 0 &&
      rows.some((r) => (r.utmSource ?? '').toLowerCase().match(/facebook|instagram|meta/));
    const delayBanner = metaIsBlankWithPaidLeads
      ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#92400e;">
           ⚠ Meta Ads ainda não consolidou o gasto de ${dateLabel} (delay de 24-48h é normal). Os leads abaixo são reais — o spend aparece com mais precisão amanhã ou depois.
         </div>`
      : '';

    const matchedSpendTotal = rows.reduce((s, r) => s + r.spend, 0);
    const unattributedSpend = Math.max(0, totalSpend - matchedSpendTotal);

    const campaignRows = rows
      .map((r) => {
        const sourceTag = (r.utmSource ?? '').toLowerCase();
        const tag = sourceTag.match(/facebook|instagram|meta/)
          ? '[M]'
          : sourceTag.match(/google|adwords/)
          ? '[G]'
          : sourceTag
          ? `[${r.utmSource?.slice(0, 3).toUpperCase()}]`
          : '';
        const cpl = r.leads > 0 && r.spend > 0 ? r.spend / r.leads : null;
        const cpm = r.meetings > 0 && r.spend > 0 ? r.spend / r.meetings : null;
        return `
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#374151;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span style="font-size:10px;color:#9ca3af;margin-right:4px;">${tag}</span>${this.escapeHtml(r.utmCampaign)}
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${r.spend > 0 ? formatBRL(r.spend) : '—'}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${r.leads}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${r.meetings}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${cpl !== null ? formatBRL(cpl) : '—'}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${cpm !== null ? formatBRL(cpm) : '—'}</td>
        </tr>`;
      })
      .join('');

    const totalCPL = totalLeads > 0 && totalSpend > 0 ? totalSpend / totalLeads : null;
    const totalCPM = totalMeetings > 0 && totalSpend > 0 ? totalSpend / totalMeetings : null;

    return `
    <div style="margin-top:24px;">
      <p style="font-size:13px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
        Detalhamento por Campanha — ${dateLabel}
      </p>
      ${delayBanner}
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Campanha (UTM)</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Gasto</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Leads</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Reuniões</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Custo/Lead</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Custo/Reunião</th>
          </tr>
        </thead>
        <tbody>
          ${campaignRows}
          <tr style="font-weight:bold;background:#f9fafb;border-top:2px solid #e5e7eb;">
            <td style="padding:10px 12px;font-size:13px;color:#374151;">TOTAL</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${formatBRL(totalSpend)}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${totalLeads}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${totalMeetings}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${totalCPL !== null ? formatBRL(totalCPL) : '—'}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${totalCPM !== null ? formatBRL(totalCPM) : '—'}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">
        Fonte: leads e reuniões do CRM (LeadTracking + CalendlyEvent); gasto por campanha do Meta/Google Ads via match de nome.${unattributedSpend > 0 ? ` Não atribuído a campanha do CRM: ${formatBRL(unattributedSpend)}.` : ''}
      </p>
    </div>`;
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Nota Google Ads ──────────────────────────────────────────────────────────

  private buildGoogleAdsNote(d: PaidTrafficData, dateLabelFull: string): string {
    if (d.googleDaily.totalSpend > 0 || d.googleDaily.campaigns.length > 0) {
      return ''; // Google Ads tem dados — já mostrado na tabela
    }

    const mtdGoogleLabel =
      d.mtdGoogle.spend > 0 ? `gasto MTD: ${formatBRL(d.mtdGoogle.spend)}` : 'sem gasto MTD';

    return `
    <p style="font-size:12px;color:#9ca3af;margin:16px 0 0;padding-top:12px;border-top:1px solid #f3f4f6;">
      Google Ads — sem dados para ${dateLabelFull} (${mtdGoogleLabel})
    </p>`;
  }

  // ─── Fallback de erro ─────────────────────────────────────────────────────────

  private buildErrorFallback(): string {
    return `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;">
  Erro ao gerar seção de Tráfego Pago. Verifique os logs do servidor.
</div>`;
  }
}
