import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { EvolutionApiClient } from '../services/evolutionApiClient';

const router = Router();

// GET /api/whatsapp-campaigns — List campaigns with contact counts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.whatsAppCampaign.count({ where }),
      prisma.whatsAppCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { contacts: true } },
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

// GET /api/whatsapp-campaigns/:id — Single campaign with contacts
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.whatsAppCampaign.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: true,
      },
    });

    if (!campaign) return next(createError('Campaign not found', 404));

    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-campaigns — Create campaign
router.post(
  '/',
  validate({ name: 'required', message: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, message, contacts } = req.body;

      if (!Array.isArray(contacts) || contacts.length === 0) {
        return next(createError('contacts must be a non-empty array of phone numbers', 422));
      }

      const campaign = await prisma.whatsAppCampaign.create({
        data: {
          name,
          message,
          contacts: {
            create: contacts.map((phone: string) => ({ phone })),
          },
        },
        include: {
          _count: { select: { contacts: true } },
        },
      });

      res.status(201).json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/whatsapp-campaigns/:id — Update campaign (not if running)
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Campaign not found', 404));

    if (existing.status === 'RUNNING') {
      return next(createError('Cannot update a running campaign', 400));
    }

    const { name, message } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (message !== undefined) data.message = message;

    const campaign = await prisma.whatsAppCampaign.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/whatsapp-campaigns/:id — Delete campaign (not if running)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.whatsAppCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Campaign not found', 404));

    if (existing.status === 'RUNNING') {
      return next(createError('Cannot delete a running campaign', 400));
    }

    await prisma.whatsAppCampaign.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp-campaigns/:id/start — Start campaign
router.post('/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.whatsAppCampaign.findUnique({
      where: { id: req.params.id },
      include: { contacts: true },
    });

    if (!campaign) return next(createError('Campaign not found', 404));

    if (campaign.status === 'RUNNING') {
      return next(createError('Campaign is already running', 400));
    }

    if (campaign.contacts.length === 0) {
      return next(createError('Campaign has no contacts', 400));
    }

    // Set status to RUNNING
    const updated = await prisma.whatsAppCampaign.update({
      where: { id: campaign.id },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    // Send messages in background with 5s delay between each
    (async () => {
      try {
        const client = await EvolutionApiClient.fromConfig();

        for (const contact of campaign.contacts) {
          try {
            await client.sendText(contact.phone, campaign.message);
            await prisma.whatsAppCampaignContact.update({
              where: { id: contact.id },
              data: { status: 'SENT', sentAt: new Date() },
            });
          } catch (err) {
            console.error(`[whatsapp-campaigns] Failed to send to ${contact.phone}:`, err);
            await prisma.whatsAppCampaignContact.update({
              where: { id: contact.id },
              data: { status: 'ERROR' },
            });
          }

          // 5-second delay between messages
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        await prisma.whatsAppCampaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      } catch (err) {
        console.error(`[whatsapp-campaigns] Campaign ${campaign.id} failed:`, err);
        await prisma.whatsAppCampaign.update({
          where: { id: campaign.id },
          data: { status: 'COMPLETED' },
        });
      }
    })();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
