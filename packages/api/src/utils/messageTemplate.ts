/**
 * Processa um template de mensagem com spin syntax e variáveis de personalização.
 *
 * Spin syntax: {opção1|opção2|opção3} — escolhe uma aleatoriamente
 * Variáveis: {nome}, {empresa}, {telefone} — substituídas por dados do contato
 *
 * Exemplo:
 *   Input:  "{Oi|Olá|E aí}, {nome}! Tudo bem?"
 *   Output: "Olá, João Silva! Tudo bem?"
 */

import { sanitizeGreetingName } from './nameSanitizer';

export interface ContactData {
  name?: string | null;
  phone?: string;
  company?: string | null;
  email?: string | null;
}

/**
 * Resolve spin groups: {a|b|c} → escolhe um aleatoriamente
 */
function resolveSpin(template: string): string {
  return template.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, group: string) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

/**
 * Resolve variáveis de personalização: {nome}, {empresa}, etc.
 *
 * Nomes ofensivos/inválidos (xingamento cadastrado, só dígitos, etc.) passam
 * pelo nameSanitizer — se reprovados, {nome} e {nome_completo} viram vazio.
 */
function resolveVariables(template: string, contact: ContactData): string {
  const sanitized = sanitizeGreetingName(contact.name);
  const firstName = sanitized.safe;
  const fullName = sanitized.flagged ? '' : (contact.name || '');
  return template
    .replace(/\{nome\}/gi, firstName)
    .replace(/\{nome_completo\}/gi, fullName)
    .replace(/\{empresa\}/gi, contact.company || '')
    .replace(/\{email\}/gi, contact.email || '')
    .replace(/\{telefone\}/gi, contact.phone || '');
}

/**
 * Limpa pontuação órfã que sobra quando uma variável vira vazio.
 * Ex.: "Oi, ! Tudo bem, ?" → "Oi! Tudo bem?"
 *      ", olha só..." → "Olha só..."
 *      "Oi!, tudo bem?" → "Oi! Tudo bem?"
 */
function cleanupOrphanPunctuation(text: string): string {
  let out = text;

  // Aplica múltiplas vezes até estabilizar — substituições podem gerar novas correspondências.
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out
      // vírgula imediatamente antes de outra pontuação terminal: "Oi, !" ou "Oi!," → "Oi!"
      .replace(/,\s*([!?.;:])/g, '$1')
      .replace(/([!?.;:])\s*,/g, '$1')
      // espaço antes de pontuação: "Oi !" → "Oi!"
      .replace(/\s+([!?.;:,])/g, '$1')
      // espaços duplos → um só
      .replace(/[ \t]{2,}/g, ' ')
      // início de linha com pontuação órfã: ", olha" → "Olha" | "! olha" → "Olha"
      .replace(/^[\s,;:]+/gm, '')
      // capitaliza primeira letra de cada linha quando possível
      .replace(/^([a-záéíóúâêôãõç])/gm, (m) => m.toUpperCase())
      // vírgula/espaço no final de linha → remove
      .replace(/[\s,]+$/gm, '');
    if (out === before) break;
  }

  return out.trim();
}

/**
 * Processa o template completo: primeiro spin, depois variáveis, depois limpeza.
 * A ordem importa: spin primeiro garante que variáveis dentro de spins também funcionem.
 * O cleanup final remove pontuação órfã quando o nome é sanitizado para vazio.
 */
export function processMessageTemplate(template: string, contact: ContactData): string {
  const afterSpin = resolveSpin(template);
  const afterVars = resolveVariables(afterSpin, contact);
  return cleanupOrphanPunctuation(afterVars);
}

/**
 * Valida se um template tem spin syntax ou variáveis.
 * Útil para mostrar preview no frontend.
 */
export function hasTemplateFeatures(template: string): boolean {
  return /\{[^{}]+\}/.test(template);
}

/**
 * Gera N amostras de um template para preview.
 */
export function previewTemplate(template: string, contact: ContactData, samples = 3): string[] {
  return Array.from({ length: samples }, () => processMessageTemplate(template, contact));
}
