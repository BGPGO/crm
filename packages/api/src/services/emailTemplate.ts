/**
 * Standard BGP email wrapper — exact replica of the original Bertuzzi Patrimonial email design.
 * Structure: Logo header → White card body → Social icons → Footer with address + unsubscribe
 */

const LOGO_URL = 'https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20%282%29.png';
const WHATSAPP_LINK = 'https://wa.me/5551992091726?text=Ol%C3%A1%2C%20quero%20falar%20sobre%20o%20meu%20financeiro!';
const FONT = "Montserrat,'Trebuchet MS','Lucida Grande','Lucida Sans Unicode','Lucida Sans',Tahoma,sans-serif";

/**
 * Wraps email body content in the BGP branded template.
 * @param bodyHtml The inner HTML content (text, buttons, images — NO html/head/body)
 * @param unsubscribeUrl The unsubscribe link for the footer
 */
export function wrapInBrandTemplate(bodyHtml: string, unsubscribeUrl?: string): string {
  // Strip any existing full-document tags
  const cleanBody = bodyHtml
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

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

/** Standard CTA button style (green #3ae056, Montserrat, matches original BGP emails) */
export const CTA_BUTTON_STYLE = `background-color:#3ae056;color:#ffffff;display:inline-block;font-family:${FONT};font-size:14px;font-weight:bold;padding:10px 24px;border-radius:4px;text-decoration:none;text-align:center;`;
