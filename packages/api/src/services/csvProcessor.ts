import prisma from '../lib/prisma';

const VALID_CONTACT_FIELDS = ['name', 'email', 'phone', 'position', 'notes', 'organizationId'];

/**
 * Parse CSV content into headers and rows.
 * Handles quoted fields (fields with commas inside quotes).
 */
export function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          // Check for escaped quote ("")
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
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
 * @param headers - CSV column headers
 * @param mapping - { contactField: "CSV Column Header" }
 * @returns { contactField: columnIndex }
 */
export function mapColumns(
  headers: string[],
  mapping: Record<string, string>
): Record<string, number> {
  const indexMap: Record<string, number> = {};

  for (const [field, csvHeader] of Object.entries(mapping)) {
    const index = headers.findIndex(
      (h) => h.toLowerCase().trim() === csvHeader.toLowerCase().trim()
    );
    if (index !== -1) {
      indexMap[field] = index;
    }
  }

  return indexMap;
}

/**
 * Process a contact import: parse CSV, upsert contacts in batches, track errors.
 */
export async function processImport(
  importId: string,
  content: string,
  mapping: Record<string, string>
): Promise<{ processed: number; errors: number; errorDetails: any[] }> {
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

  for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const rowIndex = batchStart + i + 2; // +2 because row 1 is headers, and we're 1-indexed

      try {
        // Extract fields based on mapping
        const data: Record<string, string> = {};
        for (const [field, colIndex] of Object.entries(columnMap)) {
          if (VALID_CONTACT_FIELDS.includes(field) && row[colIndex] !== undefined) {
            const value = row[colIndex].trim();
            if (value) {
              data[field] = value;
            }
          }
        }

        // Validate required fields (at least name)
        if (!data.name) {
          throw new Error('Campo "name" é obrigatório');
        }

        // Find by email if it exists, then update or create
        if (data.email) {
          const existing = await prisma.contact.findFirst({
            where: { email: data.email },
          });
          if (existing) {
            await prisma.contact.update({
              where: { id: existing.id },
              data,
            });
          } else {
            await prisma.contact.create({
              data: data as any,
            });
          }
        } else {
          await prisma.contact.create({
            data: data as any,
          });
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
