import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { exportRows, batchIterate, ExportColumn } from '../services/export/exporter';

const router = Router();

function buildOrgsWhere(req: Request): Record<string, unknown> {
  const { search, segment } = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = {};
  if (search) where.name = { contains: search, mode: 'insensitive' };
  if (segment) where.segment = segment;

  const brandClauses: Array<Record<string, unknown>> = [
    { contacts: { some: { brand: req.brand } } },
    { deals: { some: { brand: req.brand } } },
  ];
  if (req.brand === 'BGP') {
    brandClauses.push({ AND: [{ contacts: { none: {} } }, { deals: { none: {} } }] });
  }
  where.OR = brandClauses;
  return where;
}

const ORG_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Nome' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'segment', label: 'Segmento' },
  { key: 'website', label: 'Site' },
  { key: 'phone', label: 'Telefone' },
  { key: 'address', label: 'Endereço' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'email', label: 'Email' },
  { key: 'contactsCount', label: 'Qtd Contatos' },
  { key: 'dealsCount', label: 'Qtd Negociações' },
  { key: 'createdAt', label: 'Criado em' },
];

// GET /api/organizations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, segment } = req.query;

    const where: Record<string, unknown> = {};

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    if (segment) {
      where.segment = segment as string;
    }

    // Organization has no brand field — filter via contacts.some/deals.some.
    // Orgs without any contacts/deals (manual) only show for BGP (legacy default).
    const brandClauses: Array<Record<string, unknown>> = [
      { contacts: { some: { brand: req.brand } } },
      { deals: { some: { brand: req.brand } } },
    ];
    if (req.brand === 'BGP') {
      brandClauses.push({ AND: [{ contacts: { none: {} } }, { deals: { none: {} } }] });
    }
    where.OR = brandClauses;

    const [total, data] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { contacts: true, deals: true } },
        },
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

// GET /api/organizations/export
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where = buildOrgsWhere(req);
    const rows = (async function* () {
      for await (const org of batchIterate<any>(async (skip, take) => {
        return prisma.organization.findMany({
          where,
          skip,
          take,
          orderBy: { name: 'asc' },
          include: { _count: { select: { contacts: true, deals: true } } },
        });
      }, 500)) {
        yield {
          id: org.id,
          name: org.name ?? '',
          cnpj: org.cnpj ?? '',
          segment: org.segment ?? '',
          website: org.website ?? '',
          phone: org.phone ?? '',
          address: org.address ?? '',
          instagram: org.instagram ?? '',
          email: org.email ?? '',
          contactsCount: org._count?.contacts ?? 0,
          dealsCount: org._count?.deals ?? 0,
          createdAt: org.createdAt,
        };
      }
    })();

    await exportRows(req, res, {
      filenameBase: 'empresas',
      columns: ORG_EXPORT_COLUMNS,
      rows,
      sheetName: 'Empresas',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/organizations/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: { orderBy: { name: 'asc' } },
        deals: {
          include: { stage: true, pipeline: true, user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!organization) {
      return next(createError('Organization not found', 404));
    }

    res.json({ data: organization });
  } catch (err) {
    next(err);
  }
});

// POST /api/organizations
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organization = await prisma.organization.create({
        data: req.body,
      });
      res.status(201).json({ data: organization });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/organizations/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Organization not found', 404));

    const organization = await prisma.organization.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ data: organization });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/organizations/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Organization not found', 404));

    await prisma.organization.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
