/**
 * Helpers para tagear links do Calendly com UTMs, de forma que o webhook do
 * Calendly possa distinguir a origem da reunião (Email, LP, BIA, etc).
 *
 * Ver lógica de detecção em packages/api/src/routes/calendly-webhook.ts
 * (detectMeetingSource) — os valores abaixo correspondem às UTMs que ela
 * reconhece.
 */

/**
 * Adiciona parâmetros UTM a uma URL, sem sobrescrever UTMs já presentes.
 * Se a URL for inválida, retorna o input intacto.
 */
export function appendUtmsToLink(url: string, params: Record<string, string>): string {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (!parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, value);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Reescreve todos os href de domínios do Calendly num HTML, adicionando UTMs.
 * Preserva o resto do HTML intacto. Não sobrescreve UTMs já presentes no link.
 *
 * Cobre `calendly.com`, `*.calendly.com` e variantes com query/fragment.
 */
export function rewriteCalendlyLinksInHtml(
  html: string,
  params: Record<string, string>,
): string {
  if (!html) return html;

  return html.replace(
    /href="(https?:\/\/(?:[^"\/]+\.)?calendly\.com\/[^"]*)"/gi,
    (_match, url: string) => `href="${appendUtmsToLink(url, params)}"`,
  );
}

/**
 * UTMs padrão para emails do CRM (cadência, transacional, etc).
 * O webhook do Calendly classifica como CALENDLY_EMAIL.
 */
export const EMAIL_CAMPAIGN_UTMS = {
  utm_source: 'email_cadencia',
  utm_medium: 'crm',
} as const;
