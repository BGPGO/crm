import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/whatsapp/message-templates — List all templates
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, search } = req.query;
    const where: Record<string, unknown> = {};

    if (category) where.category = category as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const data = await prisma.whatsAppMessageTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp/message-templates/:id — Single template
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.whatsAppMessageTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!template) return next(createError('Template not found', 404));
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp/message-templates — Create template
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, content, category } = req.body;
    if (!name || !content) return next(createError('name and content are required', 400));

    const existing = await prisma.whatsAppMessageTemplate.findUnique({ where: { name } });
    if (existing) return next(createError('Template with this name already exists', 409));

    const template = await prisma.whatsAppMessageTemplate.create({
      data: { name, content, category: category || 'geral' },
    });

    res.status(201).json({ data: template });
  } catch (err) {
    next(err);
  }
});

// PUT /api/whatsapp/message-templates/:id — Update template
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppMessageTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Template not found', 404));

    const { name, content, category } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (content !== undefined) data.content = content;
    if (category !== undefined) data.category = category;

    if (name && name !== existing.name) {
      const dup = await prisma.whatsAppMessageTemplate.findUnique({ where: { name } });
      if (dup) return next(createError('Template with this name already exists', 409));
    }

    const template = await prisma.whatsAppMessageTemplate.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/whatsapp/message-templates/:id — Delete template
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppMessageTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Template not found', 404));

    await prisma.whatsAppMessageTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
