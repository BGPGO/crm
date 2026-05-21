/**
 * Helpers para lidar com o header dos templates WABA.
 *
 * Há dois fluxos cobertos aqui:
 *
 * 1. SYNC — quando o CRM lê o template da Meta (GET .../message_templates),
 *    cada component HEADER pode ter `format: TEXT | IMAGE | VIDEO | DOCUMENT`.
 *    Para TEXT, o conteúdo está em `headerComp.text`.
 *    Para mídia, a URL pública aprovada está em `headerComp.example.header_handle[0]`
 *    (ou `header_url[0]` em alguns formatos antigos). `extractHeaderContent` cobre
 *    todos os casos e devolve a string a guardar no DB (campo `headerContent`).
 *
 * 2. ENVIO — quando o CRM monta a chamada `POST /{phone_id}/messages` com
 *    `type: template`, templates com header de mídia EXIGEM um component
 *    `header` no array `components`, caso contrário a Meta rejeita com
 *    código 132000 (parameters mismatch). `buildTemplateHeaderComponent` recebe
 *    o template do DB e devolve o objeto pronto pra inserir no array, ou null
 *    quando não há header de mídia (header TEXT sem variáveis não precisa de
 *    component no envio).
 */

interface TemplateForHeaderBuild {
  headerType?: string | null;
  headerContent?: string | null;
}

interface HeaderComponentForExtraction {
  format?: string;
  text?: string;
  example?: {
    header_handle?: string[];
    header_url?: string[];
    header_text?: string[];
  };
}

/**
 * Extrai o conteúdo do header de um component HEADER retornado pela Meta.
 * - TEXT  → component.text
 * - IMAGE/VIDEO/DOCUMENT → example.header_handle[0] ou header_url[0]
 * - Sem header → null
 */
export function extractHeaderContent(headerComp: HeaderComponentForExtraction | null | undefined): string | null {
  if (!headerComp) return null;
  const format = (headerComp.format || '').toUpperCase();

  if (format === 'TEXT') {
    return headerComp.text ?? null;
  }

  if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
    const handle = headerComp.example?.header_handle?.[0];
    const url = headerComp.example?.header_url?.[0];
    return handle || url || null;
  }

  return null;
}

/**
 * Decide qual headerContent guardar no DB durante sync com a Meta.
 *
 * A Meta devolve `header_handle` como uma URL `scontent.whatsapp.net` assinada,
 * que NÃO é fetchable pra reenvio (códigos `_nc_sid`/`_nc_ohc` são sessão interna).
 * Quando o operador sobrescreve manualmente com uma URL pública (Supabase Storage,
 * R2, etc) pra que a Meta consiga buscar no envio, o sync seguinte iria reverter
 * o override e quebrar broadcasts (incidente 2026-05-21 GOBI: 215 falhas 131053).
 *
 * Regra: pra headers de mídia (IMAGE/VIDEO/DOCUMENT), se já existe um override
 * manual (URL não-scontent), preserva. Caso contrário usa o valor extraído da Meta.
 * Pra TEXT, sempre usa o valor da Meta (é o texto do template aprovado).
 */
export function resolveSyncedHeaderContent(
  existingContent: string | null | undefined,
  extractedContent: string | null,
  headerType: string | null | undefined,
): string | null {
  const isMediaHeader =
    headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT';
  if (!isMediaHeader) return extractedContent;

  const hasManualOverride =
    !!existingContent && !existingContent.includes('scontent.whatsapp.net');
  return hasManualOverride ? existingContent! : extractedContent;
}

/**
 * Monta o component `header` da payload de envio de template message.
 * Retorna null quando o template:
 *   - não tem header
 *   - tem header TEXT sem variáveis (a Meta usa o texto fixo do template)
 *
 * Para header de mídia (IMAGE/VIDEO/DOCUMENT), a Meta sempre exige o component
 * `header` no envio, mesmo que a URL seja igual à de aprovação.
 *
 * Hoje usamos a URL guardada em `headerContent` (extraída do `header_handle`
 * retornado pela Meta no momento do sync). Se no futuro suportarmos imagem
 * dinâmica por contato, daria pra parametrizar via `imageUrlOverride`.
 */
export function buildTemplateHeaderComponent(
  template: TemplateForHeaderBuild,
  options: { imageUrlOverride?: string; documentFilename?: string } = {},
): { type: 'header'; parameters: any[] } | null {
  const headerType = (template.headerType || '').toUpperCase();
  if (!headerType) return null;

  // Header TEXT sem variáveis não precisa de component no envio.
  // Templates com TEXT contendo {{N}} precisariam de header.parameters com type:text,
  // mas hoje todos os templates da BGP que têm header são TEXT estáticos OU mídia.
  if (headerType === 'TEXT') {
    return null;
  }

  const url = options.imageUrlOverride || template.headerContent;
  if (!url) {
    // Header de mídia configurado mas sem URL guardada — não dá pra montar.
    // Retornar null aqui faz o envio falhar com 132000, sinalizando o gap.
    // Melhor falhar visivelmente do que mandar sem header e ser bloqueado em silêncio.
    return null;
  }

  if (headerType === 'IMAGE') {
    return {
      type: 'header',
      parameters: [{ type: 'image', image: { link: url } }],
    };
  }

  if (headerType === 'VIDEO') {
    return {
      type: 'header',
      parameters: [{ type: 'video', video: { link: url } }],
    };
  }

  if (headerType === 'DOCUMENT') {
    const filename = options.documentFilename || 'documento.pdf';
    return {
      type: 'header',
      parameters: [{ type: 'document', document: { link: url, filename } }],
    };
  }

  return null;
}
