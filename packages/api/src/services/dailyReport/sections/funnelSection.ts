import type { ReportSection } from '../types';
import prisma from '../../../lib/prisma';

// ─── Constantes do pipeline ──────────────────────────────────────────────────

const STAGES = {
  LEAD:                  '64fb7516ea4eb400219457df',
  CONTATO_FEITO:         '65bd0418294535000d1f57cd',
  MARCAR_REUNIAO:        '64fb7516ea4eb400219457e0',
  REUNIAO_AGENDADA:      '64fb7517ea4eb400219457e1',
  PROPOSTA_ENVIADA:      '64fb7517ea4eb400219457e2',
  AGUARDANDO_DADOS:      '661d5a409a6525001ed04124',
  AGUARDANDO_ASSINATURA: '64fb7517ea4eb400219457e3',
  GANHO_FECHADO:         '65084ece058c5700170506d4',
};

const STAGE_NAMES = {
  CONTATO_FEITO:         'Contato feito',
  MARCAR_REUNIAO:        'Marcar reunião',
  REUNIAO_AGENDADA:      'Reunião agendada',
  PROPOSTA_ENVIADA:      'Proposta enviada',
  AGUARDANDO_DADOS:      'Aguardando dados',
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  GANHO_FECHADO:         'Ganho fechado',
};

const PIPELINE_ID = '64fb7516ea4eb400219457de';

// BRT = UTC-3 (offset em milissegundos)
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface StageMetrics {
  total: number;
  value: number;
}

interface FunnelData {
  // Leads
  leadsYesterday: number;
  // Contato feito
  contatoFeitoTotal: StageMetrics;
  contatoFeitoSairamOntem: number;
  // Marcar reunião
  marcarReuniaoTotal: StageMetrics;
  marcaramReuniaoOntem: number;
  // Reunião agendada
  reuniaoAgendadaTotal: StageMetrics;
  reuniaoVirouPropostaOntem: number;
  // Proposta enviada
  propostaEnviadaTotal: StageMetrics;
  propostaVirouDadosOntem: number;
  // Aguardando dados
  aguardandoDadosTotal: StageMetrics;
  dadosVirouAssinaturaOntem: number;
  // Aguardando assinatura
  aguardandoAssinaturaTotal: StageMetrics;
  // Ganho fechado
  ganhoOntem: StageMetrics;
  ganhoMes: StageMetrics;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retorna meia-noite em BRT (como Date UTC) para a data UTC fornecida.
 * Ex.: se utcDate é 2026-04-06T10:00:00Z (= 07:00 BRT),
 * retorna 2026-04-06T03:00:00Z (= 00:00 BRT do dia 6 de abril).
 */
function startOfDayBRT(utcDate: Date): Date {
  const brtTime = utcDate.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtTime);
  const midnightBRT = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  return new Date(midnightBRT.getTime() - BRT_OFFSET_MS);
}

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── FunnelSection ───────────────────────────────────────────────────────────

export class FunnelSection implements ReportSection {
  constructor(private referenceDate: Date) {}

  async render(): Promise<string> {
    try {
      const data = await this.gatherData();
      const dateLabel = this.referenceDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo',
      });
      return this.buildHtml(data, dateLabel);
    } catch (err) {
      console.error('[funnelSection] erro ao renderizar seção do funil:', err);
      return this.buildErrorFallback();
    }
  }

  private async gatherData(): Promise<FunnelData> {
    // referenceDate já é "ontem em BRT" passado pelo orquestrador
    const dayStart = startOfDayBRT(this.referenceDate); // 00:00 BRT de referenceDate
    const dayEnd = new Date(dayStart.getTime() + 86400000); // 00:00 BRT do dia seguinte

    // Primeiro dia do mês em BRT (a partir de referenceDate)
    const brtRef = new Date(this.referenceDate.getTime() + BRT_OFFSET_MS);
    const monthStart = new Date(
      Date.UTC(brtRef.getUTCFullYear(), brtRef.getUTCMonth(), 1) - BRT_OFFSET_MS,
    );

    const openFilter = { pipelineId: PIPELINE_ID, status: 'OPEN' as const };

    // Conta + soma valor de uma etapa (deals em aberto)
    const stageMetrics = async (stageId: string): Promise<StageMetrics> => {
      const deals = await prisma.deal.findMany({
        where: { ...openFilter, stageId },
        select: { value: true },
      });
      const value = deals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
      return { total: deals.length, value };
    };

    // Conta mudanças de etapa PARA uma etapa (por nome) no dia de referência
    const movedToDay = async (toStageName: string): Promise<number> => {
      return prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['toStage'], string_contains: toStageName },
        },
      });
    };

    // Conta mudanças de etapa DE uma etapa (por nome) no dia de referência
    const movedFromDay = async (fromStageName: string): Promise<number> => {
      return prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['fromStage'], string_contains: fromStageName },
        },
      });
    };

    // Leads criados no dia de referência
    const leadsYesterday = await prisma.deal.count({
      where: {
        pipelineId: PIPELINE_ID,
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    });

    // Totais por etapa (funil em andamento)
    const [
      contatoFeitoTotal,
      marcarReuniaoTotal,
      reuniaoAgendadaTotal,
      propostaEnviadaTotal,
      aguardandoDadosTotal,
      aguardandoAssinaturaTotal,
    ] = await Promise.all([
      stageMetrics(STAGES.CONTATO_FEITO),
      stageMetrics(STAGES.MARCAR_REUNIAO),
      stageMetrics(STAGES.REUNIAO_AGENDADA),
      stageMetrics(STAGES.PROPOSTA_ENVIADA),
      stageMetrics(STAGES.AGUARDANDO_DADOS),
      stageMetrics(STAGES.AGUARDANDO_ASSINATURA),
    ]);

    // Movimentações do dia de referência
    const [
      contatoFeitoSairamOntem,
      marcaramReuniaoOntem,
      reuniaoVirouPropostaOntem,
      propostaVirouDadosOntem,
      dadosVirouAssinaturaOntem,
    ] = await Promise.all([
      movedFromDay(STAGE_NAMES.CONTATO_FEITO),
      movedToDay(STAGE_NAMES.REUNIAO_AGENDADA),
      movedToDay(STAGE_NAMES.PROPOSTA_ENVIADA),
      movedToDay(STAGE_NAMES.AGUARDANDO_DADOS),
      movedToDay(STAGE_NAMES.AGUARDANDO_ASSINATURA),
    ]);

    // Ganho fechado no dia de referência
    const ganhosOntem = await prisma.deal.findMany({
      where: {
        pipelineId: PIPELINE_ID,
        status: 'WON',
        closedAt: { gte: dayStart, lt: dayEnd },
      },
      select: { value: true },
    });
    const ganhoOntem: StageMetrics = {
      total: ganhosOntem.length,
      value: ganhosOntem.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0),
    };

    // Ganho fechado no mês (monthStart até dayEnd cobre o dia de referência)
    const ganhosMes = await prisma.deal.findMany({
      where: {
        pipelineId: PIPELINE_ID,
        status: 'WON',
        closedAt: { gte: monthStart, lt: dayEnd },
      },
      select: { value: true },
    });
    const ganhoMes: StageMetrics = {
      total: ganhosMes.length,
      value: ganhosMes.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0),
    };

    return {
      leadsYesterday,
      contatoFeitoTotal,
      contatoFeitoSairamOntem,
      marcarReuniaoTotal,
      marcaramReuniaoOntem,
      reuniaoAgendadaTotal,
      reuniaoVirouPropostaOntem,
      propostaEnviadaTotal,
      propostaVirouDadosOntem,
      aguardandoDadosTotal,
      dadosVirouAssinaturaOntem,
      aguardandoAssinaturaTotal,
      ganhoOntem,
      ganhoMes,
    };
  }

  private buildHtml(data: FunnelData, dateLabel: string): string {
    const rows: Array<{
      label: string;
      yesterday: string;
      funnel: string;
      isSpacer?: boolean;
      isHighlight?: boolean;
    }> = [
      { label: 'Leads que entraram ontem', yesterday: String(data.leadsYesterday), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Contato Feito — total no funil', yesterday: '', funnel: String(data.contatoFeitoTotal.total) },
      { label: 'Saíram de Contato Feito ontem', yesterday: String(data.contatoFeitoSairamOntem), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Marcar Reunião — total no funil', yesterday: '', funnel: String(data.marcarReuniaoTotal.total) },
      { label: 'Marcaram reunião ontem', yesterday: String(data.marcaramReuniaoOntem), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Reunião Agendada — total no funil', yesterday: '', funnel: String(data.reuniaoAgendadaTotal.total) },
      { label: 'Viraram Proposta ontem', yesterday: String(data.reuniaoVirouPropostaOntem), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Proposta Enviada — total no funil', yesterday: '', funnel: `${data.propostaEnviadaTotal.total} (${brl(data.propostaEnviadaTotal.value)})` },
      { label: 'Viraram Aguardando Dados ontem', yesterday: String(data.propostaVirouDadosOntem), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Aguardando Dados — total no funil', yesterday: '', funnel: `${data.aguardandoDadosTotal.total} (${brl(data.aguardandoDadosTotal.value)})` },
      { label: 'Viraram Aguardando Assinatura ontem', yesterday: String(data.dadosVirouAssinaturaOntem), funnel: '' },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Aguardando Assinatura — total no funil', yesterday: '', funnel: `${data.aguardandoAssinaturaTotal.total} (${brl(data.aguardandoAssinaturaTotal.value)})` },
      { label: '', yesterday: '', funnel: '', isSpacer: true },
      { label: 'Ganho Fechado ontem', yesterday: `${data.ganhoOntem.total} (${brl(data.ganhoOntem.value)})`, funnel: '', isHighlight: true },
      { label: 'Ganho Fechado — total do mês', yesterday: '', funnel: `${data.ganhoMes.total} (${brl(data.ganhoMes.value)})`, isHighlight: true },
    ];

    const rowsHtml = rows
      .map(r => {
        if (r.isSpacer) {
          return '<tr><td colspan="3" style="padding:4px 0;border-bottom:1px solid #f3f4f6;">&nbsp;</td></tr>';
        }
        const bg = r.isHighlight ? 'background:#ecfdf5;' : '';
        const fw = r.isHighlight ? 'font-weight:bold;' : '';
        return `
      <tr style="${bg}">
        <td style="padding:10px 12px;font-size:14px;color:#374151;${fw}">${r.label}</td>
        <td style="padding:10px 12px;font-size:14px;text-align:center;color:#1d4ed8;${fw}">${r.yesterday}</td>
        <td style="padding:10px 12px;font-size:14px;text-align:center;color:#374151;${fw}">${r.funnel}</td>
      </tr>`;
      })
      .join('');

    return `
<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:white;margin:0;font-size:22px;">Relatório Diário do Funil</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${dateLabel}</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Métrica</th>
          <th style="padding:12px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Ontem</th>
          <th style="padding:12px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Total Funil</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <p style="padding:16px;font-size:11px;color:#9ca3af;text-align:center;margin:0;">Enviado automaticamente pelo CRM BGPGO</p>
  </div>
</div>`;
  }

  private buildErrorFallback(): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;">
        Erro ao gerar seção do funil. Verifique logs.
      </div>
    `;
  }
}
