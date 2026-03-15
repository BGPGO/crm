import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { parseCSV, processImport } from '../services/csvProcessor';

const router = Router();

// POST /api/contact-imports — Start an import
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileName, csvContent, mapping } = req.body;

    if (!fileName || !csvContent || !mapping) {
      return next(createError('fileName, csvContent e mapping são obrigatórios', 400));
    }

    const userId = (req as any).user?.id || 'system';

    // Count rows from CSV (excluding header)
    const { rows } = parseCSV(csvContent);
    const totalRows = rows.length;

    if (totalRows === 0) {
      return next(createError('O CSV não contém linhas de dados', 400));
    }

    // Create import record
    const contactImport = await prisma.contactImport.create({
      data: {
        fileName,
        status: 'PENDING',
        totalRows,
        userId,
      },
    });

    // Process the import
    await processImport(contactImport.id, csvContent, mapping);

    // Fetch updated record
    const updated = await prisma.contactImport.findUnique({
      where: { id: contactImport.id },
    });

    res.status(201).json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/contact-imports — List import history
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.contactImport.count(),
      prisma.contactImport.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contact-imports/contacts/export — Export contacts as CSV
router.get('/contacts/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await prisma.contact.findMany({
      include: {
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build CSV
    const headers = ['Name', 'Email', 'Phone', 'Position', 'Organization', 'Created At'];
    const csvRows = [headers.join(',')];

    for (const contact of contacts) {
      const row = [
        escapeCSVField(contact.name || ''),
        escapeCSVField(contact.email || ''),
        escapeCSVField(contact.phone || ''),
        escapeCSVField(contact.position || ''),
        escapeCSVField(contact.organization?.name || ''),
        escapeCSVField(contact.createdAt.toISOString()),
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = csvRows.join('\n');
    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-export-${date}.csv"`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});

/**
 * Escape a field for CSV output — wrap in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default router;
