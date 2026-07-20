/**
 * Contact Attribute Extractor — preenche os atributos de segmentação do
 * Contact (gender, erpSystem, revenueRange) a partir de:
 *   1. Primeiro nome (gênero, em lote — cobre a base inteira)
 *   2. Mensagens de WhatsApp recebidas + transcrições de reunião (Read.ai)
 *
 * Regras de proveniência (attributesMeta):
 *   - Edição manual na UI marca source='manual' e NUNCA é sobrescrita por IA.
 *   - IA só preenche campo vazio ou refina valor que ela mesma extraiu antes.
 *   - Cada valor carrega evidence (trecho que justifica) para auditoria.
 *
 * Usa gpt-4o-mini (mesmo padrão do meetingAnalyzer).
 */

import OpenAI from 'openai';
import prisma from '../lib/prisma';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.ATTRIBUTE_EXTRACTION_MODEL || 'gpt-4o-mini';

// ─── Valores canônicos ───────────────────────────────────────────────────────

export const GENDER_VALUES = ['MASCULINO', 'FEMININO'] as const;

export const REVENUE_RANGES = ['ATE_50K', '50K_100K', '100K_300K', '300K_1M', 'ACIMA_1M'] as const;

export const REVENUE_RANGE_LABELS: Record<string, string> = {
  ATE_50K: 'Até R$ 50 mil/mês',
  '50K_100K': 'R$ 50–100 mil/mês',
  '100K_300K': 'R$ 100–300 mil/mês',
  '300K_1M': 'R$ 300 mil–1 mi/mês',
  ACIMA_1M: 'Acima de R$ 1 mi/mês',
};

export type AttributeSource = 'ia-nome' | 'ia-conversa' | 'manual';

export interface AttributeMeta {
  source: AttributeSource;
  confidence?: 'alta' | 'media';
  evidence?: string;
  at: string;
}

type AttributesMeta = Partial<Record<'gender' | 'erpSystem' | 'revenueRange', AttributeMeta>>;

/** Campo pode ser (re)escrito pela IA? Manual sempre vence. */
function iaCanWrite(meta: AttributesMeta | null | undefined, field: keyof AttributesMeta): boolean {
  return meta?.[field]?.source !== 'manual';
}

// ─── 1. Gênero pelo primeiro nome (em lote) ──────────────────────────────────

const GENDER_BATCH_PROMPT = `Você classifica primeiros nomes brasileiros por gênero.
Responda SOMENTE com JSON válido no formato {"nomes": {"<nome>": "MASCULINO" | "FEMININO" | null}}.
Use null para nomes ambíguos ou unissex no Brasil (ex.: Darci, Ariel, Juraci) e para nomes que não são nomes de pessoa (empresas, apelidos, siglas).
Classifique apenas quando houver alta confiança pelo uso corrente no Brasil.`;

/**
 * Classifica uma lista de primeiros nomes. Retorna um Map nome→gênero
 * (nomes ambíguos ficam de fora). Chame com até ~150 nomes por vez.
 */
export async function classifyGenderByFirstName(
  firstNames: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (firstNames.length === 0) return result;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: GENDER_BATCH_PROMPT },
      { role: 'user', content: JSON.stringify(firstNames) },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty response');

  const parsed = JSON.parse(text);
  const map = parsed.nomes ?? parsed;
  for (const [name, gender] of Object.entries(map)) {
    if (gender === 'MASCULINO' || gender === 'FEMININO') {
      result.set(name.toLowerCase(), gender);
    }
  }
  return result;
}

/** Extrai o primeiro nome "classificável" de um nome completo. */
export function extractFirstName(fullName: string): string | null {
  const first = fullName.trim().split(/\s+/)[0]?.replace(/[^\p{L}]/gu, '') ?? '';
  if (first.length < 2) return null;
  return first.toLowerCase();
}

// ─── 2. Sistema + faturamento a partir de conversas/reuniões ─────────────────

const CONVERSATION_PROMPT = `Você analisa o material de um lead (dono ou gestor de empresa) no CRM da BGPGO (empresa de gestão financeira estratégica): conversas de WhatsApp, transcrições de reuniões e anotações escritas pelo vendedor.
Extraia APENAS informações explícitas no material — ditas pelo lead OU registradas nas anotações do vendedor sobre o lead. Não deduza, não estime, não use conhecimento externo.

Responda SOMENTE com JSON válido:
{
  "erp_system": "sistema/ERP/ferramenta de gestão financeira que o lead usa hoje; null se não mencionado",
  "erp_evidence": "trecho curto da conversa que comprova; null se não mencionado",
  "revenue_monthly_brl": "NÚMERO em reais do faturamento mensal ATUAL da empresa do lead (ex.: 15000, 75000, 13000000); null se nenhum valor foi citado",
  "revenue_evidence": "trecho curto com o valor citado; null se não mencionado",
  "gender": "MASCULINO ou FEMININO; null em qualquer dúvida",
  "gender_evidence": "trecho curto que comprova; null se não aplicável"
}

REGRAS erp_system:
- Normalize para o nome oficial da ferramenta. Transcrições de áudio erram nomes: "OME"/"Omi"/"Rommie" = Omie; "Conta Zul" = Conta Azul. Ferramentas comuns: Conta Azul, Omie, Granatum, Nibo, Bling, Tiny, Sankhya, TOTVS/Protheus, SAP, ERP próprio, Excel/Planilhas.
- Se o nome citado não bater com nenhuma ferramenta conhecida, mantenha como o lead falou.

REGRAS revenue_monthly_brl:
- É o faturamento MENSAL ATUAL da empresa do lead, como NÚMERO em reais (sem string, sem R$).
- "12 a 14 milhões por mês" → 13000000. "uns 10, 15 mil" → 12500. Intervalo → ponto médio.
- Valor ANUAL → divida por 12. Valor semanal → multiplique por 4.
- Pico do passado ou meta futura NÃO é o atual: "já bateu 90 mil, hoje não está nem perto" → use o valor atual dito no contexto; se o atual não foi dito, null.
- Se o lead citou QUALQUER valor do faturamento atual, mesmo aproximado, preencha — não deixe null com evidência preenchida.
- revenue_monthly_brl e revenue_evidence andam juntos: ou os dois preenchidos, ou os dois null.

REGRAS gender:
- SOMENTE por linguagem de gênero dirigida AO LEAD: "querida Bruna", "meu amigo", "ele/ela" referindo-se ao lead, adjetivos flexionados ("obrigada" dita pelo lead sobre si).
- Frases neutras NÃO são evidência. Na dúvida, null.`;

export interface ConversationExtraction {
  erp_system: string | null;
  erp_evidence: string | null;
  revenue_range: string | null;
  revenue_evidence: string | null;
  gender: string | null;
  gender_evidence: string | null;
}

/** Bucket determinístico — a IA extrai o número, a faixa é calculada aqui. */
export function bucketRevenue(monthlyBrl: number): string | null {
  if (!Number.isFinite(monthlyBrl) || monthlyBrl <= 0) return null;
  if (monthlyBrl <= 50_000) return 'ATE_50K';
  if (monthlyBrl <= 100_000) return '50K_100K';
  if (monthlyBrl <= 300_000) return '100K_300K';
  if (monthlyBrl <= 1_000_000) return '300K_1M';
  return 'ACIMA_1M';
}

/** Normalização de erros comuns de transcrição de áudio nos nomes de ERP. */
const ERP_ALIASES: Record<string, string> = {
  ome: 'Omie', omi: 'Omie', rommie: 'Omie', omie: 'Omie',
  'conta zul': 'Conta Azul', 'conta azul': 'Conta Azul',
  granatum: 'Granatum', nibo: 'Nibo', bling: 'Bling', tiny: 'Tiny',
  sankhya: 'Sankhya', totvs: 'TOTVS', protheus: 'TOTVS/Protheus', sap: 'SAP',
  excel: 'Excel/Planilhas', planilha: 'Excel/Planilhas', planilhas: 'Excel/Planilhas',
  'go by aimo': 'GO by AiMO', gobi: 'GO by AiMO', 'go bi': 'GO by AiMO',
  'gestão click': 'Gestão Click', 'gestao click': 'Gestão Click',
};

// O modelo às vezes devolve "null"/"não mencionado" como string em vez de null
const ERP_NON_VALUES = new Set(['null', 'none', 'n/a', 'na', 'não mencionado', 'nao mencionado', 'nenhum', 'não usa', 'nao usa', '-']);

function normalizeErp(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key || ERP_NON_VALUES.has(key)) return null;
  return ERP_ALIASES[key] ?? raw.trim();
}

export async function extractAttributesFromText(
  contactName: string,
  text: string,
): Promise<ConversationExtraction> {
  const userContent = `Lead: ${contactName}

CONVERSAS E TRANSCRIÇÕES:
${text.slice(0, 80000)}`;

  let raw: string | null | undefined;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CONVERSATION_PROMPT },
          { role: 'user', content: userContent },
        ],
      });
      raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error('OpenAI returned empty response');
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retriable = lastError.message.includes('429')
        || lastError.message.toLowerCase().includes('rate limit')
        || lastError.message.toLowerCase().includes('timeout');
      if (retriable && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 5000));
        continue;
      }
      throw lastError;
    }
  }
  if (!raw) throw lastError ?? new Error('OpenAI returned empty response');
  const parsed = JSON.parse(raw);

  const revenueNumber = typeof parsed.revenue_monthly_brl === 'number'
    ? parsed.revenue_monthly_brl
    : parseFloat(parsed.revenue_monthly_brl);
  const revenueRange = bucketRevenue(revenueNumber);

  const erpSystem = typeof parsed.erp_system === 'string' ? normalizeErp(parsed.erp_system) : null;

  return {
    erp_system: erpSystem,
    erp_evidence: erpSystem ? (parsed.erp_evidence ?? null) : null,
    revenue_range: revenueRange,
    revenue_evidence: revenueRange ? (parsed.revenue_evidence ?? null) : null,
    gender: GENDER_VALUES.includes(parsed.gender) ? parsed.gender : null,
    gender_evidence: parsed.gender_evidence ?? null,
  };
}

// ─── Coleta do texto-fonte de um contato ─────────────────────────────────────

/**
 * Junta tudo que se sabe do lead: mensagens inbound dos dois sistemas de
 * WhatsApp (legado Z-API + Cloud API v2), transcrições/resumos de reunião
 * e anotações do vendedor na timeline (Activity NOTE/MEETING, direto no
 * contato ou nas negociações dele). Retorna null se não houver material.
 */
export async function gatherContactText(contactId: string): Promise<string | null> {
  const [legacyMsgs, waMsgs, meetings, notes] = await Promise.all([
    prisma.whatsAppMessage.findMany({
      where: { conversation: { contactId }, sender: 'CLIENT', text: { not: '' } },
      select: { text: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 300,
    }),
    prisma.waMessage.findMany({
      where: { conversation: { contactId }, direction: 'INBOUND', type: 'TEXT', body: { not: null } },
      select: { body: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 300,
    }),
    prisma.readAiMeeting.findMany({
      where: { contactId },
      select: { title: true, transcript: true, summary: true, meetingDate: true },
      orderBy: { meetingDate: 'asc' },
    }),
    prisma.activity.findMany({
      where: {
        type: { in: ['NOTE', 'MEETING'] },
        OR: [{ contactId }, { deal: { contactId } }],
      },
      select: { content: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ]);

  const parts: string[] = [];

  const whatsappLines = [
    ...legacyMsgs.map(m => ({ at: m.createdAt, text: m.text })),
    ...waMsgs.map(m => ({ at: m.createdAt, text: m.body! })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(m => `[${m.at.toISOString().slice(0, 10)}] Lead: ${m.text}`);

  if (whatsappLines.length > 0) {
    parts.push(`## Mensagens de WhatsApp enviadas pelo lead\n${whatsappLines.join('\n')}`);
  }

  const noteLines = notes
    .filter(n => n.content && n.content.trim().length > 30)
    .map(n => `[${n.createdAt.toISOString().slice(0, 10)}] ${n.content.trim()}`);
  if (noteLines.length > 0) {
    parts.push(`## Anotações do vendedor sobre o lead (fonte confiável)\n${noteLines.join('\n---\n')}`);
  }

  for (const meeting of meetings) {
    const content = meeting.transcript || meeting.summary;
    if (!content) continue;
    parts.push(`## Reunião: ${meeting.title ?? 'Diagnóstico'} (${meeting.meetingDate?.toISOString().slice(0, 10) ?? 'sem data'})\n${content}`);
  }

  if (parts.length === 0) return null;
  const text = parts.join('\n\n');
  // Menos de ~40 chars não tem sinal nenhum — economiza a chamada
  return text.length < 40 ? null : text;
}

// ─── Enriquecimento de um contato (conversas + reuniões) ─────────────────────

export interface EnrichResult {
  contactId: string;
  updated: Partial<Record<'gender' | 'erpSystem' | 'revenueRange', string>>;
  skipped: boolean;
}

/**
 * Extrai atributos das conversas/reuniões de um contato e persiste.
 * Respeita edições manuais. Sempre carimba attributesExtractedAt.
 */
export async function enrichContactFromConversations(contactId: string): Promise<EnrichResult> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, gender: true, erpSystem: true, revenueRange: true, attributesMeta: true },
  });
  if (!contact) return { contactId, updated: {}, skipped: true };

  const text = await gatherContactText(contactId);
  if (!text) {
    await prisma.contact.update({ where: { id: contactId }, data: { attributesExtractedAt: new Date() } });
    return { contactId, updated: {}, skipped: true };
  }

  const extraction = await extractAttributesFromText(contact.name, text);

  const meta: AttributesMeta = (contact.attributesMeta as AttributesMeta) ?? {};
  const now = new Date().toISOString();
  const data: Record<string, unknown> = { attributesExtractedAt: new Date() };
  const updated: EnrichResult['updated'] = {};

  if (extraction.erp_system && iaCanWrite(meta, 'erpSystem')) {
    data.erpSystem = extraction.erp_system;
    meta.erpSystem = { source: 'ia-conversa', evidence: extraction.erp_evidence ?? undefined, at: now };
    updated.erpSystem = extraction.erp_system;
  }
  if (extraction.revenue_range && iaCanWrite(meta, 'revenueRange')) {
    data.revenueRange = extraction.revenue_range;
    meta.revenueRange = { source: 'ia-conversa', evidence: extraction.revenue_evidence ?? undefined, at: now };
    updated.revenueRange = extraction.revenue_range;
  }
  // Gênero da conversa só entra se ainda não houver valor (nome já cobre a base)
  if (extraction.gender && !contact.gender && iaCanWrite(meta, 'gender')) {
    data.gender = extraction.gender;
    meta.gender = { source: 'ia-conversa', evidence: extraction.gender_evidence ?? undefined, at: now };
    updated.gender = extraction.gender;
  }

  if (Object.keys(updated).length > 0) {
    data.attributesMeta = meta as any;
  }

  await prisma.contact.update({ where: { id: contactId }, data: data as any });
  return { contactId, updated, skipped: false };
}

/**
 * Fire-and-forget: enriquece o contato após análise de reunião nova.
 * Chamado pelo meetingAnalyzer — não bloqueia nada.
 */
export function triggerContactEnrichment(contactId: string | null | undefined): void {
  if (!contactId) return;
  setImmediate(async () => {
    try {
      const result = await enrichContactFromConversations(contactId);
      if (Object.keys(result.updated).length > 0) {
        console.log(`[AttributeExtractor] Contact ${contactId} enriquecido:`, result.updated);
      }
    } catch (err) {
      console.error(`[AttributeExtractor] Enriquecimento falhou para ${contactId}:`, err);
    }
  });
}
