/**
 * Formata um valor numérico como moeda BRL
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata uma data ISO para o padrão pt-BR (dd/mm/aaaa).
 * Aceita `timeZone` opcional (ex: "America/Sao_Paulo") — sem ele, usa o fuso do navegador.
 */
export function formatDate(date: string | Date, timeZone?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/**
 * Formata uma data ISO com horário.
 * Aceita `timeZone` opcional (ex: "America/Sao_Paulo") — sem ele, usa o fuso do navegador.
 */
export function formatDateTime(date: string | Date, timeZone?: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/**
 * Formata um número de telefone brasileiro
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return phone;
}

/**
 * Formata um CNPJ
 */
export function formatCNPJ(cnpj: string): string {
  const digits = cnpj.replace(/\D/g, "");
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}

/**
 * Formata texto no estilo WhatsApp para HTML.
 * Suporta *negrito*, _itálico_, ~tachado~ e ```monospace```.
 * Escapa HTML antes de processar.
 */
export function formatWhatsAppText(text: string): string {
  // Escape HTML first
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // ```code blocks```
  html = html.replace(/```([\s\S]*?)```/g, '<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">$1</code>');
  // *bold*
  html = html.replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, "<strong>$1</strong>");
  // _italic_
  html = html.replace(/_((?:[^_\s]|[^_\s][^_]*[^_\s]))_/g, "<em>$1</em>");
  // ~strikethrough~
  html = html.replace(/~([^\s~](?:[^~]*[^\s~])?)~/g, "<del>$1</del>");

  return html;
}

/**
 * Retorna uma string relativa de tempo (ex: "há 3 dias")
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) return formatDate(d);
  if (diffDays > 1) return `há ${diffDays} dias`;
  if (diffDays === 1) return "há 1 dia";
  if (diffHours > 1) return `há ${diffHours} horas`;
  if (diffHours === 1) return "há 1 hora";
  if (diffMinutes > 1) return `há ${diffMinutes} minutos`;
  return "agora há pouco";
}
