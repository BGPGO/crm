import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();

// GET /api/campaign-contexts
// Lists all CampaignContexts with campaign name, plus campaigns without context
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [contexts, allCampaigns] = await Promise.all([
      prisma.campaignContext.findMany({
        include: { campaign: { select: { id: true, name: true, description: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.campaign.findMany({
        select: { id: true, name: true, description: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const contextMap = new Set(contexts.map((c) => c.campaignId));
    const campaignsWithoutContext = allCampaigns.filter((c) => !contextMap.has(c.id));

    res.json({
      data: {
        contexts,
        campaignsWithoutContext,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/campaign-contexts/default
// Returns the default context (isDefault=true) or null
router.get('/default', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const defaultContext = await prisma.campaignContext.findFirst({
      where: { isDefault: true },
      include: { campaign: { select: { id: true, name: true } } },
    });

    res.json({ data: defaultContext });
  } catch (err) {
    next(err);
  }
});

// GET /api/campaign-contexts/:campaignId
// Returns context for a specific campaign
router.get('/:campaignId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await prisma.campaignContext.findUnique({
      where: { campaignId: req.params.campaignId },
      include: { campaign: { select: { id: true, name: true, description: true } } },
    });

    if (!context) return next(createError('Campaign context not found', 404));

    res.json({ data: context });
  } catch (err) {
    next(err);
  }
});

// PUT /api/campaign-contexts/:campaignId
// Upsert context for a campaign
router.put('/:campaignId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { campaignId } = req.params;
    const { context, isDefault } = req.body;

    if (!context || typeof context !== 'string' || !context.trim()) {
      return next(createError('Context text is required', 400));
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return next(createError('Campaign not found', 404));

    // If setting as default, unset any existing default
    if (isDefault) {
      await prisma.campaignContext.updateMany({
        where: { isDefault: true, campaignId: { not: campaignId } },
        data: { isDefault: false },
      });
    }

    const result = await prisma.campaignContext.upsert({
      where: { campaignId },
      create: {
        campaignId,
        context: context.trim(),
        isDefault: isDefault ?? false,
      },
      update: {
        context: context.trim(),
        isDefault: isDefault ?? false,
      },
      include: { campaign: { select: { id: true, name: true } } },
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/campaign-contexts/:campaignId
// Remove context from a campaign
router.delete('/:campaignId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.campaignContext.findUnique({
      where: { campaignId: req.params.campaignId },
    });
    if (!existing) return next(createError('Campaign context not found', 404));

    await prisma.campaignContext.delete({ where: { campaignId: req.params.campaignId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
