import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { onContactCreated } from '../services/automationTriggerListener';
import { isValidEmail } from './email-tracking';
import { normalizePhone } from '../utils/phoneNormalize';
import { exportRows, batchIterate, ExportColumn } from '../services/export/exporter';

const router = Router();

// ── Helpers shared with /export ─────────────────────────────────────────────

function buildContactsWhere(req: Request): Record<string, unknown> {
  const { search, organizationId, tagId, engagementLevel } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = { brand: req.brand };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (organizationId) where.organizationId = organizationId;
  if (tagId) where.tags = { some: { tagId } };
  if (engagementLevel && ['ENGAGED', 'INTERMEDIATE', 'DISENGAGED'].includes(engagementLevel)) {
    where.leadScore = { engagementLevel };
  }
  return where;
}

export const CONTACT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'position', label: 'Cargo' },
  { key: 'birthday', label: 'Aniversário' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'sector', label: 'Setor' },
  { key: 'organization', label: 'Empresa' },
  { key: 'tags', label: 'Tags' },
  { key: 'leadScore', label: 'Lead Score' },
  { key: 'engagementLevel', label: 'Engajamento' },
  { key: 'createdAt', label: 'Criado em' },
  { key: 'updatedAt', label: 'Atualizado em' },
];

interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  birthday: Date | null;
  instagram: string | null;
  sector: string | null;
  organization: { name: string | null } | null;
  tags: Array<{ tag: { name: string | null } }>;
  leadScore: { score: number | null; engagementLevel: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeContactRow(c: ContactRow): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    position: c.position ?? '',
    birthday: c.birthday ? new Date(c.birthday).toISOString().slice(0, 10) : '',
    instagram: c.instagram ?? '',
    sector: c.sector ?? '',
    organization: c.organization?.name ?? '',
    tags: (c.tags || []).map((t) => t.tag?.name).filter(Boolean).join('; '),
    leadScore: c.leadScore?.score ?? '',
    engagementLevel: c.leadScore?.engagementLevel ?? '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// GET /api/contacts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, organizationId, tagId, engagementLevel } = req.query;

    const where: Record<string, unknown> = { brand: req.brand };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (organizationId) {
      where.organizationId = organizationId as string;
    }

    if (tagId) {
      where.tags = { some: { tagId: tagId as string } };
    }

    const validLevels = ['ENGAGED', 'INTERMEDIATE', 'DISENGAGED'];
    if (engagementLevel && !validLevels.includes(engagementLevel as string)) {
      return next(createError('engagementLevel inválido. Use: ENGAGED, INTERMEDIATE ou DISENGAGED', 400));
    }

    if (engagementLevel) {
      where.leadScore = { engagementLevel: engagementLevel as string };
    }

    const [total, data] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, name: true } },
          tags: { include: { tag: true } },
          leadScore: true,
          deals: {
            select: { id: true, status: true, stage: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
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

// GET /api/contacts/export — exporta contatos em CSV ou XLSX
router.get('/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { engagementLevel } = req.query as Record<string, string | undefined>;
    if (engagementLevel && !['ENGAGED', 'INTERMEDIATE', 'DISENGAGED'].includes(engagementLevel)) {
      return next(createError('engagementLevel inválido', 400));
    }
    const where = buildContactsWhere(req);

    const rows = (async function* () {
      for await (const contact of batchIterate<ContactRow>(async (skip, take) => {
        const batch = await prisma.contact.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            organization: { select: { name: true } },
            tags: { include: { tag: { select: { name: true } } } },
            leadScore: { select: { score: true, engagementLevel: true } },
          },
        });
        return batch as unknown as ContactRow[];
      }, 500)) {
        yield serializeContactRow(contact);
      }
    })();

    await exportRows(req, res, {
      filenameBase: 'contatos',
      columns: CONTACT_EXPORT_COLUMNS,
      rows,
      sheetName: 'Contatos',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: {
        organization: true,
        deals: {
          include: { stage: true, pipeline: true },
          orderBy: { createdAt: 'desc' },
        },
        tasks: { orderBy: { dueDate: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' } },
        customFieldValues: { include: { customField: true } },
        tags: { include: { tag: true } },
        leadScore: true,
      },
    });

    if (!contact) {
      return next(createError('Contact not found', 404));
    }

    res.json({ data: contact });
  } catch (err) {
    next(err);
  }
});

// POST /api/contacts
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, phone, position, birthday, instagram, notes, organizationId } = req.body;

      if (email && !isValidEmail(email)) {
        return next(createError('Email inválido', 400));
      }

      const normalizedPhone = phone ? normalizePhone(phone) : undefined;

      const contact = await prisma.contact.create({
        data: { name, email, phone: normalizedPhone, position, birthday, instagram, notes, organizationId },
        include: {
          organization: { select: { id: true, name: true } },
        },
      });
      onContactCreated(contact.id);
      res.status(201).json({ data: contact });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/contacts/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Contact not found', 404));

    if (req.body.email && !isValidEmail(req.body.email)) {
      return next(createError('Email inválido', 400));
    }

    const { name, email, phone, position, birthday, instagram, notes, organizationId, sector, gender, erpSystem, revenueRange } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (position !== undefined) data.position = position;
    if (birthday !== undefined) data.birthday = birthday;
    if (instagram !== undefined) data.instagram = instagram;
    if (notes !== undefined) data.notes = notes;
    if (organizationId !== undefined) data.organizationId = organizationId;
    if (sector !== undefined) data.sector = sector;

    // Atributos de segmentação: edição manual marca source='manual' na
    // proveniência — a IA nunca sobrescreve valor manual.
    const attributeEdits: Record<string, unknown> = {};
    if (gender !== undefined) attributeEdits.gender = gender || null;
    if (erpSystem !== undefined) attributeEdits.erpSystem = erpSystem || null;
    if (revenueRange !== undefined) attributeEdits.revenueRange = revenueRange || null;
    if (Object.keys(attributeEdits).length > 0) {
      const meta = (existing.attributesMeta as Record<string, unknown>) ?? {};
      for (const field of Object.keys(attributeEdits)) {
        meta[field] = { source: 'manual', at: new Date().toISOString() };
      }
      Object.assign(data, attributeEdits);
      data.attributesMeta = meta;
    }

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data,
      include: {
        organization: { select: { id: true, name: true } },
      },
    });
    res.json({ data: contact });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Contact not found', 404));

    await prisma.contact.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
