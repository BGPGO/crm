import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/email-templates
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === 'true';
    }

    const [total, data] = await Promise.all([
      prisma.emailTemplate.count({ where }),
      prisma.emailTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { campaigns: true } },
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

// GET /api/email-templates/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.emailTemplate.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { campaigns: true } },
      },
    });

    if (!template) return next(createError('Email template not found', 404));

    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// POST /api/email-templates
router.post(
  '/',
  validate({ name: 'required', subject: 'required', htmlContent: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, subject, htmlContent, jsonContent, thumbnailUrl, isActive } = req.body;

      const template = await prisma.emailTemplate.create({
        data: { name, subject, htmlContent, jsonContent, thumbnailUrl, isActive },
      });

      res.status(201).json({ data: template });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/email-templates/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Email template not found', 404));

    const { name, subject, htmlContent, jsonContent, thumbnailUrl, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (subject !== undefined) data.subject = subject;
    if (htmlContent !== undefined) data.htmlContent = htmlContent;
    if (jsonContent !== undefined) data.jsonContent = jsonContent;
    if (thumbnailUrl !== undefined) data.thumbnailUrl = thumbnailUrl;
    if (isActive !== undefined) data.isActive = isActive;

    const template = await prisma.emailTemplate.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/email-templates/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Email template not found', 404));

    await prisma.emailTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/email-templates/:id/duplicate
router.post('/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const original = await prisma.emailTemplate.findUnique({ where: { id: req.params.id } });
    if (!original) return next(createError('Email template not found', 404));

    const duplicate = await prisma.emailTemplate.create({
      data: {
        name: `${original.name} (cópia)`,
        subject: original.subject,
        htmlContent: original.htmlContent,
        jsonContent: original.jsonContent ?? undefined,
        thumbnailUrl: original.thumbnailUrl,
        isActive: original.isActive,
      },
    });

    res.status(201).json({ data: duplicate });
  } catch (err) {
    next(err);
  }
});

export default router;
