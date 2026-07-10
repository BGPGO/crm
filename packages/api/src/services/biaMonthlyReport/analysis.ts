/**
 * biaMonthlyReport/analysis — a IA escreve a parte narrativa do relatório
 * (resumo executivo, 3 ações, FODA, ajustes de tela, notas de template e
 * sugestões de código) a partir dos números canônicos + amostras reais.
 *
 * Regra de ouro passada no prompt: NUNCA inventar número — só usar os
 * fornecidos; e ser honesto (mês piorou → a manchete diz que piorou).
 */
import OpenAI from 'openai';
import {
  BiaMetrics,
  CadenceStepStat,
  ConversationSample,
  TemplateStat,
} from './metrics';

export interface BiaAnalysis {
  resumoExecutivo: string;
  acoesDoMes: string[];
  foda: {
    forcas: string[];
    fraquezas: string[];
    oportunidades: string[];
    ameacas: string[];
  };
  ajustesTela: Array<{ titulo: string; resposta: string }>;
  templatesNotas: string[];
  codigoSugestoes: string[];
}

const SYSTEM_PROMPT = `Você é analista sênior de vendas da BGP (Bertuzzi Gestão Patrimonial) e escreve o relatório mensal executivo da BIA — a assistente de IA que conversa com leads no WhatsApp. Os leitores são os sócios (Oliver, João e Vitor).

REGRAS INEGOCIÁVEIS:
1. NUNCA invente números. Use somente os números fornecidos no JSON de métricas. Se um dado não existe, não cite número.
2. Honestidade acima de celebração: se o mês piorou vs o anterior, a manchete do resumo executivo diz isso de frente. Sócio abre com número, não com elogio.
3. Frases curtas, tom direto, português do Brasil. Nada de jargão corporativo vazio.
   Diferença entre taxas é em pontos percentuais ("caiu 9,3pp"), nunca "%".
4. Tudo que afirmar de qualitativo deve vir das amostras de conversa reais fornecidas.

Responda APENAS com um JSON válido neste formato exato:
{
  "resumoExecutivo": "3-5 frases. Abre com a manchete do mês (número + direção vs mês anterior). Fecha com a hipótese principal marcada como 'a investigar' se houver queda.",
  "acoesDoMes": ["ação 1 (a mais importante, executável em dias)", "ação 2", "ação 3"],
  "foda": {
    "forcas": ["3-4 itens, cada um ancorado em número ou exemplo real"],
    "fraquezas": ["3-4 itens"],
    "oportunidades": ["3-4 itens"],
    "ameacas": ["3-4 itens"]
  },
  "ajustesTela": [{ "titulo": "OBJEÇÃO: \\"...\\"", "resposta": "resposta pronta pra colar na config da BIA" }],
  "templatesNotas": ["nota acionável sobre um template específico (citar o nome exato) com base nas estatísticas"],
  "codigoSugestoes": ["mudança de código sugerida, em 1 frase, com o porquê"]
}

Sobre ajustesTela: só inclua objeções que apareceram DE VERDADE nas amostras e que a BIA respondeu mal. 0 a 3 itens. Se não houver evidência, retorne [].
Sobre templatesNotas e codigoSugestoes: 0 a 4 itens cada, só o que os dados sustentam.`;

export async function generateAnalysis(
  current: BiaMetrics,
  previous: BiaMetrics,
  cadence: CadenceStepStat[],
  templates: TemplateStat[],
  samples: ConversationSample[],
  periodLabel: string,
): Promise<BiaAnalysis> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const metricsPayload = {
    periodo: periodLabel,
    mesAtual: summarize(current),
    mesAnterior: summarize(previous),
    cadenciaPorPasso: cadence.map((c) => ({
      passo: c.step,
      enviadas: c.sent,
      falhaEntrega: pct(c.failed, c.sent),
      taxaResposta72h: pct(c.replied, c.sent),
    })),
    templates: templates.map((t) => ({
      nome: t.templateName,
      enviadas: t.sent,
      lidas: pct(t.read, t.sent),
      falhas: pct(t.failed, t.sent),
      respostas72h: pct(t.replied, t.sent),
    })),
    incidentes: current.incidents.map((i) => ({
      conversa: i.pushName ?? i.phone,
      msgsDoBot: i.botMessages,
      nota: 'conversa outlier excluída das métricas (possível loop bot-vs-bot)',
    })),
  };

  const samplesText = samples
    .map((s, i) => `--- AMOSTRA ${i + 1} (${s.kind}) ---\n${s.transcript.slice(0, 2600)}`)
    .join('\n\n');

  const completion = await openai.chat.completions.create({
    model: process.env.BIA_REPORT_AI_MODEL || 'gpt-4o',
    max_tokens: 4000,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `MÉTRICAS VERIFICADAS DO PERÍODO (${periodLabel}):\n` +
          `${JSON.stringify(metricsPayload, null, 1)}\n\n` +
          `AMOSTRAS DE CONVERSAS REAIS DA JANELA (${samples.length}):\n${samplesText}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI não retornou conteúdo');
  const parsed = JSON.parse(text) as BiaAnalysis;

  // Saneamento mínimo — o builder confia nesses shapes
  parsed.acoesDoMes = (parsed.acoesDoMes ?? []).slice(0, 3);
  parsed.foda = parsed.foda ?? { forcas: [], fraquezas: [], oportunidades: [], ameacas: [] };
  parsed.ajustesTela = (parsed.ajustesTela ?? []).slice(0, 3);
  parsed.templatesNotas = (parsed.templatesNotas ?? []).slice(0, 4);
  parsed.codigoSugestoes = (parsed.codigoSugestoes ?? []).slice(0, 4);
  return parsed;
}

function summarize(m: BiaMetrics) {
  return {
    conversas: m.conversations,
    leadsDistintos: m.distinctLeads,
    responderam: m.responded,
    taxaResposta: pct(m.responded, m.conversations),
    msgsEnviadasPelaBia: m.botMessages,
    optOuts: m.optOuts,
    medianaRespostaSegundos: m.medianResponseSeconds != null ? Math.round(m.medianResponseSeconds) : null,
    reunioesAtribuidas: m.meetingsAttributed,
    propostasEnviadas: m.proposals,
    ganhosFechados: m.wins,
  };
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(1).replace('.', ',')}%`;
}
