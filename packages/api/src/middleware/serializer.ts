import { Request, Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';

// ─── DateTime fields (all DateTime? optional columns in the schema) ──────────
// Empty strings "" from the frontend must become null before hitting Prisma.
const DATETIME_FIELDS = new Set([
  'dueDate',
  'expectedCloseDate',
  'closedAt',
  'completedAt',
  'birthday',
  'startDate',
  'endDate',
]);

// ─── Response serializer ─────────────────────────────────────────────────────
// Monkey-patches res.json to transform outgoing data before JSON.stringify.
// Converts Prisma Decimal objects → plain numbers so the frontend never sees
// strings or raw Decimal.js objects.

function isDecimal(val: unknown): val is Decimal {
  return val instanceof Decimal;
}

function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;

  // Prisma Decimal → number
  if (isDecimal(val)) {
    return val.toNumber();
  }

  // Recurse arrays
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }

  // Date objects stay as-is (JSON.stringify handles them)
  if (val instanceof Date) return val;

  // Recurse plain objects
  if (typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      result[key] = serializeValue(v);
    }
    return result;
  }

  return val;
}

export function responseSerializer() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      return originalJson(serializeValue(body));
    };

    next();
  };
}

// ─── Input sanitizer ─────────────────────────────────────────────────────────
// Cleans req.body before it reaches Prisma:
// - Empty string DateTime fields → removed (Prisma uses column default/null)

// Matches date-only strings like "2026-03-15" (no time component)
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeBody(body: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(body)) {
    if (!DATETIME_FIELDS.has(key)) continue;
    if (val === '') {
      delete body[key];
    } else if (typeof val === 'string' && DATE_ONLY_RE.test(val)) {
      // Convert date-only to full ISO-8601 DateTime for Prisma
      body[key] = new Date(val + 'T00:00:00.000Z');
    }
  }
}

export function inputSanitizer() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      sanitizeBody(req.body as Record<string, unknown>);
    }
    next();
  };
}
