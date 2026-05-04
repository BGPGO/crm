import { Brand } from '@prisma/client';
import prisma from '../lib/prisma';

const VALID_CONTACT_FIELDS = ['name', 'email', 'phone', 'position', 'notes', 'organizationId'];

/**
 * Pre-built mapping suggestion for RD Station CSV exports.
 * Frontend can use as suggestion / default. If POST body sends an empty/missing
 * mapping, the route applies this preset.
 *
 * Special non-Contact fields:
 *  - 'organization.name' → auto-create/find Organization, link via organizationId
 *  - 'source.name'       → auto-create/find Source (no Contact field — kept on Deal model;
 *                           imported but currently NOT persisted on Contact since Contact
 *                           has no sourceId. Stored as a side effect.)
 *  - 'tags'              → split by comma, ensure Tag(brand=X), attach via ContactTag
 *  - 'city' / 'state'    → currently stored as part of `notes` (no dedicated field)
 *
 * Celular wins over Telefone when both columns are mapped to phone.
 */
export const RD_STATION_MAPPING: Record<string, string> = {
  'Email': 'email',
  'Nome': 'name',
  'Celular': 'phone',
  'Telefone': 'phone',
  'Empresa': 'organization.name',
  'Cargo': 'position',
  'Cidade': 'city',
  'Estado': 'state',
  'Origem da primeira conversão': 'source.name',
  'Tags': 'tags',
};

interface ImportOptions {
  brand?: Brand;
  tagIds?: string[];
}

/**
 * Strip a UTF-8/UTF-16 BOM if present at the start of the string.
 */
function stripBOM(s: string): string {
  if (!s) return s;
  const code = s.charCodeAt(0);
  // 0xFEFF = UTF-8/UTF-16 BOM. 0xFFFE = byte-swapped UTF-16. Strip either.
  if (code === 0xfeff || code === 0xfffe) {
    return s.slice(1);
  }
  return s;
}

/**
 * Detect the most likely field separator by counting candidates on the first line.
 */
function detectSeparator(firstLine: string): ',' | '\t' | ';' {
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;

  if (tabs > commas && tabs >= semicolons) return '\t';
  if (semicolons > commas && semicolons > tabs) return ';';
  return ',';
}

/**
 * Parse CSV content into headers and rows.
 * Handles quoted fields (fields with commas inside quotes), strips BOM,
 * and auto-detects separator (comma / tab / semicolon).
 */
export function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const cleaned = stripBOM(content);

  const lines = cleaned
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const sep = detectSeparator(lines[0]);

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === sep) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    fields.push(current.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

/**
 * Map CSV column headers to contact field indices.
 *
 * mapping format: { 'CSV Header': 'contactField' } — same shape RD_STATION_MAPPING uses.
 * Backward compat: also accepts the legacy { contactField: 'CSV Header' } shape.
 *
 * @returns { fieldKey: columnIndex } — supports same field appearing multiple times via priority.
 */
export function mapColumns(
  headers: string[],
  mapping: Record<string, string>
): Record<string, number[]> {
  const indexMap: Record<string, number[]> = {};

  // Detect mapping shape. RD_STATION_MAPPING & frontend pass { 'CSV Header': 'field' }.
  // Legacy shape: { 'field': 'CSV Header' }. We detect by checking if any value equals
  // a known field; if more values look like fields than keys, swap.
  const KNOWN_FIELDS = new Set([
    'email',
    'name',
    'phone',
    'position',
    'notes',
    'organizationId',
    'organization.name',
    'source.name',
    'tags',
    'city',
    'state',
  ]);

  let valuesAreFields = 0;
  let keysAreFields = 0;
  for (const [k, v] of Object.entries(mapping)) {
    if (KNOWN_FIELDS.has(v)) valuesAreFields++;
    if (KNOWN_FIELDS.has(k)) keysAreFields++;
  }

  const csvHeaderIsKey = valuesAreFields >= keysAreFields;

  for (const [k, v] of Object.entries(mapping)) {
    const csvHeader = csvHeaderIsKey ? k : v;
    const fieldKey = csvHeaderIsKey ? v : k;

    const index = headers.findIndex(
      (h) => h.toLowerCase().trim() === csvHeader.toLowerCase().trim()
    );
    if (index !== -1) {
      if (!indexMap[fieldKey]) indexMap[fieldKey] = [];
      indexMap[fieldKey].push(index);
    }
  }

  return indexMap;
}

function pickFirstNonEmpty(row: string[], indices: number[] | undefined): string | undefined {
  if (!indices || indices.length === 0) return undefined;
  for (const idx of indices) {
    const raw = row[idx];
    if (raw !== undefined) {
      const v = raw.trim();
      if (v) return v;
    }
  }
  return undefined;
}

/**
 * Process a contact import: parse CSV, upsert contacts in batches, track errors.
 *
 * @param options.brand   Default Brand for created/updated contacts. Falls back to BGP.
 * @param options.tagIds  Tag IDs to attach to every successfully processed contact (idempotent).
 *
 * Cross-brand collision policy: if a Contact already exists with the same email but a
 * different brand, the row is skipped and recorded as an error (errorRows++).
 */
export async function processImport(
  importId: string,
  content: string,
  mapping: Record<string, string>,
  options?: ImportOptions
): Promise<{ processed: number; errors: number; errorDetails: any[] }> {
  const brand: Brand = options?.brand ?? 'BGP';
  const tagIds = Array.isArray(options?.tagIds) ? options!.tagIds! : [];

  // Update status to PROCESSING
  await prisma.contactImport.update({
    where: { id: importId },
    data: { status: 'PROCESSING' },
  });

  const { headers, rows } = parseCSV(content);
  const columnMap = mapColumns(headers, mapping);

  let processed = 0;
  let errors = 0;
  const errorDetails: any[] = [];

  const BATCH_SIZE = 100;

  // Cache organizations + sources within this run to avoid duplicate findFirst per row.
  const orgCache = new Map<string, string>(); // name → id
  const sourceCache = new Map<string, string>(); // name → id
  const tagCache = new Map<string, string>(); // `${brand}:${name}` → tagId

  const ensureOrganization = async (name: string): Promise<string | undefined> => {
    const key = name.trim();
    if (!key) return undefined;
    if (orgCache.has(key)) return orgCache.get(key);
    const existing = await prisma.organization.findFirst({ where: { name: key } });
    if (existing) {
      orgCache.set(key, existing.id);
      return existing.id;
    }
    const created = await prisma.organization.create({ data: { name: key } });
    orgCache.set(key, created.id);
    return created.id;
  };

  const ensureSource = async (name: string): Promise<string | undefined> => {
    const key = name.trim();
    if (!key) return undefined;
    if (sourceCache.has(key)) return sourceCache.get(key);
    const existing = await prisma.source.findUnique({ where: { name: key } });
    if (existing) {
      sourceCache.set(key, existing.id);
      return existing.id;
    }
    const created = await prisma.source.create({ data: { name: key } });
    sourceCache.set(key, created.id);
    return created.id;
  };

  const ensureTagByName = async (name: string, b: Brand): Promise<string | undefined> => {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const cacheKey = `${b}:${trimmed}`;
    if (tagCache.has(cacheKey)) return tagCache.get(cacheKey);
    let tag = await prisma.tag.findFirst({ where: { name: trimmed, brand: b } });
    if (!tag) {
      // Tag.name has @unique, so re-query without brand if a same-name tag exists.
      const sameName = await prisma.tag.findUnique({ where: { name: trimmed } });
      if (sameName) {
        tagCache.set(cacheKey, sameName.id);
        return sameName.id;
      }
      tag = await prisma.tag.create({ data: { name: trimmed, brand: b } });
    }
    tagCache.set(cacheKey, tag.id);
    return tag.id;
  };

  const attachTags = async (contactId: string, ids: string[]) => {
    for (const tagId of ids) {
      try {
        await prisma.contactTag.create({ data: { contactId, tagId } });
      } catch (e: any) {
        // P2002 unique violation on (contactId, tagId) → already attached, skip silently.
        if (e?.code !== 'P2002') throw e;
      }
    }
  };

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const rowIndex = batchStart + i + 2; // +2 because row 1 is headers, and we're 1-indexed

      try {
        // Direct Contact fields
        const data: Record<string, any> = {};
        for (const field of VALID_CONTACT_FIELDS) {
          const v = pickFirstNonEmpty(row, columnMap[field]);
          if (v !== undefined) data[field] = v;
        }

        // Phone special handling: 'Celular' col was listed before 'Telefone' in
        // RD_STATION_MAPPING, so its index appears first in columnMap.phone — pickFirstNonEmpty
        // already returns the first non-empty in declared order, which is correct.

        // Auto Organization
        const orgName = pickFirstNonEmpty(row, columnMap['organization.name']);
        if (orgName) {
          const orgId = await ensureOrganization(orgName);
          if (orgId) data.organizationId = orgId;
        }

        // Auto Source — currently no Contact.sourceId column exists, so we ensure the
        // Source row exists (so it's available for downstream Deal creation) but do not
        // attach to Contact directly.
        const sourceName = pickFirstNonEmpty(row, columnMap['source.name']);
        if (sourceName) {
          await ensureSource(sourceName);
        }

        // city / state → fold into notes
        const city = pickFirstNonEmpty(row, columnMap['city']);
        const state = pickFirstNonEmpty(row, columnMap['state']);
        const locationParts = [city, state].filter(Boolean) as string[];
        if (locationParts.length > 0) {
          const loc = `Localização: ${locationParts.join('/')}`;
          data.notes = data.notes ? `${data.notes}\n${loc}` : loc;
        }

        if (!data.name) {
          throw new Error('Campo "name" é obrigatório');
        }

        // Resolve tag IDs from row's "tags" column (split by comma).
        const rawTags = pickFirstNonEmpty(row, columnMap['tags']);
        const rowTagIds: string[] = [];
        if (rawTags) {
          const names = rawTags.split(',').map((t) => t.trim()).filter(Boolean);
          for (const tn of names) {
            const tid = await ensureTagByName(tn, brand);
            if (tid) rowTagIds.push(tid);
          }
        }
        const allTagIds = Array.from(new Set([...tagIds, ...rowTagIds]));

        let contactId: string | null = null;

        if (data.email) {
          const existing = await prisma.contact.findFirst({
            where: { email: data.email },
          });
          if (existing) {
            // Cross-brand collision → skip + warn.
            if (existing.brand !== brand) {
              errors++;
              errorDetails.push({
                row: rowIndex,
                email: data.email,
                reason: `Email já existe como brand ${existing.brand}, pulado`,
              });
              continue;
            }
            const updated = await prisma.contact.update({
              where: { id: existing.id },
              data,
            });
            contactId = updated.id;
          } else {
            const created = await prisma.contact.create({
              data: { ...data, brand } as any,
            });
            contactId = created.id;
          }
        } else {
          const created = await prisma.contact.create({
            data: { ...data, brand } as any,
          });
          contactId = created.id;
        }

        if (contactId && allTagIds.length > 0) {
          await attachTags(contactId, allTagIds);
        }

        processed++;
      } catch (err: any) {
        errors++;
        errorDetails.push({
          row: rowIndex,
          error: err.message || 'Erro desconhecido',
        });
      }
    }

    // Update progress
    await prisma.contactImport.update({
      where: { id: importId },
      data: {
        processedRows: processed,
        errorRows: errors,
      },
    });
  }

  // Determine final status
  const finalStatus = rows.length > 0 && processed === 0 ? 'FAILED' : 'COMPLETED';

  // Update final record
  await prisma.contactImport.update({
    where: { id: importId },
    data: {
      status: finalStatus,
      processedRows: processed,
      errorRows: errors,
      errors: errorDetails.length > 0 ? errorDetails : undefined,
    },
  });

  return { processed, errors, errorDetails };
}
