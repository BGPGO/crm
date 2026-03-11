import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';

const router = Router();

// POST /api/webhooks/incoming/:id
router.post('/incoming/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    // 1. Fetch and validate WebhookConfig
    const webhookConfig = await prisma.webhookConfig.findUnique({ where: { id } });

    if (!webhookConfig) {
      return next(createError('Webhook configuration not found', 404));
    }

    if (!webhookConfig.isActive) {
      return next(createError('Webhook is not active', 403));
    }

    // 2. Validate secret if configured
    if (webhookConfig.secret) {
      const incomingSecret = req.headers['x-webhook-secret'];
      if (incomingSecret !== webhookConfig.secret) {
        return next(createError('Invalid webhook secret', 401));
      }
    }

    // 3. Extract contact data — support flexible field mapping
    const fieldMapping =
      webhookConfig.headers &&
      typeof webhookConfig.headers === 'object' &&
      !Array.isArray(webhookConfig.headers) &&
      'fieldMapping' in (webhookConfig.headers as object)
        ? (webhookConfig.headers as Record<string, Record<string, string>>).fieldMapping
        : null;

    function resolveField(candidates: string[]): string | undefined {
      if (fieldMapping) {
        for (const candidate of candidates) {
          const mapped = fieldMapping[candidate];
          if (mapped && body[mapped] !== undefined && body[mapped] !== null) {
            return String(body[mapped]);
          }
        }
      }
      for (const candidate of candidates) {
        if (body[candidate] !== undefined && body[candidate] !== null) {
          return String(body[candidate]);
        }
      }
      return undefined;
    }

    const contactName = resolveField(['name', 'nome', 'full_name', 'fullName']) ?? 'Contato sem nome';
    const contactEmail = resolveField(['email', 'e_mail', 'email_address']);
    const contactPhone = resolveField(['phone', 'telefone', 'celular', 'whatsapp', 'phone_number']);

    // 4. Extract tracking data
    const utmSource = resolveField(['utm_source']);
    const utmMedium = resolveField(['utm_medium']);
    const utmCampaign = resolveField(['utm_campaign']);
    const utmTerm = resolveField(['utm_term']);
    const utmContent = resolveField(['utm_content']);
    const referrer = resolveField(['referrer', 'ref']);
    const landingPage = resolveField(['landing_page', 'page_url', 'pageUrl']);
    const ip = req.ip ?? req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ?? null;
    const userAgent = req.headers['user-agent'] ?? null;

    // 5. Find default admin user for deal assignment
    const defaultUser = await prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultUser) {
      return next(createError('No active admin user found to assign deal', 500));
    }

    // 6. Find default pipeline and its first stage (Lead)
    const defaultPipeline = await prisma.pipeline.findFirst({
      where: { isDefault: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    });

    if (!defaultPipeline || defaultPipeline.stages.length === 0) {
      return next(createError('No default pipeline with stages found', 500));
    }

    const firstStage = defaultPipeline.stages[0];

    // 7. Create Contact
    const contact = await prisma.contact.create({
      data: {
        name: contactName,
        email: contactEmail ?? null,
        phone: contactPhone ?? null,
      },
    });

    // 8. Create LeadTracking
    await prisma.leadTracking.create({
      data: {
        contactId: contact.id,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmTerm: utmTerm ?? null,
        utmContent: utmContent ?? null,
        referrer: referrer ?? null,
        landingPage: landingPage ?? null,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });

    // 9. Create Deal
    const deal = await prisma.deal.create({
      data: {
        title: `Lead - ${contactName}`,
        status: 'OPEN',
        pipelineId: defaultPipeline.id,
        stageId: firstStage.id,
        contactId: contact.id,
        userId: defaultUser.id,
      },
    });

    // 10. Log activities
    await Promise.all([
      logActivity({
        type: 'WEBHOOK_RECEIVED',
        content: `Lead recebido via webhook: ${webhookConfig.name}`,
        userId: defaultUser.id,
        contactId: contact.id,
        dealId: deal.id,
        metadata: {
          webhookConfigId: webhookConfig.id,
          webhookName: webhookConfig.name,
          payload: body,
        },
      }),
      logActivity({
        type: 'DEAL_CREATED',
        content: `Negociação criada automaticamente via webhook`,
        userId: defaultUser.id,
        contactId: contact.id,
        dealId: deal.id,
        metadata: {
          pipelineName: defaultPipeline.name,
          stageName: firstStage.name,
        },
      }),
    ]);

    // 11. Dispatch outgoing webhooks (fire-and-forget)
    dispatchWebhook('lead.created', {
      contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
      deal: { id: deal.id, title: deal.title },
      tracking: { utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrer, landingPage },
    });

    return res.status(200).json({ success: true, contactId: contact.id, dealId: deal.id });
  } catch (err) {
    next(err);
  }
});

export default router;
