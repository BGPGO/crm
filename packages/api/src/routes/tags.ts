import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { onTagAdded, onTagRemoved } from '../services/automationTriggerListener';

const router = Router();

// GET /api/tags
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { contacts: true } },
      },
    });

    res.json({ data: tags });
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

    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data: req.body,
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

      const result = await prisma.contactTag.createMany({
        data,
        skipDuplicates: true,
      });

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
