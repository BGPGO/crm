import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { EvolutionApiClient } from '../services/evolutionApiClient';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If 10-11 digits (BR without country code), prepend 55
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}

const router = Router();

// GET /api/whatsapp-campaigns/stages — List pipeline stages with contact counts
router.get('/stages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stages = await prisma.pipelineStage.findMany({
      where: { pipeline: { isDefault: true } },
      orderBy: { order: 'asc' },
      include: {
        pipeline: { select: { name: true } },
        _count: { select: { deals: true } },
      },
    });

    res.json({ data: stages });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-campaigns/segments — List segments with contact counts
router.get('/segments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const segments = await prisma.segment.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, contactCount: true },
    });
    res.json({ data: segments });
  } catch (err) {
    next(err);
  }
});

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
          stage: { select: { id: true, name: true } },
          segment: { select: { id: true, name: true } },
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
        stage: { select: { id: true, name: true } },
        segment: { select: { id: true, name: true } },
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, message, contacts, stageId, segmentId, dealStatus, valueMin, valueMax, createdFrom, createdTo } = req.body;

      if (!name || !message) return next(createError('name and message are required', 400));

      let phoneNumbers: string[] = [];

      if (segmentId) {
        // Get contacts from segment filters
        const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
        if (!segment) return next(createError('Segment not found', 404));

        const { buildSegmentWhere } = await import('../services/segmentEngine');
        const segmentWhere = buildSegmentWhere(segment.filters as any);

        const segmentContacts = await prisma.contact.findMany({
          where: { ...segmentWhere, phone: { not: null } },
          select: { phone: true },
        });

        phoneNumbers = segmentContacts
          .map(c => normalizePhone(c.phone!))
          .filter(p => p.trim() !== '');
        phoneNumbers = [...new Set(phoneNumbers)];

        if (phoneNumbers.length === 0) {
          return next(createError('No contacts with phone numbers found in this segment', 422));
        }
      } else if (stageId) {
        // Build deal filter with optional status, value range, and date range
        const dealWhere: Record<string, unknown> = { stageId };

        if (dealStatus) {
          dealWhere.status = dealStatus;
        }

        if (valueMin != null || valueMax != null) {
          const valueFilter: Record<string, number> = {};
          if (valueMin != null) valueFilter.gte = parseFloat(valueMin);
          if (valueMax != null) valueFilter.lte = parseFloat(valueMax);
          dealWhere.value = valueFilter;
        }

        if (createdFrom || createdTo) {
          const dateFilter: Record<string, Date> = {};
          if (createdFrom) dateFilter.gte = new Date(createdFrom);
          if (createdTo) dateFilter.lte = new Date(createdTo + 'T23:59:59.999Z');
          dealWhere.createdAt = dateFilter;
        }

        const deals = await prisma.deal.findMany({
          where: dealWhere,
          include: { contact: { select: { phone: true } } },
        });
        phoneNumbers = deals
          .map(d => d.contact?.phone)
          .filter((p): p is string => !!p && p.trim() !== '')
          .map(p => normalizePhone(p));

        // Remove duplicates
        phoneNumbers = [...new Set(phoneNumbers)];

        if (phoneNumbers.length === 0) {
          return next(createError('No contacts with phone numbers found with these filters', 422));
        }
      } else if (Array.isArray(contacts) && contacts.length > 0) {
        phoneNumbers = contacts.map((p: string) => normalizePhone(p));
      } else {
        return next(createError('Either contacts array, stageId, or segmentId is required', 422));
      }

      const campaign = await prisma.whatsAppCampaign.create({
        data: {
          name,
          message,
          stageId: stageId || null,
          segmentId: segmentId || null,
          contacts: {
            create: phoneNumbers.map((phone: string) => ({ phone })),
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
