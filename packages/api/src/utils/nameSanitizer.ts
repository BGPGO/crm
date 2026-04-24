/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Name Sanitizer — detecta nomes ofensivos/inválidos antes de usar em saudações
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Motivo: leads entram via webhook de LP sem validação. Houve caso de lead
 * se cadastrar com xingamento no campo "nome" e a BIA reproduzir na saudação.
 *
 * Estratégia:
 *   - Blacklist PT-BR com match por palavra inteira (word boundary + diacríticos)
 *   - Heurísticas estruturais (só dígitos, só pontuação, comprimento mínimo)
 *   - NÃO altera o dado no banco — só afeta o texto usado em mensagens.
 *
 * Consumidor decide o fallback (ex: string vazia, "amigo(a)", tratamento neutro).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface SanitizedName {
  /** Primeiro nome pronto pra saudação (string vazia se `flagged`) */
  safe: string;
  /** true quando o nome foi considerado ofensivo/inválido */
  flagged: boolean;
  /** Motivo da reprovação (apenas quando flagged) */
  reason?: 'offensive' | 'too_short' | 'non_alpha' | 'empty';
}

/**
 * Lista de termos ofensivos (PT-BR) — match por palavra inteira.
 * Lowercase, sem acento (a string de entrada é normalizada antes do match).
 * Inclui termos ambíguos (preto, pinto, gordo, etc.) — a política do projeto é
 * aceitar falsos positivos (ex: sobrenome "Pinto") em troca de bloqueio mais robusto.
 * Inclui combinações multi-palavra ("filho da puta", "filho da mae").
 */
export const DEFAULT_OFFENSIVE_TERMS: string[] = [
  // ── Palavrões sexuais / anatomia ──────────────────────────────────────────
  'puta', 'putas', 'puto', 'putos',
  'vagabunda', 'vagabundas', 'vagabundo', 'vagabundos',
  'vadia', 'vadias',
  'viado', 'viados', 'bicha', 'bichas', 'bixa', 'bixas',
  'corno', 'cornos', 'corna', 'cornas',
  'buceta', 'bucetas', 'xereca', 'xota', 'xoxota', 'perereca', 'periquita',
  'caralho', 'caralhos', 'porra', 'porras',
  'piroca', 'pirocas', 'pinto', 'pintos', 'pica', 'picas', 'rola', 'rolas', 'pau',
  'cu', 'cus', 'cuzao', 'cuzoes', 'cuzinho', 'cuzinhos',
  'merda', 'merdas', 'bosta', 'bostas',
  'foder', 'fode', 'fodeu', 'fodido', 'fodida', 'fodase', 'fodasse', 'foda',
  'piranha', 'piranhas', 'biscate', 'biscates',
  'punheta', 'punhetas', 'punheteiro', 'punheteira',
  'gozada', 'gozadas',
  // ── Xingamentos de caráter ────────────────────────────────────────────────
  'otario', 'otarios', 'otaria', 'otarias',
  'babaca', 'babacas',
  'idiota', 'idiotas',
  'imbecil', 'imbecis',
  'cretino', 'cretinos', 'cretina', 'cretinas',
  'estupido', 'estupidos', 'estupida', 'estupidas',
  'retardado', 'retardados', 'retardada', 'retardadas',
  'escroto', 'escrotos', 'escrota', 'escrotas',
  'safado', 'safados', 'safada', 'safadas',
  'mentirosa', 'mentirosas', 'mentiroso', 'mentirosos',
  'arrombado', 'arrombados', 'arrombada', 'arrombadas',
  'desgracado', 'desgracados', 'desgracada', 'desgracadas',
  'panaca', 'panacas',
  'bobao', 'bobona',
  'jumento', 'jumenta', 'jumentos', 'jumentas',
  'canalha', 'canalhas',
  'cafajeste', 'cafajestes',
  'miseravel', 'miseraveis',
  'nojento', 'nojentos', 'nojenta', 'nojentas',
  'ridiculo', 'ridicula', 'ridiculos', 'ridiculas',
  'ladrao', 'ladroes', 'ladra', 'ladras',
  'lixo', 'lixos',
  'bandido', 'bandidos', 'bandida', 'bandidas',
  'maldito', 'malditos', 'maldita', 'malditas',
  'trouxa', 'trouxas',
  'trapaceiro', 'trapaceira', 'trapaceiros', 'trapaceiras',
  'golpista', 'golpistas',
  // ── Racial / preconceito (ambíguos aceitos — política de robustez) ────────
  'macaco', 'macacos',
  'preto', 'pretos',
  'negao', 'neguinho', 'neguinha',
  'gordo', 'gorda', 'gordos', 'gordas',
  'mongol', 'mongols', 'mongoloide', 'mongoloides',
  'baitola', 'baitolas',
  // ── Abreviações ───────────────────────────────────────────────────────────
  'fdp', 'fdps', 'vsf', 'fdm', 'pqp', 'tnc',
  // ── Combinações multi-palavra (match literal com word boundary) ───────────
  'filho da puta', 'filhos da puta', 'filha da puta', 'filhas da puta',
  'filho da mae', 'filhos da mae', 'filha da mae', 'filhas da mae',
  'filho de puta', 'filha de puta',
  'filho duma puta', 'filha duma puta',
  'puta que pariu', 'puto que pariu', 'puta merda',
  'vai se foder', 'vai se fuder', 'vai tomar no cu',
  'toma no cu', 'tomar no cu',
  'vai a merda', 'vai se danar', 'vai pro inferno',
  'cala a boca', 'cala boca',
  'bunda mole', 'mao de vaca',
  'filho do diabo', 'filha do diabo',
  'enfia no cu', 'enfia no rabo',
  'pau no cu', 'pau no olho',
  'chupa meu pau', 'chupa minha pica', 'chupa meu pinto',
];

/**
 * Remove diacríticos (á → a, ç → c, etc.) e converte pra lowercase.
 * Usado só na comparação — o nome original é preservado.
 */
function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Escapa caracteres especiais de regex em cada termo.
 */
function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normaliza lista de termos: lowercase, sem acento, trim, sem vazios, sem duplicatas.
 * Usado tanto pro baseline quanto pros customs que vêm do DB.
 */
function normalizeTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    if (typeof raw !== 'string') continue;
    const clean = normalize(raw).trim();
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Constrói regex case-insensitive que casa qualquer termo da lista como palavra inteira.
 * \b funciona porque a entrada também é normalizada (sem acento) antes do test.
 */
function buildRegex(terms: string[]): RegExp {
  if (terms.length === 0) {
    // Regex que nunca casa — evita erro "empty alternation"
    return /(?!)/;
  }
  return new RegExp(
    `\\b(?:${terms.map(escapeRegex).join('|')})\\b`,
    'i',
  );
}

// ─── Cache em memória ────────────────────────────────────────────────────────
// Baseline sempre ativa. Custom terms vêm do DB e são aditivos.
// Hot path (sanitizeGreetingName) lê somente `activeRegex` — sync e rápido.

const BASELINE_TERMS = normalizeTerms(DEFAULT_OFFENSIVE_TERMS);
let customTerms: string[] = [];
let activeRegex: RegExp = buildRegex(BASELINE_TERMS);

/**
 * Define termos customizados (vindo do DB). É aditivo ao baseline.
 * Chame após salvar a blacklist no banco, pro cache em memória refletir.
 *
 * @param terms Lista bruta (será normalizada: lowercase + sem acento + dedup)
 */
export function setCustomBlacklist(terms: string[] | null | undefined): void {
  customTerms = Array.isArray(terms) ? normalizeTerms(terms) : [];
  // Combina baseline + custom com dedup
  const combined = Array.from(new Set([...BASELINE_TERMS, ...customTerms]));
  activeRegex = buildRegex(combined);
}

/**
 * Retorna a lista baseline (read-only) — usado pela UI pra mostrar "o que já está coberto".
 */
export function getBaselineTerms(): string[] {
  return [...BASELINE_TERMS];
}

/**
 * Retorna a lista de custom terms atualmente ativa em memória.
 */
export function getCustomTerms(): string[] {
  return [...customTerms];
}

/**
 * Valida e extrai primeiro nome "seguro" pra saudação.
 *
 * @param raw - Nome completo como veio do cadastro (pode ser null/undefined)
 * @returns objeto com `safe` (primeiro nome pronto) e `flagged` (true se bloqueado)
 */
export function sanitizeGreetingName(raw: string | null | undefined): SanitizedName {
  if (!raw) {
    return { safe: '', flagged: true, reason: 'empty' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { safe: '', flagged: true, reason: 'empty' };
  }

  const normalized = normalize(trimmed);

  if (activeRegex.test(normalized)) {
    return { safe: '', flagged: true, reason: 'offensive' };
  }

  // Só dígitos, só pontuação, ou sem nenhuma letra A-Z/acentuada → inválido.
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) {
    return { safe: '', flagged: true, reason: 'non_alpha' };
  }

  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord.length < 2) {
    return { safe: '', flagged: true, reason: 'too_short' };
  }

  return { safe: firstWord, flagged: false };
}

/**
 * Atalho: retorna só o primeiro nome seguro (string vazia se inválido).
 * Útil quando o consumidor não precisa saber o motivo.
 */
export function safeFirstName(raw: string | null | undefined): string {
  return sanitizeGreetingName(raw).safe;
}

/**
 * Atalho: checa se o nome completo contém algo ofensivo ou inválido pra saudação.
 */
export function isNameFlagged(raw: string | null | undefined): boolean {
  return sanitizeGreetingName(raw).flagged;
}
