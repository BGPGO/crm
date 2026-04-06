import prisma from '../lib/prisma';
import { Resend } from 'resend';
// Stage IDs — pipeline "Vendas"
const STAGES = {
  LEAD:                 '64fb7516ea4eb400219457df',
  CONTATO_FEITO:        '65bd0418294535000d1f57cd',
  MARCAR_REUNIAO:       '64fb7516ea4eb400219457e0',
  REUNIAO_AGENDADA:     '64fb7517ea4eb400219457e1',
  PROPOSTA_ENVIADA:     '64fb7517ea4eb400219457e2',
  AGUARDANDO_DADOS:     '661d5a409a6525001ed04124',
  AGUARDANDO_ASSINATURA:'64fb7517ea4eb400219457e3',
  GANHO_FECHADO:        '65084ece058c5700170506d4',
};

const PIPELINE_ID = '64fb7516ea4eb400219457de';

interface StageMetrics {
  total: number;
  value: number;
}

interface ReportData {
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

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function gatherReportData(): Promise<ReportData> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const openFilter = { pipelineId: PIPELINE_ID, status: 'OPEN' as const };

  // Helper: count + sum value for a stage (open deals)
  async function stageMetrics(stageId: string): Promise<StageMetrics> {
    const deals = await prisma.deal.findMany({
      where: { ...openFilter, stageId },
      select: { value: true },
    });
    const value = deals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0);
    return { total: deals.length, value };
  }

  // Helper: count stage changes TO a stage (by name pattern) yesterday
  async function movedToYesterday(toStageName: string): Promise<number> {
    return prisma.activity.count({
      where: {
        type: 'STAGE_CHANGE',
        createdAt: { gte: yesterdayStart, lt: todayStart },
        deal: { pipelineId: PIPELINE_ID },
        metadata: { path: ['toStage'], string_contains: toStageName },
      },
    });
  }

  // Helper: count stage changes FROM a stage (by name pattern) yesterday
  async function movedFromYesterday(fromStageName: string): Promise<number> {
    return prisma.activity.count({
      where: {
        type: 'STAGE_CHANGE',
        createdAt: { gte: yesterdayStart, lt: todayStart },
        deal: { pipelineId: PIPELINE_ID },
        metadata: { path: ['fromStage'], string_contains: fromStageName },
      },
    });
  }

  // Leads criados ontem
  const leadsYesterday = await prisma.deal.count({
    where: {
      pipelineId: PIPELINE_ID,
      createdAt: { gte: yesterdayStart, lt: todayStart },
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

  // Movimentações de ontem (metadata grava nomes das etapas em toStage/fromStage)
  const [
    contatoFeitoSairamOntem,
    marcaramReuniaoOntem,
    reuniaoVirouPropostaOntem,
    propostaVirouDadosOntem,
    dadosVirouAssinaturaOntem,
  ] = await Promise.all([
    movedFromYesterday('Contato feito'),
    movedToYesterday('agendada'),
    movedToYesterday('Proposta'),
    movedToYesterday('dados'),
    movedToYesterday('assinatura'),
  ]);

  // Ganho fechado ontem
  const ganhosOntem = await prisma.deal.findMany({
    where: {
      pipelineId: PIPELINE_ID,
      status: 'WON',
      closedAt: { gte: yesterdayStart, lt: todayStart },
    },
    select: { value: true },
  });
  const ganhoOntem: StageMetrics = {
    total: ganhosOntem.length,
    value: ganhosOntem.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0),
  };

  // Ganho fechado mês
  const ganhosMes = await prisma.deal.findMany({
    where: {
      pipelineId: PIPELINE_ID,
      status: 'WON',
      closedAt: { gte: monthStart, lt: todayStart },
    },
    select: { value: true },
  });
  // Include yesterday's wins in monthly total
  const ganhoMes: StageMetrics = {
    total: ganhosMes.length + ganhoOntem.total,
    value: ganhosMes.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0) + ganhoOntem.value,
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

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildReportHtml(data: ReportData, dateLabel: string): string {
  const rows = [
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

  const rowsHtml = rows.map(r => {
    if (r.isSpacer) return '<tr><td colspan="3" style="padding:4px 0;border-bottom:1px solid #f3f4f6;">&nbsp;</td></tr>';
    const bg = r.isHighlight ? 'background:#ecfdf5;' : '';
    const fw = r.isHighlight ? 'font-weight:bold;' : '';
    return `
      <tr style="${bg}">
        <td style="padding:10px 12px;font-size:14px;color:#374151;${fw}">${r.label}</td>
        <td style="padding:10px 12px;font-size:14px;text-align:center;color:#1d4ed8;${fw}">${r.yesterday}</td>
        <td style="padding:10px 12px;font-size:14px;text-align:center;color:#374151;${fw}">${r.funnel}</td>
      </tr>`;
  }).join('');

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

export async function sendDailyReport(): Promise<void> {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.key, c.value]));
    const getConfig = (key: string, def: string) => configMap.get(key) || def;

    const enabled = getConfig('daily_report_enabled', 'true') === 'true';
    const recipients = getConfig('daily_report_emails', 'vitor@bertuzzipatrimonial.com.br,oliver@bertuzzipatrimonial.com.br');

    if (!enabled || !recipients) {
      console.log('[daily-report] Disabled or no recipients');
      return;
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[daily-report] RESEND_API_KEY not set');
      return;
    }

    console.log('[daily-report] Gathering data...');
    const data = await gatherReportData();

    const yesterday = new Date(Date.now() - 86400000);
    const dateLabel = yesterday.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const subjectDate = yesterday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject: `Relatório Diário do Funil — ${subjectDate}`,
      html: buildReportHtml(data, dateLabel),
    });

    console.log(`[daily-report] Sent to ${emails.join(', ')}`);
  } catch (err) {
    console.error('[daily-report] Error:', err);
  }
}
