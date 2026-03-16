import {
  EmailDocument,
  EmailSection,
  GlobalStyle,
  HeaderData,
  TextData,
  ImageData,
  ButtonData,
  DividerData,
  ColumnsData,
  SocialData,
  FooterData,
  SpacerData,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderEmailHtml(doc: EmailDocument): string {
  const { globalStyle, sections } = doc;
  const rows = sections.map((s) => renderSection(s, globalStyle)).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${esc(globalStyle.bodyBackgroundColor)};font-family:${esc(globalStyle.fontFamily)};font-size:${esc(globalStyle.fontSize)};color:${esc(globalStyle.textColor)};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${esc(globalStyle.bodyBackgroundColor)};">
<tr>
<td align="center" style="padding:20px 0;">
<table role="presentation" width="${globalStyle.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="background-color:${esc(globalStyle.contentBackgroundColor)};border-radius:8px;max-width:${globalStyle.contentWidth}px;width:100%;">
${rows}
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Section dispatcher
// ---------------------------------------------------------------------------

function renderSection(section: EmailSection, globalStyle: GlobalStyle): string {
  const { style, data } = section;

  const paddingParts = [
    `${style.paddingTop ?? 0}px`,
    `${style.paddingRight ?? 0}px`,
    `${style.paddingBottom ?? 0}px`,
    `${style.paddingLeft ?? 0}px`,
  ];
  const padding = paddingParts.join(" ");
  const bg = style.backgroundColor ? `background-color:${esc(style.backgroundColor)};` : "";
  const tdStyle = `padding:${padding};${bg}`;

  let content: string;

  switch (data.type) {
    case "header":
      content = renderHeader(data, globalStyle);
      break;
    case "text":
      content = renderText(data);
      break;
    case "image":
      content = renderImage(data);
      break;
    case "button":
      content = renderButton(data);
      break;
    case "divider":
      content = renderDivider(data);
      break;
    case "columns":
      content = renderColumns(data);
      break;
    case "social":
      content = renderSocial(data, globalStyle);
      break;
    case "footer":
      content = renderFooter(data);
      break;
    case "spacer":
      return renderSpacer(data, bg);
    default:
      content = "";
  }

  return `<tr><td style="${tdStyle}">${content}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(data: HeaderData, globalStyle: GlobalStyle): string {
  const align = data.alignment ?? "center";

  if (!data.logoUrl) {
    return `<div style="text-align:${align};font-family:${esc(globalStyle.fontFamily)};">${data.html}</div>`;
  }

  const logoWidth = data.logoWidth ?? 120;
  const logoImg = `<img src="${esc(data.logoUrl)}" alt="${esc(data.companyName ?? "")}" width="${logoWidth}" style="display:block;border:0;outline:none;" />`;

  if (!data.html || data.html.trim() === "") {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${align}">${logoImg}</td></tr></table>`;
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td align="${align}" style="font-family:${esc(globalStyle.fontFamily)};">
${logoImg}
</td>
<td align="${align}" style="font-family:${esc(globalStyle.fontFamily)};padding-left:12px;">
${data.html}
</td>
</tr>
</table>`;
}

function renderText(data: TextData): string {
  return data.html;
}

function renderImage(data: ImageData): string {
  const width = data.width === "full" ? "100%" : `${data.width}`;
  const widthAttr = data.width === "full" ? '100%' : String(data.width);
  const imgTag = `<img src="${esc(data.src)}" alt="${esc(data.alt)}" width="${widthAttr}" style="display:block;max-width:100%;height:auto;border:0;outline:none;" />`;

  const wrapped = data.linkUrl
    ? `<a href="${esc(data.linkUrl)}" target="_blank" style="text-decoration:none;">${imgTag}</a>`
    : imgTag;

  return `<div style="text-align:${data.alignment};">${wrapped}</div>`;
}

function renderButton(data: ButtonData): string {
  const paddingMap = { sm: "8px 16px", md: "12px 24px", lg: "16px 32px" };
  const fontSizeMap = { sm: "14px", md: "16px", lg: "18px" };
  const padding = paddingMap[data.size] ?? paddingMap.md;
  const fontSize = fontSizeMap[data.size] ?? fontSizeMap.md;

  const button = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr>
<td align="center" style="background-color:${esc(data.buttonColor)};border-radius:${data.borderRadius}px;padding:${padding};">
<a href="${esc(data.url)}" target="_blank" style="color:${esc(data.textColor)};text-decoration:none;font-weight:bold;font-size:${fontSize};display:inline-block;line-height:1.2;">${esc(data.text)}</a>
</td>
</tr>
</table>`;

  return `<div style="text-align:${data.alignment};">${button}</div>`;
}

function renderDivider(data: DividerData): string {
  return `<table role="presentation" width="${data.width}%" cellpadding="0" cellspacing="0" border="0" align="center">
<tr>
<td style="border-top:${data.thickness}px ${esc(data.style)} ${esc(data.color)};font-size:0;line-height:0;">&nbsp;</td>
</tr>
</table>`;
}

function renderColumns(data: ColumnsData): string {
  const layoutMap: Record<string, number[]> = {
    "50-50": [50, 50],
    "33-67": [33, 67],
    "67-33": [67, 33],
    "33-33-33": [33, 33, 34],
  };

  const widths = layoutMap[data.layout] ?? [50, 50];
  const halfGap = Math.round((data.gap ?? 0) / 2);

  const cols = data.columns
    .map((col, i) => {
      const w = widths[i] ?? Math.round(100 / data.columns.length);
      return `<td width="${w}%" valign="top" style="padding:0 ${halfGap}px;">${col.html}</td>`;
    })
    .join("\n");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
${cols}
</tr>
</table>`;
}

function renderSocial(data: SocialData, globalStyle: GlobalStyle): string {
  const links = data.links
    .map(
      (link) =>
        `<a href="${esc(link.url)}" target="_blank" style="color:${esc(globalStyle.linkColor)};text-decoration:none;margin:0 8px;font-size:${data.iconSize}px;">${esc(capitalize(link.platform))}</a>`,
    )
    .join("\n");

  return `<div style="text-align:${data.alignment};">${links}</div>`;
}

function renderFooter(data: FooterData): string {
  return `<div style="text-align:${data.alignment};font-size:12px;color:#999999;line-height:1.5;">${data.html}</div>`;
}

function renderSpacer(data: SpacerData, bg: string): string {
  return `<tr><td style="height:${data.height}px;line-height:${data.height}px;font-size:0;${bg}">&nbsp;</td></tr>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
