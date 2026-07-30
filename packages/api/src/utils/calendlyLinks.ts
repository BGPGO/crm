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

/**
 * Parâmetro que leva o ID da negociação dentro do link do Calendly.
 *
 * `salesforce_uuid` é o campo que o Calendly reserva para ID de registro
 * externo: ele chega de volta em `payload.tracking.salesforce_uuid` no webhook.
 * Usamos ele em vez de um `utm_*` porque os UTMs aqui já têm dono — utm_content
 * é público e utm_term é anúncio na atribuição de mídia — e sobrepor significado
 * quebraria os relatórios de campanha.
 */
export const DEAL_ID_PARAM = 'salesforce_uuid';

/**
 * Tagueia o link do Calendly com o ID da negociação.
 *
 * É isso que torna o vínculo reunião↔negociação determinístico. Sem ele, o
 * webhook só consegue casar por email do convidado, e quem agenda com um email
 * diferente do cadastrado fica sem vínculo — hoje 15% das reuniões do read.ai
 * estão órfãs por esse motivo.
 */
export function tagCalendlyLinkWithDeal(
  url: string,
  dealId: string,
  utms: Record<string, string> = {},
): string {
  return appendUtmsToLink(url, { ...utms, [DEAL_ID_PARAM]: dealId });
}

/** Mesma coisa, para todos os links do Calendly dentro de um HTML. */
export function rewriteCalendlyLinksWithDeal(
  html: string,
  dealId: string,
  utms: Record<string, string> = {},
): string {
  return rewriteCalendlyLinksInHtml(html, { ...utms, [DEAL_ID_PARAM]: dealId });
}
