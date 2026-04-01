/**
 * Detecção de re-engagement para contatos que deram opt-out.
 *
 * Objetivo: ser CONSERVADOR. É melhor não reativar do que reativar por engano.
 * Mensagens genéricas ("oi", "ok", "sim") NÃO reativam o contato.
 * Apenas mensagens com intenção clara de retomar conversa são aceitas.
 */

// Palavras genéricas que por si sós NÃO indicam re-engagement
const PALAVRAS_GENERICAS = new Set([
  'ok', 'oi', 'ola', 'opa', 'hm', 'hmm', 'sim', 'nao', 'não', 'ta', 'tá',
  'blz', 'beleza', 'vlw', 'valeu', 'obrigado', 'obrigada', 'ah', 'kk', 'kkk',
  'haha', 'rs', 'rsrs', 'lol', 'uau', 'ue', 'ei', 'e', 'a', 'o', 'é', 'bom',
  'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'tudo bom', 'como vai',
  'ate', 'até', 'tchau', 'xau', 'fui', 'bjo', 'bjos', 'abs',
]);

// Prefixos de palavras-chave de negócio — indicam interesse real
const KEYWORDS_NEGOCIO = [
  'reuni', 'propos', 'preç', 'prec', 'valor', 'serviç', 'servic', 'produt',
  'contrat', 'consult', 'agend', 'informaç', 'informac', 'orçament', 'orcament',
  'plano', 'demonstr', 'interesse', 'invest', 'comprar', 'adquir', 'convers',
  'quero saber', 'quero entender', 'gostaria', 'poderia', 'pode me', 'como func',
  'quanto cust', 'qual o valor', 'qual o preç', 'me fala', 'me conta',
];

/** Normaliza texto: remove acentos, converte para minúsculas, trim */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Retorna true se o texto é composto apenas por emojis e espaços */
function isOnlyEmojis(text: string): boolean {
  // Remove emojis e espaços; se sobrar nada, é só emoji
  const semEmojis = text.replace(
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}]/gu,
    ''
  ).trim();
  return semEmojis.length === 0;
}

/** Divide o texto em palavras reais (ignora pontuação e emojis soltos) */
function extrairPalavras(texto: string): string[] {
  return texto
    .replace(/[^\w\s\u00C0-\u024F]/g, ' ') // remove pontuação, mantém letras com acento
    .split(/\s+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Detecta se uma mensagem de um contato que deu opt-out demonstra
 * intenção real de retomar conversa.
 *
 * NÃO reativa com: "ok", "oi", "hm", "sim", "não", "?", emojis soltos,
 * mensagens curtas genéricas (< 4 palavras sem conteúdo substantivo).
 *
 * REATIVA com: perguntas sobre produto/serviço, pedido de informação,
 * menção a reunião/proposta/preço, mensagens com 4+ palavras substantivas.
 */
export function isReEngagementMessage(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  const textoOriginal = text.trim();

  // Rejeita se for apenas emojis
  if (isOnlyEmojis(textoOriginal)) return false;

  const normalizado = normalize(textoOriginal);

  // Rejeita se for apenas "?"
  if (normalizado === '?') return false;

  const palavras = extrairPalavras(normalizado);

  // Rejeita se tiver menos de 4 palavras
  if (palavras.length < 4) {
    // Exceção: contém keyword de negócio explícita mesmo sendo curto
    const contemKeyword = KEYWORDS_NEGOCIO.some(kw => normalizado.includes(kw));
    if (!contemKeyword) return false;
  }

  // Conta palavras que NÃO são genéricas
  const palavrasSubstantivas = palavras.filter(p => !PALAVRAS_GENERICAS.has(p));

  // Se todas as palavras são genéricas, não é re-engagement
  if (palavrasSubstantivas.length === 0) return false;

  // Verifica presença de keywords de negócio
  const contemKeywordNegocio = KEYWORDS_NEGOCIO.some(kw => normalizado.includes(kw));
  if (contemKeywordNegocio) return true;

  // Pergunta com conteúdo: tem "?" e pelo menos 3 palavras não-genéricas
  if (normalizado.includes('?') && palavrasSubstantivas.length >= 3) return true;

  // Mensagem com 4+ palavras substantivas (não genéricas) = intenção real
  if (palavrasSubstantivas.length >= 4) return true;

  return false;
}
