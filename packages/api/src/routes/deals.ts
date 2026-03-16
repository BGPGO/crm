import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { onStageChanged } from '../services/automationTriggerListener';

const router = Router();

const dealInclude = {
  pipeline: { select: { id: true, name: true } },
  stage: { select: { id: true, name: true, order: true, color: true } },
  user: { select: { id: true, name: true, email: true } },
  contact: { select: { id: true, name: true, email: true } },
  organization: { select: { id: true, name: true } },
  source: { select: { id: true, name: true } },
  lostReason: { select: { id: true, name: true } },
  campaign: { select: { id: true, name: true } },
};

// GET /api/deals
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { pipelineId, stageId, userId, status, period } = req.query;

    const where: Record<string, unknown> = {};

    if (pipelineId) where.pipelineId = pipelineId as string;
    if (stageId) where.stageId = stageId as string;
    if (userId) where.userId = userId as string;
    if (status) where.status = status as string;

    if (period) {
      const now = new Date();
      let from: Date;
      switch (period) {
        case 'this_month':
          from = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'last_3':
          from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          break;
        case 'last_6':
          from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
          break;
        case 'this_year':
          from = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          from = new Date(0);
      }
      where.createdAt = { gte: from };
    }

    const [total, data] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: dealInclude,
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

// GET /api/deals/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        ...dealInclude,
        contact: {
          select: {
            id: true, name: true, email: true, phone: true,
            leadTrackings: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        tasks: { orderBy: { dueDate: 'asc' } },
        activities: { orderBy: { createdAt: 'desc' } },
        products: { include: { product: true } },
        dealContacts: { include: { contact: true } },
      },
    });

    if (!deal) return next(createError('Deal not found', 404));

    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
});

// POST /api/deals
router.post(
  '/',
  validate({ title: 'required', pipelineId: 'required', stageId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, value, pipelineId, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, classification, contaAzulCode, recurrence, campaignId } = req.body;
      const deal = await prisma.deal.create({
        data: { title, value, pipelineId, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, classification, contaAzulCode, recurrence, campaignId },
        include: dealInclude,
      });
      res.status(201).json({ data: deal });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/deals/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal not found', 404));

    const { title, value, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, classification, contaAzulCode, recurrence, campaignId } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (value !== undefined) data.value = value;
    if (stageId !== undefined) data.stageId = stageId;
    if (userId !== undefined) data.userId = userId;
    if (contactId !== undefined) data.contactId = contactId;
    if (organizationId !== undefined) data.organizationId = organizationId;
    if (sourceId !== undefined) data.sourceId = sourceId;
    if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate;
    if (classification !== undefined) data.classification = classification;
    if (contaAzulCode !== undefined) data.contaAzulCode = contaAzulCode;
    if (recurrence !== undefined) data.recurrence = recurrence;
    if (campaignId !== undefined) data.campaignId = campaignId;

    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data,
      include: dealInclude,
    });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deals/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal not found', 404));

    await prisma.deal.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/deals/:id/stage — move deal to a new stage
router.patch(
  '/:id/stage',
  validate({ stageId: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stageId } = req.body as { stageId: string };

      const existing = await prisma.deal.findUnique({
        where: { id: req.params.id },
        include: { stage: true },
      });
      if (!existing) return next(createError('Deal not found', 404));

      const newStage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
      if (!newStage) return next(createError('Stage not found', 404));

      if (newStage.pipelineId !== existing.pipelineId) {
        return next(createError('Stage does not belong to the deal pipeline', 400));
      }

      const fromStage = existing.stage.name;
      const toStage = newStage.name;

      const deal = await prisma.deal.update({
        where: { id: req.params.id },
        data: { stageId },
        include: dealInclude,
      });

      // Log activity and dispatch outgoing webhook
      await logActivity({
        type: 'STAGE_CHANGE',
        content: `Etapa alterada de "${fromStage}" para "${toStage}"`,
        userId: existing.userId,
        dealId: existing.id,
        contactId: existing.contactId ?? undefined,
        metadata: { fromStage, toStage },
      });

      dispatchWebhook('deal.stage_changed', {
        dealId: deal.id,
        dealTitle: deal.title,
        fromStage,
        toStage,
      });

      if (deal.contactId) {
        onStageChanged(deal.contactId, stageId, deal.id);
      }

      res.json({ data: deal });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/deals/:id/status — mark as won or lost
router.patch(
  '/:id/status',
  validate({ status: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, lostReasonId } = req.body as {
        status: string;
        lostReasonId?: string;
      };

      const allowedStatuses = ['OPEN', 'WON', 'LOST'];
      if (!allowedStatuses.includes(status)) {
        return next(createError(`Status must be one of: ${allowedStatuses.join(', ')}`, 400));
      }

      if (status === 'LOST' && !lostReasonId) {
        return next(createError('lostReasonId is required when status is LOST', 400));
      }

      const existing = await prisma.deal.findUnique({
        where: { id: req.params.id },
        include: { stage: true, pipeline: { include: { stages: { orderBy: { order: 'asc' } } } } },
      });
      if (!existing) return next(createError('Deal not found', 404));

      const updateData: Record<string, unknown> = { status };

      if (status === 'WON') {
        updateData.closedAt = new Date();
        updateData.lostReasonId = null;

        // Move to "Ganho fechado" stage (or last stage as fallback)
        const ganhoStage = existing.pipeline.stages.find(
          (s) => s.name.toLowerCase().includes('ganho')
        ) ?? existing.pipeline.stages[existing.pipeline.stages.length - 1];
        if (ganhoStage) {
          updateData.stageId = ganhoStage.id;
        }
      } else if (status === 'LOST') {
        updateData.closedAt = new Date();
        updateData.lostReasonId = lostReasonId;
        updateData.lostAtStage = existing.stage.name;
      } else {
        // OPEN
        updateData.closedAt = null;
        updateData.lostReasonId = null;
        updateData.lostAtStage = null;
      }

      const deal = await prisma.deal.update({
        where: { id: req.params.id },
        data: updateData,
        include: dealInclude,
      });

      // Log activity
      await logActivity({
        type: 'STATUS_CHANGE',
        content: `Status alterado para ${status}`,
        userId: existing.userId,
        dealId: existing.id,
        contactId: existing.contactId ?? undefined,
        metadata: { fromStatus: existing.status, toStatus: status },
      });

      // Dispatch outgoing webhook
      if (status === 'WON') {
        dispatchWebhook('deal.won', { dealId: deal.id, dealTitle: deal.title, closedAt: deal.closedAt });
      } else if (status === 'LOST') {
        dispatchWebhook('deal.lost', {
          dealId: deal.id,
          dealTitle: deal.title,
          lostAtStage: existing.stage.name,
          lostReasonId,
          closedAt: deal.closedAt,
        });
      }

      res.json({ data: deal });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/deals/:id/timeline — all activities for a deal, newest first
router.get('/:id/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal not found', 404));

    const activities = await prisma.activity.findMany({
      where: { dealId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    });

    res.json({ data: activities });
  } catch (err) {
    next(err);
  }
});

// POST /api/deals/:id/contacts — link a contact to the deal
router.post('/:id/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId, isPrimary } = req.body as { contactId?: string; isPrimary?: boolean };

    if (!contactId) {
      return next(createError('contactId is required', 400));
    }

    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Deal not found', 404));

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) return next(createError('Contact not found', 404));

    const dealContact = await prisma.dealContact.create({
      data: {
        dealId: req.params.id,
        contactId,
        isPrimary: isPrimary ?? false,
      },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    res.status(201).json({ data: dealContact });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/deals/:id/contacts/:contactId — remove contact link from deal
router.delete('/:id/contacts/:contactId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, contactId } = req.params;

    const existing = await prisma.dealContact.findUnique({
      where: { dealId_contactId: { dealId: id, contactId } },
    });

    if (!existing) return next(createError('Deal-contact link not found', 404));

    await prisma.dealContact.delete({
      where: { dealId_contactId: { dealId: id, contactId } },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
