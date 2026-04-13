/**
 * Meeting Analyzer — gera relatório estruturado de vendas a partir
 * da transcrição completa de reuniões de Diagnóstico (Read.ai).
 *
 * Usa gpt-4o-mini por padrão (configurável via MEETING_ANALYSIS_MODEL).
 * Custo estimado: ~$0.01–0.05 por análise (transcrição de 1h ≈ 10k tokens).
 */

import OpenAI from 'openai';
import prisma from '../lib/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.MEETING_ANALYSIS_MODEL || 'gpt-4o-mini';

// ─── Output type ─────────────────────────────────────────────────────────────

export interface MeetingAnalysis {
  empresa_negocio: string;
  gatilhos_conexao: string;
  sistema_atual: string;
  principais_dores: string;
  situacao_atual: string;
  o_que_chamou_atencao: string;
  proposta_de_valor: string;
  preco_apresentado: string;
  objecoes: string;
  proximos_passos: string;
  analisado_em: string;
  modelo_usado: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um analista de vendas especialista da BGPGO (Bertuzzi Patrimonial, empresa de gestão financeira estratégica).
Você analisa transcrições de reuniões de Diagnóstico Financeiro e extrai as informações mais relevantes para o time comercial poder dar continuidade à negociação com contexto rico.

REGRAS:
- Responda SOMENTE com JSON válido, sem markdown, sem explicação, sem blocos de código.
- Seja objetivo e direto, mas rico em contexto útil para o vendedor.
- Se uma informação não foi mencionada na reunião, escreva "Não mencionado" no campo correspondente.
- Escreva em PT-BR.
- Capture nuances: tom do lead, nível de engajamento, sinais de compra, sinais de resistência.

FORMATO DE RESPOSTA (JSON estrito):
{
  "empresa_negocio": "O que a empresa do lead faz, setor, tamanho aparente, modelo de negócio",
  "gatilhos_conexao": "Pontos pessoais mencionados: hobbies, família, lugares, histórias, interesses — use para criar rapport futuro",
  "sistema_atual": "Ferramentas, plataformas ou processos financeiros que o lead usa hoje (contabilidade, investimentos, gestão, etc.)",
  "principais_dores": "Problemas concretos e frustrações relatados pelo lead — seja específico, cite exemplos da conversa",
  "situacao_atual": "Contexto do momento: negócio crescendo, estável, em crise, recém-aberto, herdeiro, etc.",
  "o_que_chamou_atencao": "Destaques, curiosidades, falas marcantes, oportunidades ocultas ou alertas importantes",
  "proposta_de_valor": "O que foi apresentado pela BGPGO como solução — serviços, diferenciais, benefícios enfatizados",
  "preco_apresentado": "Valores, faixas ou condições discutidas. 'Não mencionado' se não houve",
  "objecoes": "Bloqueios, dúvidas, resistências ou preocupações levantadas pelo lead",
  "proximos_passos": "O que ficou combinado: envio de proposta, nova reunião, prazo, tarefa específica, etc."
}`;

// ─── Main function ────────────────────────────────────────────────────────────

export async function analyzeMeeting(transcript: string, title?: string | null): Promise<MeetingAnalysis> {
  const userContent = `Título da reunião: ${title || 'Diagnóstico Financeiro'}

TRANSCRIÇÃO COMPLETA:
${transcript.slice(0, 80000)}`; // GPT-4o-mini context window is ~128k tokens; ~80k chars ≈ 20k tokens — safe limit

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error('OpenAI returned empty response');

      const parsed = JSON.parse(text);

      return {
        empresa_negocio: parsed.empresa_negocio || 'Não mencionado',
        gatilhos_conexao: parsed.gatilhos_conexao || 'Não mencionado',
        sistema_atual: parsed.sistema_atual || 'Não mencionado',
        principais_dores: parsed.principais_dores || 'Não mencionado',
        situacao_atual: parsed.situacao_atual || 'Não mencionado',
        o_que_chamou_atencao: parsed.o_que_chamou_atencao || 'Não mencionado',
        proposta_de_valor: parsed.proposta_de_valor || 'Não mencionado',
        preco_apresentado: parsed.preco_apresentado || 'Não mencionado',
        objecoes: parsed.objecoes || 'Não mencionado',
        proximos_passos: parsed.proximos_passos || 'Não mencionado',
        analisado_em: new Date().toISOString(),
        modelo_usado: MODEL,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = lastError.message.includes('429') || lastError.message.toLowerCase().includes('rate limit');
      const isTimeout = lastError.message.toLowerCase().includes('timeout') || lastError.message.includes('ETIMEDOUT');

      if ((isRateLimit || isTimeout) && attempt < 3) {
        const delay = attempt * 2000; // 2s, 4s
        console.warn(`[MeetingAnalyzer] Attempt ${attempt} failed (${lastError.message}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }

  throw new Error(`[MeetingAnalyzer] Failed after 3 attempts: ${lastError?.message}`);
}

// ─── Background trigger ───────────────────────────────────────────────────────

/**
 * Fire-and-forget: analyze a meeting and persist result.
 * Call this after webhook upsert — does NOT block the response.
 */
export function triggerMeetingAnalysis(meetingId: string): void {
  setImmediate(async () => {
    try {
      const meeting = await prisma.readAiMeeting.findUnique({
        where: { id: meetingId },
        select: { id: true, transcript: true, title: true },
      });

      if (!meeting?.transcript) {
        console.log(`[MeetingAnalyzer] Meeting ${meetingId} has no transcript, skipping.`);
        return;
      }

      console.log(`[MeetingAnalyzer] Starting analysis for meeting ${meetingId}...`);
      const analysis = await analyzeMeeting(meeting.transcript, meeting.title);

      await prisma.readAiMeeting.update({
        where: { id: meetingId },
        data: {
          aiAnalysis: analysis as any,
          aiAnalyzedAt: new Date(),
        },
      });

      console.log(`[MeetingAnalyzer] Analysis complete for meeting ${meetingId}`);
    } catch (err) {
      console.error(`[MeetingAnalyzer] Background analysis failed for ${meetingId}:`, err);
    }
  });
}
