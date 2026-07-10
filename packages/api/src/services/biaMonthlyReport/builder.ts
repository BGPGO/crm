/**
 * biaMonthlyReport/builder — HTML do email no layout aprovado (v7, jul/2026).
 * Tabelas + estilos inline (sobrevive ao Gmail), logos hospedadas (Gmail não
 * renderiza imagem base64), responsivo via media query.
 */
import { BiaAnalysis } from './analysis';
import { BiaMetrics, CadenceStepStat, TemplateStat } from './metrics';

const SYMBOL_URL = 'https://messenger.bertuzzipatrimonial.com.br/brand/bgp-symbol.png';
const LOGO_URL = 'https://messenger.bertuzzipatrimonial.com.br/brand/bgp-logo.png';

const PETROL = '#244C5A';
const INK = '#22333B';
const MUTED = '#5C7078';
const GOOD = '#2F7A5E';
const BAD = '#A25B3C';
const CARD = '#F2F6F6';
const CARD_WARM = '#FAF4F0';

const FONT = 'Arial,Helvetica,sans-serif';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtInt(n: number): string {
  return n.toLocaleString('pt-BR');
}

function fmtPct(part: number, total: number): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1).replace('.', ',')}%`;
}

interface Delta {
  text: string;
  color: string;
}

/** Variação percentual — `goodWhenUp` define a cor. */
function pctDelta(cur: number, prev: number, goodWhenUp: boolean): Delta {
  if (!prev) return { text: 'sem base de comparação', color: MUTED };
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 2) return { text: `estável vs mês anterior (${fmtInt(prev)})`, color: MUTED };
  const arrow = d > 0 ? '&#9650;' : '&#9660;';
  const sign = d > 0 ? '+' : '';
  const good = d > 0 ? goodWhenUp : !goodWhenUp;
  return {
    text: `${arrow} ${sign}${d.toFixed(1).replace('.', ',')}% vs mês anterior (${fmtInt(prev)})`,
    color: good ? GOOD : BAD,
  };
}

function kpiTile(num: string, label: string, delta: Delta): string {
  return `<div style="background:${CARD};border-radius:8px;padding:16px 14px;">
    <div class="kpi-num" style="font-family:${FONT};color:${PETROL};font-size:28px;font-weight:bold;">${num}</div>
    <div style="font-family:${FONT};color:${MUTED};font-size:12px;padding-top:3px;">${label}</div>
    <div style="font-family:${FONT};color:${delta.color};font-size:11px;padding-top:2px;">${delta.text}</div>
  </div>`;
}

function sectionTitle(title: string): string {
  return `<tr><td style="padding:28px 40px 8px;" class="px">
    <div style="font-family:${FONT};color:${MUTED};font-size:11px;letter-spacing:2px;text-transform:uppercase;padding-bottom:12px;border-bottom:2px solid ${PETROL};">${title}</div>
  </td></tr>`;
}

function fodaQuadrant(title: string, items: string[], accent: string, bg: string): string {
  const body = items.map((i) => `&bull; ${esc(i)}`).join('<br>');
  return `<div style="border-left:4px solid ${accent};background:${bg};border-radius:0 8px 8px 0;padding:14px 16px;">
    <div style="font-family:${FONT};color:${accent};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;padding-bottom:8px;">${title}</div>
    <div style="font-family:${FONT};color:${INK};font-size:13px;line-height:1.65;">${body}</div>
  </div>`;
}

export interface BuildReportParams {
  current: BiaMetrics;
  previous: BiaMetrics;
  analysis: BiaAnalysis;
  cadence: CadenceStepStat[];
  templates: TemplateStat[];
  periodLabel: string;
}

export function buildBiaMonthlyReportHtml(p: BuildReportParams): string {
  const { current: cur, previous: prev, analysis: ai, cadence, templates, periodLabel } = p;

  const respPctCur = cur.conversations ? (cur.responded / cur.conversations) * 100 : 0;
  const respPctPrev = prev.conversations ? (prev.responded / prev.conversations) * 100 : 0;
  const respDeltaPp = respPctCur - respPctPrev;
  const respDelta: Delta = !prev.conversations
    ? { text: 'sem base de comparação', color: MUTED }
    : Math.abs(respDeltaPp) < 1
      ? { text: `estável vs mês anterior (${fmtPct(prev.responded, prev.conversations)})`, color: MUTED }
      : {
          text: `${respDeltaPp > 0 ? '&#9650; +' : '&#9660; '}${respDeltaPp.toFixed(1).replace('.', ',')}pp vs mês anterior (${fmtPct(prev.responded, prev.conversations)})`,
          color: respDeltaPp > 0 ? GOOD : BAD,
        };

  const median = cur.medianResponseSeconds != null ? `${Math.round(cur.medianResponseSeconds)}s` : '—';
  const medianDelta: Delta =
    cur.medianResponseSeconds != null && prev.medianResponseSeconds != null
      ? Math.abs(cur.medianResponseSeconds - prev.medianResponseSeconds) < 10
        ? { text: 'estável vs mês anterior', color: MUTED }
        : { text: `mês anterior: ${Math.round(prev.medianResponseSeconds)}s`, color: MUTED }
      : { text: '', color: MUTED };

  const optDelta: Delta = !prev.optOuts && !cur.optOuts
    ? { text: 'zero nos dois meses', color: GOOD }
    : cur.optOuts < prev.optOuts
      ? { text: `&#9650; melhora (mês anterior: ${prev.optOuts})`, color: GOOD }
      : cur.optOuts > prev.optOuts
        ? { text: `&#9660; piora (mês anterior: ${prev.optOuts})`, color: BAD }
        : { text: `igual ao mês anterior (${prev.optOuts})`, color: MUTED };

  const optPct = cur.conversations ? fmtPct(cur.optOuts, cur.conversations) : '0%';

  const acoes = ai.acoesDoMes
    .map((a, i) => `<b>${i + 1}.</b> ${esc(a)}`)
    .join('<br>');

  const incidentsSection = cur.incidents.length
    ? `${sectionTitle('Incidentes do mês — fora das métricas')}
  <tr><td style="padding:14px 40px 4px;" class="px">
    <div style="font-family:${FONT};color:${INK};font-size:13.5px;line-height:1.7;">
      ${cur.incidents
        .map(
          (i) =>
            `&bull; Conversa <b>${esc(i.pushName ?? i.phone)}</b>: <b>${fmtInt(i.botMessages)} mensagens do bot</b> no período (limite: 300) — possível loop; excluída de todos os números acima e reportada aqui.`,
        )
        .join('<br>')}
    </div>
  </td></tr>`
    : '';

  const ajustesSection = ai.ajustesTela.length
    ? `${sectionTitle('Ajustes na tela da BIA (CRM &rarr; WhatsApp &rarr; BIA) — qualquer admin aplica')}
  <tr><td style="padding:14px 40px 6px;" class="px">
    <div style="background:#1B3A45;border-radius:8px;padding:18px 20px;">
      <div style="font-family:'Courier New',Courier,monospace;color:#DCE9EA;font-size:12.5px;line-height:1.7;">
        ${ai.ajustesTela
          .map((a) => `<b style="color:#ABC7C9;">${esc(a.titulo)}</b><br>Resposta: ${esc(a.resposta)}`)
          .join('<br><br>')}
      </div>
    </div>
  </td></tr>`
    : '';

  const cadenceLine = cadence.length
    ? `<tr><td style="padding:9px 0;">
        <div style="font-family:${FONT};font-size:14px;color:${INK};line-height:1.6;">
          <b>Taxa de resposta por dia da cadência:</b> ${cadence
            .map((c) => `d${c.step} ${fmtPct(c.replied, c.sent)}`)
            .join(' · ')}
          &nbsp;&middot;&nbsp; <b>falha de entrega:</b> ${cadence
            .map((c) => `d${c.step} ${fmtPct(c.failed, c.sent)}`)
            .join(' · ')}
        </div>
      </td></tr>`
    : '';

  const templateRows = templates
    .slice(0, 6)
    .map(
      (t) => `<tr><td style="padding:9px 0;border-bottom:1px solid #DEE8E8;">
      <div style="font-family:${FONT};font-size:14px;color:${INK};line-height:1.6;">
        <span style="font-family:'Courier New',Courier,monospace;background:${CARD};color:${PETROL};font-size:12.5px;padding:2px 8px;border-radius:4px;">${esc(t.templateName)}</span>
        — ${fmtInt(t.sent)} enviadas · ${fmtPct(t.read, t.sent)} lidas · ${fmtPct(t.replied, t.sent)} respostas · ${fmtPct(t.failed, t.sent)} falhas
      </div>
    </td></tr>`,
    )
    .join('');

  const templateNotas = ai.templatesNotas.length
    ? `<tr><td style="padding:12px 0 0;">
        <div style="font-family:${FONT};color:${MUTED};font-size:12.5px;line-height:1.6;">
          ${ai.templatesNotas.map((n) => `&bull; ${esc(n)}`).join('<br>')}
        </div>
      </td></tr>`
    : '';

  const templatesSection = templates.length || cadence.length
    ? `${sectionTitle('Templates e cadência — o que os números mandam fazer')}
  <tr><td style="padding:14px 40px 6px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${templateRows}
      ${cadenceLine}
      ${templateNotas}
    </table>
  </td></tr>`
    : '';

  const codigoSection = ai.codigoSugestoes.length
    ? `${sectionTitle('Mudanças de código sugeridas — passam pelo Oliver')}
  <tr><td style="padding:14px 40px 6px;" class="px">
    <div style="font-family:${FONT};color:${INK};font-size:14px;line-height:1.8;">
      ${ai.codigoSugestoes.map((s, i) => `<b>${i + 1}.</b> ${esc(s)}`).join('<br>')}
    </div>
  </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BIA — Relatório Mensal</title>
<style>
  body { margin:0; padding:0; background:#E9EEEF; }
  @media only screen and (max-width: 620px) {
    .px  { padding-left:20px !important; padding-right:20px !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box; }
    .stack-pad { padding-right:0 !important; padding-bottom:12px !important; }
    .kpi-num { font-size:26px !important; }
  }
</style>
</head>
<body>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">BIA no mês: ${fmtInt(cur.conversations)} conversas, ${fmtInt(cur.meetingsAttributed)} reuniões — e as 3 ações do mês prontas pra aplicar.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9EEEF;">
<tr><td align="center" style="padding:28px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;">

  <!-- HEADER -->
  <tr><td style="background:${PETROL};padding:30px 40px 26px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">
        <img src="${SYMBOL_URL}" alt="BGP" width="42" style="display:block;border:0;">
      </td>
      <td align="right" style="vertical-align:middle;font-family:${FONT};">
        <span style="color:#ABC7C9;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;">Relatório mensal · Inteligência de vendas</span>
      </td>
    </tr></table>
    <div style="font-family:${FONT};color:#FFFFFF;font-size:30px;font-weight:bold;letter-spacing:-0.5px;padding-top:22px;">BIA — Análise do Mês</div>
    <div style="font-family:${FONT};color:#ABC7C9;font-size:14px;padding-top:6px;">${esc(periodLabel)} · WhatsApp Cloud API</div>
  </td></tr>

  <!-- RESUMO EXECUTIVO -->
  <tr><td style="padding:30px 40px 6px;" class="px">
    <div style="font-family:${FONT};color:${INK};font-size:15px;line-height:1.6;">${esc(ai.resumoExecutivo)}</div>
  </td></tr>

  <!-- 3 AÇÕES DO MÊS -->
  <tr><td style="padding:18px 40px 0;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border-left:4px solid ${PETROL};border-radius:0 8px 8px 0;">
      <tr><td style="padding:14px 18px;">
        <div style="font-family:${FONT};color:${PETROL};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;padding-bottom:6px;">As 3 ações do mês</div>
        <div style="font-family:${FONT};color:${INK};font-size:13.5px;line-height:1.7;">${acoes}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- KPIs -->
  ${sectionTitle('Números do mês')}
  <tr><td style="padding:16px 40px 4px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stack stack-pad" width="33%" style="padding-right:12px;">${kpiTile(fmtInt(cur.conversations), `conversas (${fmtInt(cur.distinctLeads)} leads)`, pctDelta(cur.conversations, prev.conversations, true))}</td>
      <td class="stack stack-pad" width="33%" style="padding-right:12px;">${kpiTile(fmtInt(cur.botMessages), 'mensagens enviadas pela BIA', pctDelta(cur.botMessages, prev.botMessages, true))}</td>
      <td class="stack" width="33%">${kpiTile(fmtInt(cur.meetingsAttributed), 'reuniões atribuídas à BIA', pctDelta(cur.meetingsAttributed, prev.meetingsAttributed, true))}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:12px 40px 8px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stack stack-pad" width="33%" style="padding-right:12px;">${kpiTile(fmtPct(cur.responded, cur.conversations), `taxa de resposta (${fmtInt(cur.responded)} leads)`, respDelta)}</td>
      <td class="stack stack-pad" width="33%" style="padding-right:12px;">${kpiTile(median, 'resposta mediana', medianDelta)}</td>
      <td class="stack" width="33%">${kpiTile(optPct, `opt-out (${fmtInt(cur.optOuts)} leads)`, optDelta)}</td>
    </tr></table>
  </td></tr>

  <!-- FUNIL -->
  <tr><td style="padding:14px 40px 6px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PETROL};border-radius:8px;">
      <tr><td style="padding:16px 18px;font-family:${FONT};">
        <span style="color:#FFFFFF;font-size:14px;"><b>Funil do mês:</b></span>
        <span style="color:#ABC7C9;font-size:14px;"> ${fmtInt(cur.conversations)} conversas &rarr; ${fmtInt(cur.responded)} responderam (${fmtPct(cur.responded, cur.conversations)}) &rarr; ${fmtInt(cur.meetingsAttributed)} reuniões (${fmtPct(cur.meetingsAttributed, cur.conversations)}) &rarr; </span>
        <span style="color:#FFFFFF;font-size:14px;"><b>${fmtInt(cur.proposals)} propostas &rarr; ${fmtInt(cur.wins)} ganhos fechados</b></span>
      </td></tr>
    </table>
  </td></tr>

  ${incidentsSection}

  <!-- FODA -->
  ${sectionTitle('Análise SWOT')}
  <tr><td style="padding:16px 40px 4px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="stack stack-pad" width="50%" style="padding-right:12px;vertical-align:top;">${fodaQuadrant('Forças', ai.foda.forcas, PETROL, CARD)}</td>
        <td class="stack" width="50%" style="vertical-align:top;">${fodaQuadrant('Fraquezas', ai.foda.fraquezas, BAD, CARD_WARM)}</td>
      </tr>
      <tr>
        <td class="stack stack-pad" width="50%" style="padding-right:12px;padding-top:12px;vertical-align:top;">${fodaQuadrant('Oportunidades', ai.foda.oportunidades, '#52808D', CARD)}</td>
        <td class="stack" width="50%" style="padding-top:12px;vertical-align:top;">${fodaQuadrant('Ameaças', ai.foda.ameacas, '#8A3A2E', CARD_WARM)}</td>
      </tr>
    </table>
  </td></tr>

  ${ajustesSection}
  ${templatesSection}
  ${codigoSection}

  <!-- FOOTER -->
  <tr><td style="background:${CARD};padding:22px 40px;" class="px">
    <div style="font-family:${FONT};color:${MUTED};font-size:12px;line-height:1.6;">
      Relatório gerado automaticamente pela plataforma BGPGO a partir das conversas reais da BIA no período.<br>
      Os números excluem lançamentos/broadcasts e incidentes anômalos (reportados à parte) — aqui é só a BIA.<br>
      <b>Definições fixas</b> (iguais todo mês): período = dia 07 a dia 07 · conversa = teve mensagem da BIA no período ·
      respondeu = lead mandou mensagem após a 1ª da BIA · reunião atribuída = agendamento criado após contato da BIA.<br>
      Dúvidas ou sugestões: responda este email.
    </div>
    <div style="padding-top:14px;">
      <img src="${LOGO_URL}" alt="Bertuzzi Gestão Patrimonial" width="90" style="display:block;border:0;">
    </div>
  </td></tr>

</table>

</td></tr>
</table>
</body>
</html>`;
}
