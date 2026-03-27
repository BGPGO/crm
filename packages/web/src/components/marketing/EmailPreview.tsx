"use client";

import clsx from "clsx";

const LOGO_URL = 'https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20(2).png';
const WHATSAPP_LINK = 'https://wa.me/5551992091726?text=Ol%C3%A1%2C%20quero%20falar%20sobre%20o%20meu%20financeiro!';
const FONT = "Montserrat,'Trebuchet MS','Lucida Grande','Lucida Sans Unicode','Lucida Sans',Tahoma,sans-serif";

/**
 * Wraps body HTML in the BGP branded email shell for preview purposes.
 * Mirrors the backend wrapInBrandTemplate() so the preview matches what
 * recipients actually receive.
 */
export function wrapInBrandPreview(bodyHtml: string): string {
  // Strip any existing full-document tags so we only keep inner content
  const clean = bodyHtml
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?body[^>]*>/gi, '');

  // Also strip the outer layout tables from compileFullHtml() if present
  const outerTableRe =
    /^\s*<table[^>]*>\s*<tr>\s*<td[^>]*align=["']center["'][^>]*>\s*<table[^>]*>\s*<tr>\s*<td[^>]*>([\s\S]*)<\/td>\s*<\/tr>\s*<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*$/i;
  const match = clean.trim().match(outerTableRe);
  const content = match ? match[1] : clean;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tbody><tr><td align="center">

<!-- HEADER: Logo -->
<table align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:605px;margin:0 auto">
<tbody><tr><td style="padding-top:48px;padding-bottom:24px;text-align:center">
<a href="https://bertuzzipatrimonial.com.br" target="_blank"><img src="${LOGO_URL}" style="display:inline-block;height:auto;border:0;width:206px" alt="BGP"></a>
</td></tr></tbody></table>

<!-- BODY: White card -->
<table align="center" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fff;border-radius:16px 16px 0 0;width:605px;margin:0 auto">
<tbody><tr><td style="padding:48px 60px 32px;font-family:${FONT};font-size:16px;font-weight:400;line-height:1.5;color:#000;">
${content}
</td></tr></tbody></table>

<!-- SPACER -->
<table align="center" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#fff;width:605px;margin:0 auto">
<tbody><tr><td style="height:16px;line-height:16px;font-size:1px">&nbsp;</td></tr></tbody></table>

<!-- SOCIAL ICONS -->
<table align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:605px;margin:0 auto">
<tbody><tr><td style="padding:10px;text-align:center">
<a href="https://www.instagram.com/bertuzzigp/" target="_blank" style="display:inline-block;margin:0 10px"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/instagram@2x.png" width="32" height="auto" alt="Instagram" style="display:block;border:0"></a>
<a href="https://www.youtube.com/@bertuzzigp" target="_blank" style="display:inline-block;margin:0 10px"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/youtube@2x.png" width="32" height="auto" alt="YouTube" style="display:block;border:0"></a>
<a href="${WHATSAPP_LINK}" target="_blank" style="display:inline-block;margin:0 10px"><img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/whatsapp@2x.png" width="32" height="auto" alt="WhatsApp" style="display:block;border:0"></a>
</td></tr></tbody></table>

<!-- FOOTER -->
<table align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:605px;margin:0 auto">
<tbody><tr><td style="padding:0 10px 24px">
<p style="font-family:${FONT};font-size:10px;color:#8c8c8c;line-height:1.5;text-align:center;margin:0;">
Enviado por www.bertuzzipatrimonial.com.br<br>
Av. Carlos Gomes, 75 - Sala 603 - Auxiliadora, Porto Alegre - RS, 90480-000<br>
Caso não queira mais receber estes e-mails, <span style="text-decoration:underline">cancele sua inscrição</span>.
</p>
</td></tr></tbody></table>

</td></tr></tbody></table>
</body>
</html>`;
}

interface EmailPreviewProps {
  html: string;
  className?: string;
  /** When true, wraps the html in the BGP brand template before rendering */
  branded?: boolean;
}

export default function EmailPreview({ html, className, branded }: EmailPreviewProps) {
  const srcDoc = branded ? wrapInBrandPreview(html) : html;

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox=""
      className={clsx(
        "w-full border border-gray-200 rounded-xl bg-white",
        className
      )}
      title="Email Preview"
      style={{ minHeight: 400 }}
    />
  );
}
