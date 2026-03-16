import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { onTagAdded, onTagRemoved } from '../services/automationTriggerListener';

const router = Router();

// GET /api/tags
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [total, tags] = await Promise.all([
      prisma.tag.count(),
      prisma.tag.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { contacts: true } },
        },
      }),
    ]);

    res.json({
      data: tags,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tags/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tag = await prisma.tag.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { contacts: true } },
      },
    });

    if (!tag) return next(createError('Tag not found', 404));

    res.json({ data: tag });
  } catch (err) {
    next(err);
  }
});

// POST /api/tags
router.post(
  '/',
  validate({ name: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tag = await prisma.tag.create({ data: req.body });
      res.status(201).json({ data: tag });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/tags/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Tag not found', 404));

    const { name, color } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;

    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ data: tag });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tags/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Tag not found', 404));

    await prisma.tag.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/tags/bulk-assign
router.post(
  '/bulk-assign',
  validate({ tagIds: 'required', contactIds: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tagIds, contactIds } = req.body as { tagIds: string[]; contactIds: string[] };

      const data = tagIds.flatMap((tagId: string) =>
        contactIds.map((contactId: string) => ({ tagId, contactId }))
      );

      let result;
      try {
        result = await prisma.contactTag.createMany({
          data,
          skipDuplicates: true,
        });
      } catch (err: any) {
        if (err?.code === 'P2003') {
          return next(createError('Um ou mais IDs de contato ou tag não existem', 422));
        }
        throw err;
      }

      // Fire automation triggers
      for (const contactId of contactIds) {
        for (const tagId of tagIds) {
          onTagAdded(contactId, tagId);
        }
      }

      res.status(201).json({ data: { count: result.count } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tags/bulk-remove
router.post(
  '/bulk-remove',
  validate({ tagIds: 'required', contactIds: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tagIds, contactIds } = req.body as { tagIds: string[]; contactIds: string[] };

      const result = await prisma.contactTag.deleteMany({
        where: {
          AND: [
            { tagId: { in: tagIds } },
            { contactId: { in: contactIds } },
          ],
        },
      });

      // Fire automation triggers
      for (const contactId of contactIds) {
        for (const tagId of tagIds) {
          onTagRemoved(contactId, tagId);
        }
      }

      res.json({ data: { count: result.count } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
