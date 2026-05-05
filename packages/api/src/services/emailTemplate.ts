/**
 * Brand-aware email wrapper.
 *
 * - BGP → wrapBgpTemplate: exact replica of the original Bertuzzi Patrimonial
 *   email design (logo header → white card body → social icons → footer).
 * - AIMO → wrapAimoTemplate: AIMO premium shell (logo → white rounded card →
 *   minimal footer, no social icons, Space Grotesk + cobalt #1E3FFF).
 *
 * Default brand is BGP, so legacy callers keep working unchanged.
 */

import { AIMO_LOGO_DATA_URL } from '../seeds/aimoLogoBase64';

const LOGO_URL = 'https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20%282%29.png';
const WHATSAPP_LINK = 'https://wa.me/5551992091726?text=Ol%C3%A1%2C%20quero%20falar%20sobre%20o%20meu%20financeiro!';
const FONT = "Montserrat,'Trebuchet MS','Lucida Grande','Lucida Sans Unicode','Lucida Sans',Tahoma,sans-serif";

const AIMO_FONT = "'Space Grotesk','Inter','Helvetica Neue',Arial,sans-serif";
const AIMO_PRIMARY = '#1E3FFF';
const AIMO_DARK = '#0A0E1F';
const AIMO_NEUTRAL_BG = '#F4F5F8';
const AIMO_DIVIDER = '#E6E8EF';
const AIMO_TEXT_MUTED = '#6B7390';

export type Brand = 'BGP' | 'AIMO';

export interface WrapTemplateOptions {
  brand?: Brand;
  unsubscribeUrl?: string;
}

/**
 * Strips full-document tags so we can safely embed a body inside a wrapper.
 */
function cleanInnerBody(bodyHtml: string): string {
  return bodyHtml
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');
}

/**
 * Original BGP wrapper — kept byte-for-byte identical to the legacy template
 * so existing campaigns render exactly the same.
 *
 * @param bodyHtml The inner HTML content (text, buttons, images — NO html/head/body)
 * @param unsubscribeUrl The unsubscribe link for the footer
 */
export function wrapBgpTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  const cleanBody = cleanInnerBody(bodyHtml);

  const unsubLink = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" target="_blank" rel="noopener" style="text-decoration: underline; color: #8c8c8c;">cancele sua inscrição</a>`
    : `<a href="#" style="text-decoration: underline; color: #8c8c8c;">cancele sua inscrição</a>`;

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>BGP</title>
<!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:${FONT};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="mso-table-lspace:0;mso-table-rspace:0;background-color:#f4f4f4;">
<tbody><tr><td align="center">

<!-- ═══ HEADER: Logo ═══ -->
<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;border-radius:0;color:#000;width:605px;margin:0 auto" width="605">
<tbody><tr><td width="100%" style="mso-table-lspace:0;mso-table-rspace:0;font-weight:400;text-align:left;padding-left:8px;padding-right:8px;padding-top:48px;padding-bottom:24px;vertical-align:top">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0">
<tbody><tr><td style="width:100%;padding:0"><div align="center"><div style="max-width:206px">
<a href="https://bertuzzipatrimonial.com.br" target="_blank"><img src="${LOGO_URL}" style="display:block;height:auto;border:0;width:100%" width="206" alt="BGP" title="BGP" height="auto"></a>
</div></div></td></tr></tbody></table>
</td></tr></tbody></table>

<!-- ═══ BODY: White card ═══ -->
<table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;background-color:#fff;border-radius:16px 16px 0 0;color:#000;width:605px;margin:0 auto" width="605">
<tbody><tr><td width="100%" style="mso-table-lspace:0;mso-table-rspace:0;font-weight:400;text-align:left;padding-left:60px;padding-right:60px;padding-top:48px;padding-bottom:32px;vertical-align:top">
<div style="font-family:${FONT};font-size:16px;font-weight:400;line-height:1.5;color:#000;">
${cleanBody}
</div>
</td></tr></tbody></table>

<!-- ═══ SPACER ═══ -->
<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0">
<tbody><tr><td><table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;background-color:#fff;border-radius:0;color:#000;width:605px;margin:0 auto" width="605">
<tbody><tr><td width="100%" style="mso-table-lspace:0;mso-table-rspace:0;font-weight:400;text-align:left;vertical-align:top"><div style="height:16px;line-height:16px;font-size:1px"> </div></td></tr></tbody></table></td></tr></tbody></table>

<!-- ═══ SOCIAL ICONS ═══ -->
<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;width:605px;margin:0 auto" width="605">
<tbody><tr><td style="padding:10px"><div align="center">
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;display:inline-block">
<tbody><tr>
<td style="padding:0"><a href="https://www.instagram.com/bertuzzigp/" target="_blank"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/instagram@2x.png" width="32" height="auto" alt="Instagram" title="Instagram" style="display:block;height:auto;border:0"></a></td>
<td style="padding:0 0 0 20px"><a href="https://www.youtube.com/@bertuzzigp" target="_blank"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/youtube@2x.png" width="32" height="auto" alt="YouTube" title="YouTube" style="display:block;height:auto;border:0"></a></td>
<td style="padding:0 0 0 20px"><a href="${WHATSAPP_LINK}" target="_blank"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/whatsapp@2x.png" width="32" height="auto" alt="WhatsApp" title="WhatsApp" style="display:block;height:auto;border:0"></a></td>
</tr></tbody></table>
</div></td></tr></tbody></table>

<!-- ═══ FOOTER ═══ -->
<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;width:605px;margin:0 auto" width="605">
<tbody><tr><td width="100%" style="mso-table-lspace:0;mso-table-rspace:0;font-weight:400;text-align:left;padding-bottom:24px;vertical-align:top">
<table width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace:0;mso-table-rspace:0;word-break:break-word">
<tbody><tr><td><div style="font-family:${FONT}"><div style="font-size:12px;color:#8c8c8c;line-height:1.5">
<p style="margin:0;text-align:center;">
<span style="font-size:10px;">Enviado por www.bertuzzipatrimonial.com.br</span><br>
<span style="font-size:10px;">Av. Carlos Gomes, 75 - Sala 603 - Auxiliadora, Porto Alegre - RS, 90480-000</span><br>
<span style="font-size:10px;">Caso não queira mais receber estes e-mails, ${unsubLink}.</span>
</p></div></div></td></tr></tbody></table>
</td></tr></tbody></table>

</td></tr></tbody></table>
</body>
</html>`;
}

/**
 * AIMO wrapper — pass-through inteligente.
 *
 * O template AIMO canônico (seeds/aimoEmailTemplate.html) já é um documento HTML
 * completo, com header/hero/footer/styles próprios. Aplicar wrap em cima dele
 * duplica logo, footer e perde os styles do head. Por isso:
 *
 *  - Se o input já é um documento completo (DOCTYPE / <html>) → pass-through,
 *    apenas injeta o {{unsubscribe_url}} se fornecido.
 *  - Se é apenas um snippet de body (ex.: editor inline AIMO sem doctype) →
 *    aplica um wrap mínimo (DOCTYPE + meta + body com fonte/bg AIMO), SEM
 *    header/footer visual, evitando duplicação com qualquer template.
 *
 * @param bodyHtml HTML completo OU snippet de body
 * @param unsubscribeUrl Substitui {{unsubscribe_url}} no doc completo / vira link no fallback
 */
export function wrapAimoTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  // Detecta se já é um documento HTML completo
  const isCompleteDoc = /<!DOCTYPE|<html[\s>]/i.test(bodyHtml.trim().slice(0, 200));

  if (isCompleteDoc) {
    // Pass-through: respeita o template self-contained.
    if (unsubscribeUrl) {
      return bodyHtml.replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl);
    }
    return bodyHtml;
  }

  // Snippet de body — wrap institucional AIMO com header (logo) + footer.
  const unsubLink = unsubscribeUrl
    ? `<a href="${unsubscribeUrl}" style="color:${AIMO_TEXT_MUTED};text-decoration:underline">cancelar inscrição</a>`
    : `<span style="text-decoration:underline">cancelar inscrição</span>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
body { margin:0; padding:0; background-color:${AIMO_NEUTRAL_BG}; font-family:'Inter','Space Grotesk',system-ui,Arial,sans-serif; color:${AIMO_DARK}; }
a { color:${AIMO_PRIMARY}; }
</style>
</head>
<body>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${AIMO_NEUTRAL_BG};">
<tr><td align="center" style="padding:32px 16px;">

<!-- Container principal 600px -->
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;">

<!-- Header com logo AIMO -->
<tr>
<td align="left" style="padding:32px 40px 24px 40px;background-color:#FFFFFF;border-bottom:1px solid ${AIMO_DIVIDER};">
<img src="${AIMO_LOGO_DATA_URL}" alt="AiMO" width="96" style="display:block;width:96px;height:auto;border:0;" />
</td>
</tr>

<!-- Body do snippet -->
<tr>
<td style="padding:40px;font-family:${AIMO_FONT};font-size:15px;line-height:1.65;color:${AIMO_DARK};">
${bodyHtml}
</td>
</tr>

<!-- Footer institucional AiMO -->
<tr>
<td style="padding:32px 40px 32px 40px;background-color:${AIMO_DARK};border-top:1px solid #1A2040;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0">
<tr>
<td valign="middle" style="padding-right:12px;">
<img src="${AIMO_LOGO_DATA_URL}" alt="AiMO" width="56" style="display:block;width:56px;height:auto;border:0;filter:brightness(0) invert(1);" />
</td>
<td valign="middle">
<span style="font-family:${AIMO_FONT};font-size:13px;font-weight:500;color:#FFFFFF;letter-spacing:0.02em;">AiMO Corp</span>
</td>
</tr>
</table>
<p style="margin:18px 0 0 0;font-family:${AIMO_FONT};font-size:12px;line-height:1.6;color:${AIMO_TEXT_MUTED};">
Gestão patrimonial inteligente.<br />
aimocorp.com.br
</p>
<div style="width:100%;height:1px;background-color:#1A2040;margin:20px 0;font-size:0;line-height:0;">&nbsp;</div>
<p style="margin:0;font-family:${AIMO_FONT};font-size:11px;line-height:1.6;color:${AIMO_TEXT_MUTED};">
Você está recebendo este email porque demonstrou interesse em conteúdos da AiMO. Caso não queira mais receber, ${unsubLink}.
</p>
</td>
</tr>

</table>

</td></tr></table>
</body>
</html>`;
}

/**
 * Brand-aware dispatcher. Backward-compatible with the legacy signature
 * `wrapInBrandTemplate(bodyHtml, unsubscribeUrl?)` — when the second arg is a
 * string it's treated as the unsubscribe URL with brand=BGP (default).
 *
 * New callers should pass `{ brand, unsubscribeUrl }`:
 *
 *   wrapInBrandTemplate(html, { brand: 'AIMO', unsubscribeUrl: url });
 */
export function wrapInBrandTemplate(
  bodyHtml: string,
  unsubscribeUrlOrOptions?: string | WrapTemplateOptions,
): string {
  const opts: WrapTemplateOptions =
    typeof unsubscribeUrlOrOptions === 'string'
      ? { unsubscribeUrl: unsubscribeUrlOrOptions }
      : (unsubscribeUrlOrOptions ?? {});

  const brand: Brand = opts.brand ?? 'BGP';

  if (brand === 'AIMO') {
    return wrapAimoTemplate(bodyHtml, opts.unsubscribeUrl);
  }
  return wrapBgpTemplate(bodyHtml, opts.unsubscribeUrl);
}

/** Standard CTA button style (green #3ae056, Montserrat, matches original BGP emails) */
export const CTA_BUTTON_STYLE = `background-color:#3ae056;color:#ffffff;display:inline-block;font-family:${FONT};font-size:14px;font-weight:bold;padding:10px 24px;border-radius:4px;text-decoration:none;text-align:center;`;

/** AIMO CTA button style (cobalt #1E3FFF, Space Grotesk) */
export const AIMO_CTA_BUTTON_STYLE = `background-color:${AIMO_PRIMARY};color:#ffffff;display:inline-block;font-family:${AIMO_FONT};font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;text-align:center;letter-spacing:0.2px;`;
