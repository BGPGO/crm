import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/contract-witnesses — List all witnesses
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await prisma.contractWitness.findMany({ orderBy: { name: 'asc' } });
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /api/contract-witnesses — Create witness
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, cpf, email } = req.body;
    if (!name || !cpf || !email) return next(createError('name, cpf, and email are required', 400));

    const witness = await prisma.contractWitness.create({ data: { name, cpf, email } });
    res.status(201).json({ data: witness });
  } catch (err) {
    next(err);
  }
});

// PUT /api/contract-witnesses/:id — Update witness
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contractWitness.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Witness not found', 404));

    const { name, cpf, email } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (cpf !== undefined) data.cpf = cpf;
    if (email !== undefined) data.email = email;

    const witness = await prisma.contractWitness.update({ where: { id: req.params.id }, data });
    res.json({ data: witness });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/contract-witnesses/:id — Delete witness
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.contractWitness.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Witness not found', 404));

    await prisma.contractWitness.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
