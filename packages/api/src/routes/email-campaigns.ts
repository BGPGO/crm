import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';

const router = Router();

// GET /api/email-campaigns
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = { brand: req.brand };
    if (status) where.status = status as string;

    const [total, campaigns] = await Promise.all([
      prisma.emailCampaign.count({ where }),
      prisma.emailCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { name: true } },
          segment: { select: { id: true, name: true, contactCount: true } },
          _count: { select: { sends: true } },
        },
      }),
    ]);

    // Compute cumulative metrics for each campaign
    const campaignIds = campaigns.map(c => c.id);
    const allSends = campaignIds.length > 0
      ? await prisma.emailSend.groupBy({
          by: ['emailCampaignId', 'status'],
          where: { emailCampaignId: { in: campaignIds } },
          _count: { status: true },
        })
      : [];

    const metricsMap = new Map<string, { sent: number; opened: number; clicked: number }>();
    for (const row of allSends) {
      const m = metricsMap.get(row.emailCampaignId) || { sent: 0, opened: 0, clicked: 0 };
      const count = row._count.status;
      // "sent" = all emails that left the server (SENT + DELIVERED + OPENED + CLICKED)
      // "opened" and "clicked" are cumulative up the chain
      if (row.status === 'SENT') m.sent += count;
      if (row.status === 'DELIVERED') m.sent += count;
      if (row.status === 'OPENED') { m.sent += count; m.opened += count; }
      if (row.status === 'CLICKED') { m.sent += count; m.opened += count; m.clicked += count; }
      metricsMap.set(row.emailCampaignId, m);
    }

    const data = campaigns.map(c => {
      const m = metricsMap.get(c.id) || { sent: 0, opened: 0, clicked: 0 };
      return {
        ...c,
        recipientCount: c.totalRecipients || c._count?.sends || 0,
        openRate: m.sent > 0 ? m.opened / m.sent : null,
        clickRate: m.opened > 0 ? m.clicked / m.opened : null,
      };
    });

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

    // Enrich response with computed fields the frontend expects
    const enriched = {
      ...campaign,
      htmlContent: campaign.template?.htmlContent || '',
      recipientCount: campaign.totalRecipients || campaign._count?.sends || 0,
    };

    res.json({ data: enriched });
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
      const { name, subject, fromName, fromEmail, templateId, segmentId, filterGroups, status, htmlContent } = req.body;

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
          filters: filterGroups ?? null,
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

    const { name, subject, fromName, fromEmail, templateId, segmentId, filterGroups } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (subject !== undefined) data.subject = subject;
    if (fromName !== undefined) data.fromName = fromName;
    if (fromEmail !== undefined) data.fromEmail = fromEmail;
    if (templateId !== undefined) data.templateId = templateId;
    if (segmentId !== undefined) data.segmentId = segmentId;
    if (filterGroups !== undefined) data.filters = filterGroups;

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
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) return next(createError('Email campaign not found', 404));

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return next(createError('Campaign must be DRAFT or SCHEDULED to send', 400));
    }

    const sendTeamCopy = req.body.sendTeamCopy !== false;
    const { dispatchEmailCampaign } = await import('../services/emailDispatcher');
    const updated = await dispatchEmailCampaign(req.params.id, { sendTeamCopy });
    if (!updated) {
      return next(createError('Campaign is no longer eligible to send', 409));
    }

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

    // Count by current status
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

    // Status is a progression: QUEUED → SENT → DELIVERED → OPENED → CLICKED
    // A "CLICKED" email was also opened and delivered, so stats must be cumulative.
    const rawClicked = statusCounts['CLICKED'] || 0;
    const rawOpened = statusCounts['OPENED'] || 0;
    const rawDelivered = statusCounts['DELIVERED'] || 0;
    const rawSent = statusCounts['SENT'] || 0;
    const bounced = statusCounts['BOUNCED'] || 0;
    const spam = statusCounts['SPAM'] || 0;
    const unsubscribed = statusCounts['UNSUBSCRIBED'] || 0;

    // Cumulative: each higher status implies all previous ones
    const clicked = rawClicked;
    const opened = rawOpened + rawClicked;
    const delivered = rawDelivered + rawOpened + rawClicked;
    const sent = rawSent + rawDelivered + rawOpened + rawClicked;

    // Open rate based on all successfully sent (not just "delivered" which depends on webhooks)
    const openRate = sent > 0 ? opened / sent : 0;
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

// GET /api/email-campaigns/:id/recipients — List individual recipients with status
router.get('/:id/recipients', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status: filterStatus } = req.query;

    const where: Record<string, unknown> = { emailCampaignId: req.params.id };
    if (filterStatus) {
      where.status = filterStatus as string;
    }

    const sends = await prisma.emailSend.findMany({
      where,
      orderBy: [{ clickedAt: { sort: 'desc', nulls: 'last' } }, { openedAt: { sort: 'desc', nulls: 'last' } }, { sentAt: { sort: 'desc', nulls: 'last' } }],
      include: {
        contact: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    // Batch-fetch latest deal for each contact
    const contactIds = sends.map(s => s.contact?.id).filter(Boolean) as string[];
    const dealsByContact: Record<string, { id: string; title: string; status: string; stage: { name: string; color: string | null } | null }> = {};
    if (contactIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        distinct: ['contactId'],
        select: { id: true, title: true, status: true, contactId: true, createdAt: true, stage: { select: { name: true, color: true, order: true } } },
      });
      for (const d of deals) {
        if (d.contactId) dealsByContact[d.contactId] = d;
      }
    }

    const data = sends.map((s) => ({
      id: s.id,
      contact: s.contact,
      status: s.status,
      sentAt: s.sentAt,
      openedAt: s.openedAt,
      clickedAt: s.clickedAt,
      bouncedAt: s.bouncedAt,
      unsubscribedAt: s.unsubscribedAt,
      deal: s.contact?.id ? dealsByContact[s.contact.id] || null : null,
    }));

    res.json({ data });
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
