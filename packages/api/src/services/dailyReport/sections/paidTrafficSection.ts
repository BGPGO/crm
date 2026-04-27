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

interface PaidTrafficData {
  referenceDate: Date;
  metaDaily: DailyAdsSpend;
  googleDaily: DailyAdsSpend;
  mtdMeta: { spend: number; leads: number };
  mtdGoogle: { spend: number; leads: number };
  leadsTotalDay: number;
  meetingsScheduledDay: number;
  meetingsPerCampaign: Map<string, number>;
}

// ─── Queries no CRM ──────────────────────────────────────────────────────────

async function countLeadsCreatedOn(date: Date): Promise<number> {
  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return prisma.deal.count({
    where: {
      pipelineId: PIPELINE_ID,
      createdAt: { gte: dayStart, lt: dayEnd },
    },
  });
}

async function countMeetingsScheduledOn(date: Date): Promise<number> {
  const dayStart = startOfDayBRT(date);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return prisma.activity.count({
    where: {
      type: 'STAGE_CHANGE',
      createdAt: { gte: dayStart, lt: dayEnd },
      deal: { pipelineId: PIPELINE_ID },
      metadata: { path: ['toStage'], string_contains: 'Reunião agendada' },
    },
  });
}

/**
 * Tenta cruzar reuniões por campanha via Deal.utmCampaign.
 * Deal não tem utmCampaign diretamente — a tabela LeadTracking tem, mas não há
 * join direto via Activity. Retorna map vazio (fallback gracioso).
 */
async function getMeetingsPerCampaign(
  _campaigns: AdsCampaignSpend[],
  _date: Date,
): Promise<Map<string, number>> {
  // Deal.utmCampaign não existe no schema (está em LeadTracking).
  // Fallback: todas as campanhas ficam com meetings = 0.
  // Quando o schema suportar o cruzamento, implementar aqui.
  return new Map<string, number>();
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
    const [metaDaily, googleDaily, mtdMeta, mtdGoogle, leadsTotalDay, meetingsScheduledDay] =
      await Promise.all([
        getMetaAdsDaily(this.referenceDate),
        getGoogleAdsDaily(this.referenceDate),
        getMetaAdsMTD(this.referenceDate),
        getGoogleAdsMTD(this.referenceDate),
        countLeadsCreatedOn(this.referenceDate),
        countMeetingsScheduledOn(this.referenceDate),
      ]);

    const allCampaigns: AdsCampaignSpend[] = [
      ...metaDaily.campaigns,
      ...googleDaily.campaigns,
    ];

    const meetingsPerCampaign = await getMeetingsPerCampaign(allCampaigns, this.referenceDate);

    return {
      referenceDate: this.referenceDate,
      metaDaily,
      googleDaily,
      mtdMeta,
      mtdGoogle,
      leadsTotalDay,
      meetingsScheduledDay,
      meetingsPerCampaign,
    };
  }

  // ─── Build HTML ─────────────────────────────────────────────────────────────

  private buildHtml(d: PaidTrafficData): string {
    const totalSpend = d.metaDaily.totalSpend + d.googleDaily.totalSpend;
    const leadsPaid = d.metaDaily.totalLeads + d.googleDaily.totalLeads;
    const mtdTotalSpend = d.mtdMeta.spend + d.mtdGoogle.spend;
    const mtdTotalLeads = d.mtdMeta.leads + d.mtdGoogle.leads;

    const noAds = totalSpend === 0 && leadsPaid === 0;

    const costPerLeadPaid = leadsPaid > 0 ? totalSpend / leadsPaid : null;
    const mtdCPL = mtdTotalLeads > 0 ? mtdTotalSpend / mtdTotalLeads : null;
    const costPerMeeting = d.meetingsScheduledDay > 0 ? totalSpend / d.meetingsScheduledDay : null;

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

    <!-- ── Detalhamento por Campanha ── -->
    ${noAds ? '' : this.buildCampaignTable(d, dateLabel)}

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
    const warnings: string[] = [];
    if (metaStatus && metaStatus !== 'OK') {
      warnings.push(`Meta Ads ${metaStatus === 'NO_CONFIG' ? 'não configurado' : 'sem conexão'}`);
    }
    if (googleStatus && googleStatus !== 'OK') {
      warnings.push(`Google Ads ${googleStatus === 'NO_CONFIG' ? 'não configurado' : 'sem conexão'}`);
    }
    if (warnings.length === 0) return '';
    return `
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e;">
      <strong>⚠ Atenção:</strong> ${warnings.join(' · ')}. Os números abaixo podem estar zerados por falta de dados.
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

  // ─── Tabela de campanhas ──────────────────────────────────────────────────────

  private buildCampaignTable(d: PaidTrafficData, dateLabel: string): string {
    const allCampaigns: AdsCampaignSpend[] = [
      ...d.metaDaily.campaigns,
      ...d.googleDaily.campaigns,
    ];

    const totalSpend = d.metaDaily.totalSpend + d.googleDaily.totalSpend;
    const totalLeads = d.metaDaily.totalLeads + d.googleDaily.totalLeads;
    const totalMeetings = d.meetingsScheduledDay; // total geral, não por campanha

    const campaignRows = allCampaigns.length === 0
      ? `<tr>
          <td colspan="6" style="padding:16px 12px;font-size:13px;color:#9ca3af;text-align:center;">
            Sem campanhas ativas
          </td>
        </tr>`
      : allCampaigns.map(c => {
          const meetings = d.meetingsPerCampaign.get(c.campaignId) ?? 0;
          const cpl = c.leads > 0 ? c.spend / c.leads : null;
          const cpm = meetings > 0 ? c.spend / meetings : null;
          const source = c.campaignId.startsWith('google') ? '[G]' : '[M]';
          return `
          <tr>
            <td style="padding:10px 12px;font-size:13px;color:#374151;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              <span style="font-size:10px;color:#9ca3af;margin-right:4px;">${source}</span>${c.campaignName}
            </td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${formatBRL(c.spend)}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${c.leads}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:center;">${meetings}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${cpl !== null ? formatBRL(cpl) : '—'}</td>
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">${cpm !== null ? formatBRL(cpm) : '—'}</td>
          </tr>`;
        }).join('');

    const totalCPL = totalLeads > 0 ? totalSpend / totalLeads : null;

    return `
    <div style="margin-top:24px;">
      <p style="font-size:13px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">
        Detalhamento por Campanha — ${dateLabel}
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Campanha</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Gasto</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Leads</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Reunião Agendada</th>
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
            <td style="padding:10px 12px;font-size:13px;color:#374151;text-align:right;">—</td>
          </tr>
        </tbody>
      </table>
    </div>`;
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
