import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

async function getOrCreateConfig() {
  let config = await prisma.whatsAppConfig.findFirst();
  if (!config) config = await prisma.whatsAppConfig.create({ data: {} });
  return config;
}

// GET /api/whatsapp/bot-objections
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOrCreateConfig();
    const objections = await prisma.botObjection.findMany({
      where: { configId: config.id },
      orderBy: { order: 'asc' },
    });
    res.json({ data: objections });
  } catch (err) { next(err); }
});

// POST /api/whatsapp/bot-objections
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { objection, response } = req.body;
    if (!objection?.trim()) return next(createError('objection é obrigatório', 422));
    if (!response?.trim()) return next(createError('response é obrigatório', 422));

    const config = await getOrCreateConfig();
    const count = await prisma.botObjection.count({ where: { configId: config.id } });

    const created = await prisma.botObjection.create({
      data: {
        configId: config.id,
        objection: objection.trim(),
        response: response.trim(),
        order: count,
      },
    });
    res.status(201).json({ data: created });
  } catch (err) { next(err); }
});

// PUT /api/whatsapp/bot-objections/reorder
router.put('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids)) return next(createError('ids must be an array', 422));

    await prisma.$transaction(
      ids.map((id, index) => prisma.botObjection.update({ where: { id }, data: { order: index } }))
    );
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// PUT /api/whatsapp/bot-objections/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { objection, response, order } = req.body;

    const existing = await prisma.botObjection.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Objeção não encontrada', 404));

    const updated = await prisma.botObjection.update({
      where: { id: req.params.id },
      data: {
        ...(objection !== undefined && { objection: objection.trim() }),
        ...(response !== undefined && { response: response.trim() }),
        ...(order !== undefined && { order }),
      },
    });
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/whatsapp/bot-objections/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.botObjection.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Objeção não encontrada', 404));
    await prisma.botObjection.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
