import prisma from '../lib/prisma';
import { sanitizeGreetingName } from '../utils/nameSanitizer';

// ─── Available merge tags ────────────────────────────────────────────────────
//
// Lista oficial de variáveis aceitas no editor de email. A `key` é o nome
// canônico (UPPER_SNAKE_CASE) que entra nos padrões *|KEY|* e {{key}}.
//
// O regex de substituição em personalizeContent() aceita variações:
//   - espaço OU underscore (PRIMEIRO_NOME == "PRIMEIRO NOME")
//   - maiúsculas OU minúsculas
//   - espaços ao redor (`{{ key }}`)

export type MergeTagKey =
  | 'PRIMEIRO_NOME'
  | 'NOME'
  | 'EMAIL'
  | 'TELEFONE'
  | 'EMPRESA'
  | 'CARGO'
  | 'RESPONSAVEL'
  | 'RESPONSAVEL_EMAIL'
  | 'CALENDLY';

export interface MergeTagDef {
  key: MergeTagKey;
  label: string;
  example: string;
}

export const AVAILABLE_MERGE_TAGS: ReadonlyArray<MergeTagDef> = [
  { key: 'PRIMEIRO_NOME', label: 'Primeiro nome', example: 'João' },
  { key: 'NOME', label: 'Nome completo', example: 'João da Silva' },
  { key: 'EMAIL', label: 'Email', example: 'joao@empresa.com' },
  { key: 'TELEFONE', label: 'Telefone', example: '(51) 99999-9999' },
  { key: 'EMPRESA', label: 'Empresa', example: 'Empresa Ltda' },
  { key: 'CARGO', label: 'Cargo', example: 'Diretor Financeiro' },
  { key: 'RESPONSAVEL', label: 'Vendedor responsável', example: 'Vitor' },
  { key: 'RESPONSAVEL_EMAIL', label: 'Email do responsável', example: 'vitor@bgpgo.com' },
  { key: 'CALENDLY', label: 'Link Calendly do responsável', example: 'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp' },
] as const;

// ─── Personalization data builder ────────────────────────────────────────────

export interface PersonalizationContext {
  contactId: string;
  /** Opcional — usado pra resolver RESPONSAVEL/CALENDLY do owner do deal. */
  dealId?: string | null;
}

/**
 * Busca os dados necessários no banco e devolve um map de variáveis pronto
 * pra ser consumido por personalizeContent().
 *
 * - PRIMEIRO_NOME / NOME usam o sanitizer pra evitar `Olá, <palavrão>` em
 *   nomes ofensivos/inválidos.
 * - RESPONSAVEL/RESPONSAVEL_EMAIL vêm do User dono do Deal (quando dealId
 *   é informado ou existe um deal aberto do contato).
 * - CALENDLY: o schema atual não tem campo por-usuário, então usamos o
 *   `meetingLink` global da WhatsAppConfig como fallback compartilhado.
 */
export async function buildPersonalizationData(
  ctx: PersonalizationContext,
): Promise<Record<string, string>> {
  const contact = await prisma.contact.findUnique({
    where: { id: ctx.contactId },
    include: { organization: { select: { name: true } } },
  });

  if (!contact) {
    return emptyData();
  }

  // Owner / responsável: prioriza dealId explícito, senão pega o deal aberto
  // mais recente do contato.
  let ownerUser: { name: string; email: string } | null = null;

  if (ctx.dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: ctx.dealId },
      select: { user: { select: { name: true, email: true } } },
    });
    if (deal?.user) ownerUser = deal.user;
  }

  if (!ownerUser) {
    const recentDeal = await prisma.deal.findFirst({
      where: { contactId: ctx.contactId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // OPEN antes de LOST/WON
      select: { user: { select: { name: true, email: true } } },
    });
    if (recentDeal?.user) ownerUser = recentDeal.user;
  }

  // Calendly: por enquanto link global em WhatsAppConfig.meetingLink.
  // Quando User ganhar campo dedicado, troca aqui.
  const waConfig = await prisma.whatsAppConfig.findFirst({
    select: { meetingLink: true },
  });

  const nameGuard = sanitizeGreetingName(contact.name);
  const firstName = nameGuard.safe;
  const fullName = nameGuard.flagged ? '' : (contact.name || '');

  return {
    PRIMEIRO_NOME: firstName,
    NOME: fullName,
    EMAIL: contact.email || '',
    TELEFONE: contact.phone || '',
    EMPRESA: contact.organization?.name || '',
    CARGO: contact.position || '',
    RESPONSAVEL: ownerUser?.name?.split(/\s+/)[0] || '',
    RESPONSAVEL_EMAIL: ownerUser?.email || '',
    CALENDLY: waConfig?.meetingLink || '',
  };
}

/**
 * Versão sync que usa apenas os exemplos da lista oficial. Útil pra preview
 * default quando o user ainda não selecionou um contato.
 */
export function buildExampleData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const tag of AVAILABLE_MERGE_TAGS) {
    data[tag.key] = tag.example;
  }
  return data;
}

function emptyData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const tag of AVAILABLE_MERGE_TAGS) {
    data[tag.key] = '';
  }
  return data;
}

// ─── Replacement engine ──────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Constrói o regex global que casa todas as variações suportadas pra uma key.
 *
 * Aceita pra `KEY`:
 *   - *|KEY|*, *|KEY|*, *| KEY |*, *|key|*, *|primeiro nome|*, *|PRIMEIRO_NOME|*
 *   - {{key}}, {{KEY}}, {{ key }}, {{primeiro nome}}, {{primeiro-nome}}
 *
 * Espaço, underscore e hífen são intercambiáveis entre tokens da key.
 */
function buildReplacementRegex(key: string): RegExp {
  // Tokens da key (PRIMEIRO_NOME → ['PRIMEIRO', 'NOME'])
  const tokens = key.split(/[_\s-]+/).filter(Boolean).map(escapeRegex);
  // Separador permitido entre tokens
  const sep = '[\\s_-]+';
  const tokenPattern = tokens.join(sep);

  // *| ...key... |*   (com espaços internos opcionais)
  const mailchimp = `\\*\\|\\s*${tokenPattern}\\s*\\|\\*`;
  // {{ ...key... }}  (com espaços internos opcionais)
  const handlebars = `\\{\\{\\s*${tokenPattern}\\s*\\}\\}`;

  return new RegExp(`${mailchimp}|${handlebars}`, 'gi');
}

/**
 * Substitui todas as variáveis do map no content. Variáveis ausentes ou nulas
 * viram string vazia (em vez de `undefined`) pra evitar saída tipo
 * "Olá undefined".
 */
export function personalizeContent(
  content: string,
  data: Record<string, string>,
): string {
  if (!content) return content;

  let result = content;
  for (const key of Object.keys(data)) {
    const value = data[key] ?? '';
    const re = buildReplacementRegex(key);
    result = result.replace(re, value);
  }
  return result;
}

/**
 * Helper one-shot: busca dados e personaliza num único call.
 */
export async function personalizeForContact(
  content: string,
  ctx: PersonalizationContext,
): Promise<string> {
  const data = await buildPersonalizationData(ctx);
  return personalizeContent(content, data);
}
