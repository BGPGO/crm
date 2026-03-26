/**
 * Standard BGP email wrapper — header with gradient + logo, footer with company info + unsubscribe
 * All campaign and automation emails are wrapped in this template.
 */

const LOGO_URL = 'https://crm.bertuzzipatrimonial.com.br/images/logo-bgp-email.png';
const PRIMARY = '#244c5a';
const SECONDARY = '#abc7c9';

/**
 * Wraps email body content in the BGP branded template.
 * @param bodyHtml The inner HTML content (just the email body, no html/body tags)
 * @param unsubscribeUrl The unsubscribe link for the footer
 */
export function wrapInBrandTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  // Strip any existing <html>, <head>, <body> tags from the body content
  let cleanBody = bodyHtml
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  const unsubLink = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color: ${SECONDARY}; text-decoration: underline; font-size: 12px;">Descadastrar</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BGP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <!-- Email container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

          <!-- HEADER: gradient + logo -->
          <tr>
            <td style="background: linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY}dd 50%, ${SECONDARY}88 100%); padding: 24px 32px; text-align: right;">
              <img src="${LOGO_URL}" alt="BGP" width="120" style="display: inline-block; height: auto; max-width: 120px;" />
            </td>
          </tr>

          <!-- BODY: email content -->
          <tr>
            <td style="padding: 32px; color: #333333; font-size: 15px; line-height: 1.6;">
              ${cleanBody}
            </td>
          </tr>

          <!-- FOOTER: company info + unsubscribe -->
          <tr>
            <td style="background-color: ${PRIMARY}; padding: 24px 32px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 12px;">
                    <img src="${LOGO_URL}" alt="BGP" width="80" style="display: inline-block; height: auto; max-width: 80px; opacity: 0.7;" />
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; color: ${SECONDARY}; font-size: 12px; line-height: 1.5;">
                    <strong style="color: #ffffff; font-size: 13px;">Bertuzzi Patrimonial</strong><br>
                    Gestão financeira inteligente para o seu negócio<br><br>
                    <a href="https://bertuzzipatrimonial.com.br" style="color: ${SECONDARY}; text-decoration: none;">bertuzzipatrimonial.com.br</a>
                    &nbsp;|&nbsp;
                    <a href="https://instagram.com/bertuzzipatrimonial" style="color: ${SECONDARY}; text-decoration: none;">@bertuzzipatrimonial</a>
                  </td>
                </tr>
                ${unsubLink ? `
                <tr>
                  <td style="text-align: center; padding-top: 16px; border-top: 1px solid ${PRIMARY}88;">
                    <span style="color: ${SECONDARY}88; font-size: 11px;">Não quer mais receber nossos emails?</span><br>
                    ${unsubLink}
                  </td>
                </tr>
                ` : ''}
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
