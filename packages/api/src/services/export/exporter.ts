import { Request, Response } from 'express';
import ExcelJS from 'exceljs';

export type ExportFormat = 'csv' | 'xlsx';

export interface ExportColumn {
  key: string;
  label: string;
}

export function inferFormat(req: Request): ExportFormat {
  const fmt = String(req.query.format || '').toLowerCase();
  return fmt === 'xlsx' ? 'xlsx' : 'csv';
}

export function buildFilename(base: string, format: ExportFormat): string {
  const now = new Date();
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const sanitized = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return `${sanitized}_${iso}.${format}`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  // RFC4180: quote if contains comma, quote, newline or carriage return
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(row: Record<string, unknown>, columns: ExportColumn[]): string {
  return columns.map((c) => escapeCsvField(row[c.key])).join(',') + '\r\n';
}

/**
 * Stream rows as CSV to the response. Writes UTF-8 BOM for Excel compatibility.
 */
export async function streamCsv(
  res: Response,
  rows: AsyncIterable<Record<string, unknown>>,
  columns: ExportColumn[],
  filename: string
): Promise<void> {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // UTF-8 BOM so Excel renders accents correctly
  res.write('﻿');
  // Header
  res.write(columns.map((c) => escapeCsvField(c.label)).join(',') + '\r\n');

  for await (const row of rows) {
    res.write(rowToCsv(row, columns));
  }

  res.end();
}

// ── XLSX ─────────────────────────────────────────────────────────────────────

/**
 * Stream rows as XLSX to the response using exceljs streaming writer.
 */
export async function streamXlsx(
  res: Response,
  rows: AsyncIterable<Record<string, unknown>>,
  columns: ExportColumn[],
  filename: string,
  sheetName = 'Export'
): Promise<void> {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: false,
    useSharedStrings: false,
  });

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.min(40, Math.max(12, c.label.length + 4)),
  }));

  for await (const row of rows) {
    const cleaned: Record<string, unknown> = {};
    for (const col of columns) {
      const val = row[col.key];
      if (val instanceof Date) {
        cleaned[col.key] = val;
      } else if (val === null || val === undefined) {
        cleaned[col.key] = '';
      } else if (typeof val === 'object') {
        cleaned[col.key] = JSON.stringify(val);
      } else {
        cleaned[col.key] = val;
      }
    }
    sheet.addRow(cleaned).commit();
  }

  await sheet.commit();
  await workbook.commit();
}

// ── Batch iteration helper ───────────────────────────────────────────────────

/**
 * Generic Prisma cursor-style batched iterator.
 *
 * Pass a function that returns rows given a `skip`, plus a batch size.
 * Stops when fewer than `batchSize` rows are returned.
 */
export async function* batchIterate<T>(
  fetchBatch: (skip: number, take: number) => Promise<T[]>,
  batchSize = 500
): AsyncGenerator<T, void, unknown> {
  let skip = 0;
  while (true) {
    const batch = await fetchBatch(skip, batchSize);
    for (const row of batch) {
      yield row;
    }
    if (batch.length < batchSize) break;
    skip += batch.length;
  }
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function exportRows(
  req: Request,
  res: Response,
  options: {
    filenameBase: string;
    columns: ExportColumn[];
    rows: AsyncIterable<Record<string, unknown>>;
    sheetName?: string;
  }
): Promise<void> {
  const format = inferFormat(req);
  const filename = buildFilename(options.filenameBase, format);

  if (format === 'xlsx') {
    await streamXlsx(res, options.rows, options.columns, filename, options.sheetName);
  } else {
    await streamCsv(res, options.rows, options.columns, filename);
  }
}
