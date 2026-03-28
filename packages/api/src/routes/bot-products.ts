import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

async function getOrCreateConfig() {
  let config = await prisma.whatsAppConfig.findFirst();
  if (!config) config = await prisma.whatsAppConfig.create({ data: {} });
  return config;
}

// GET /api/whatsapp/bot-products
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOrCreateConfig();
    const products = await prisma.botProduct.findMany({
      where: { configId: config.id },
      orderBy: { order: 'asc' },
    });
    res.json({ data: products });
  } catch (err) { next(err); }
});

// POST /api/whatsapp/bot-products
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, priceRange, targetAudience, differentials, isActive } = req.body;
    if (!name?.trim()) return next(createError('name é obrigatório', 422));

    const config = await getOrCreateConfig();
    const count = await prisma.botProduct.count({ where: { configId: config.id } });

    const product = await prisma.botProduct.create({
      data: {
        configId: config.id,
        name: name.trim(),
        description: description?.trim() || null,
        priceRange: priceRange?.trim() || null,
        targetAudience: targetAudience?.trim() || null,
        differentials: differentials?.trim() || null,
        isActive: isActive !== false,
        order: count,
      },
    });
    res.status(201).json({ data: product });
  } catch (err) { next(err); }
});

// PUT /api/whatsapp/bot-products/reorder — update order of all products
router.put('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids)) return next(createError('ids must be an array', 422));

    await prisma.$transaction(
      ids.map((id, index) => prisma.botProduct.update({ where: { id }, data: { order: index } }))
    );
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// PUT /api/whatsapp/bot-products/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, priceRange, targetAudience, differentials, isActive, order } = req.body;
    if (name !== undefined && !name?.trim()) return next(createError('name não pode ser vazio', 422));

    const existing = await prisma.botProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Produto não encontrado', 404));

    const updated = await prisma.botProduct.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(priceRange !== undefined && { priceRange: priceRange?.trim() || null }),
        ...(targetAudience !== undefined && { targetAudience: targetAudience?.trim() || null }),
        ...(differentials !== undefined && { differentials: differentials?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        ...(order !== undefined && { order }),
      },
    });
    res.json({ data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/whatsapp/bot-products/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.botProduct.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Produto não encontrado', 404));
    await prisma.botProduct.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
