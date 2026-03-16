import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { onContactCreated } from '../services/automationTriggerListener';

const router = Router();

// GET /api/contacts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { search, organizationId, tagId, engagementLevel } = req.query;

    const where: Record<string, unknown> = {};

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
      const contact = await prisma.contact.create({
        data: req.body,
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

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: req.body,
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
