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
 */
function resolveVariables(template: string, contact: ContactData): string {
  const firstName = contact.name?.split(' ')[0] || '';
  return template
    .replace(/\{nome\}/gi, firstName || contact.name || '')
    .replace(/\{nome_completo\}/gi, contact.name || '')
    .replace(/\{empresa\}/gi, contact.company || '')
    .replace(/\{email\}/gi, contact.email || '')
    .replace(/\{telefone\}/gi, contact.phone || '');
}

/**
 * Processa o template completo: primeiro spin, depois variáveis.
 * A ordem importa: spin primeiro garante que variáveis dentro de spins também funcionem.
 */
export function processMessageTemplate(template: string, contact: ContactData): string {
  const afterSpin = resolveSpin(template);
  return resolveVariables(afterSpin, contact);
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
