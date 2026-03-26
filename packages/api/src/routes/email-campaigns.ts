import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { buildSegmentWhere, SegmentFilter } from '../services/segmentEngine';

const router = Router();

// GET /api/email-campaigns
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.emailCampaign.count({ where }),
      prisma.emailCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { name: true } },
          segment: { select: { name: true } },
          _count: { select: { sends: true } },
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

// GET /api/email-campaigns/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: req.params.id },
      include: {
        template: true,
        segment: true,
        _count: { select: { sends: true } },
      },
    });

    if (!campaign) return next(createError('Email campaign not found', 404));

    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// POST /api/email-campaigns
router.post(
  '/',
  validate({ name: 'required', subject: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, subject, fromName, fromEmail, templateId, segmentId, status, htmlContent } = req.body;

      // If custom HTML is provided without a template, create an inline template
      let finalTemplateId = templateId ?? null;
      if (!finalTemplateId && htmlContent) {
        const inlineTemplate = await prisma.emailTemplate.create({
          data: {
            name: `[Auto] ${name}`,
            subject,
            htmlContent,
          },
        });
        finalTemplateId = inlineTemplate.id;
      }

      const campaign = await prisma.emailCampaign.create({
        data: {
          name,
          subject,
          fromName: fromName || 'BGPGO',
          fromEmail: fromEmail || 'noreply@bertuzzipatrimonial.com.br',
          templateId: finalTemplateId,
          segmentId: segmentId ?? null,
          status: status ?? 'DRAFT',
        },
      });

      res.status(201).json({ data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/email-campaigns/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Email campaign not found', 404));

    if (existing.status !== 'DRAFT') {
      return next(createError('Only DRAFT campaigns can be updated', 400));
    }

    const { name, subject, fromName, fromEmail, templateId, segmentId } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (subject !== undefined) data.subject = subject;
    if (fromName !== undefined) data.fromName = fromName;
    if (fromEmail !== undefined) data.fromEmail = fromEmail;
    if (templateId !== undefined) data.templateId = templateId;
    if (segmentId !== undefined) data.segmentId = segmentId;

    const campaign = await prisma.emailCampaign.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: campaign });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/email-campaigns/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Email campaign not found', 404));

    if (existing.status !== 'DRAFT') {
      return next(createError('Only DRAFT campaigns can be deleted', 400));
    }

    await prisma.emailCampaign.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/email-campaigns/:id/send
router.post('/:id/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: req.params.id },
      include: { segment: true },
    });

    if (!campaign) return next(createError('Email campaign not found', 404));

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return next(createError('Campaign must be DRAFT or SCHEDULED to send', 400));
    }

    let contacts;

    if (campaign.segmentId && campaign.segment) {
      const filters = campaign.segment.filters as unknown as SegmentFilter[];
      const where = buildSegmentWhere(filters);
      contacts = await prisma.contact.findMany({
        where: { ...where, email: { not: null } },
        select: { id: true, email: true },
      });
    } else {
      contacts = await prisma.contact.findMany({
        where: { email: { not: null } },
        select: { id: true, email: true },
      });
    }

    await prisma.emailSend.createMany({
      data: contacts.map((contact) => ({
        emailCampaignId: campaign.id,
        contactId: contact.id,
        status: 'QUEUED' as const,
      })),
    });

    const updated = await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        status: 'SENDING',
        totalRecipients: contacts.length,
        sentAt: new Date(),
      },
    });

    const { sendCampaignEmails } = await import('../services/emailSender');
    sendCampaignEmails(campaign.id).catch(async (error) => {
      console.error(`Failed to send campaign ${campaign.id}:`, error);
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'FAILED' },
      });
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/email-campaigns/:id/unschedule
router.post('/:id/unschedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return next(createError('Email campaign not found', 404));

    if (campaign.status !== 'SCHEDULED') {
      return next(createError('Only SCHEDULED campaigns can be unscheduled', 400));
    }

    const updated = await prisma.emailCampaign.update({
      where: { id: req.params.id },
      data: { status: 'DRAFT', scheduledAt: null },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/email-campaigns/:id/schedule
router.post('/:id/schedule', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return next(createError('Email campaign not found', 404));

    if (campaign.status !== 'DRAFT') {
      return next(createError('Only DRAFT campaigns can be scheduled', 400));
    }

    const { scheduledAt } = req.body;
    if (!scheduledAt) return next(createError('scheduledAt is required', 400));

    const parsedDate = new Date(scheduledAt);
    if (isNaN(parsedDate.getTime())) {
      return next(createError('scheduledAt must be a valid date', 400));
    }
    if (parsedDate.getTime() <= Date.now()) {
      return next(createError('scheduledAt must be in the future', 400));
    }

    const updated = await prisma.emailCampaign.update({
      where: { id: req.params.id },
      data: {
        status: 'SCHEDULED',
        scheduledAt: parsedDate,
      },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/email-campaigns/:id/stats
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return next(createError('Email campaign not found', 404));

    const sends = await prisma.emailSend.groupBy({
      by: ['status'],
      where: { emailCampaignId: req.params.id },
      _count: { status: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const row of sends) {
      statusCounts[row.status] = row._count.status;
    }

    const total = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);
    const sent = statusCounts['SENT'] || 0;
    const delivered = statusCounts['DELIVERED'] || 0;
    const opened = statusCounts['OPENED'] || 0;
    const clicked = statusCounts['CLICKED'] || 0;
    const bounced = statusCounts['BOUNCED'] || 0;
    const spam = statusCounts['SPAM'] || 0;
    const unsubscribed = statusCounts['UNSUBSCRIBED'] || 0;

    const openRate = delivered > 0 ? opened / delivered : 0;
    const clickRate = opened > 0 ? clicked / opened : 0;
    const bounceRate = total > 0 ? bounced / total : 0;

    res.json({
      data: {
        total,
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        spam,
        unsubscribed,
        openRate,
        clickRate,
        bounceRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/email-campaigns/:id/test-send
router.post('/:id/test-send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return next(createError('Email campaign not found', 404));

    const { email } = req.body;
    if (!email) return next(createError('email is required', 400));

    const { sendTestEmail } = await import('../services/emailSender');
    await sendTestEmail(campaign.id, email);

    res.json({ data: { success: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
