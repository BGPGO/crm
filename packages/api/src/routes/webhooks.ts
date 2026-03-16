import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { onLeadCreated } from '../services/leadQualificationEngine';

const router = Router();

// ── Shared handler for incoming webhooks (POST + GET) ───────────────────────

async function handleIncoming(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const raw: Record<string, unknown> = { ...req.body };

    // 1. Fetch and validate WebhookConfig
    const webhookConfig = await prisma.webhookConfig.findUnique({ where: { id } });

    if (!webhookConfig) {
      return next(createError('Webhook configuration not found', 404));
    }

    if (!webhookConfig.isActive) {
      return next(createError('Webhook is not active', 403));
    }

    // 2. Validate secret/token — supports header OR query param
    if (webhookConfig.secret) {
      const incomingSecret =
        req.headers['x-webhook-secret'] ??
        req.headers['authorization']?.replace(/^Bearer\s+/i, '') ??
        raw['token'] ??
        raw['api_key'] ??
        raw['secret'];

      if (String(incomingSecret ?? '') !== webhookConfig.secret) {
        return next(createError('Invalid webhook secret', 401));
      }

      // Remove token fields so they don't pollute lead data
      delete raw['token'];
      delete raw['api_key'];
      delete raw['secret'];
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
          if (mapped && raw[mapped] !== undefined && raw[mapped] !== null && raw[mapped] !== '') {
            return String(raw[mapped]);
          }
        }
      }
      for (const candidate of candidates) {
        if (raw[candidate] !== undefined && raw[candidate] !== null && raw[candidate] !== '') {
          return String(raw[candidate]);
        }
      }
      return undefined;
    }

    const contactName = resolveField(['name', 'nome', 'full_name', 'fullName', 'lead_name']) ?? 'Contato sem nome';
    const contactEmail = resolveField(['email', 'e_mail', 'email_address', 'lead_email']);
    const contactPhone = resolveField(['phone', 'telefone', 'celular', 'whatsapp', 'phone_number', 'lead_phone']);
    const contactPosition = resolveField(['position', 'cargo', 'job_title']);
    const contactInstagram = resolveField(['instagram', 'ig']);

    // Organization data
    const orgName = resolveField(['company', 'empresa', 'organization', 'company_name', 'organization_name']);
    const orgCnpj = resolveField(['cnpj', 'document']);
    const orgWebsite = resolveField(['website', 'site', 'company_website']);
    const orgSegment = resolveField(['segment', 'segmento', 'industry']);

    // Deal data
    const dealTitle = resolveField(['deal_title', 'titulo', 'title']);
    const dealValue = resolveField(['value', 'valor', 'deal_value']);

    // Source and campaign matching
    const sourceName = resolveField(['source', 'fonte', 'lead_source', 'origem']);
    const campaignName = resolveField(['campaign', 'campanha', 'campaign_name', 'utm_campaign']);

    // 4. Extract tracking data
    const utmSource = resolveField(['utm_source']);
    const utmMedium = resolveField(['utm_medium']);
    const utmCampaign = resolveField(['utm_campaign']);
    const utmTerm = resolveField(['utm_term']);
    const utmContent = resolveField(['utm_content']);
    const referrer = resolveField(['referrer', 'ref']);
    const landingPage = resolveField(['landing_page', 'page_url', 'pageUrl', 'page']);
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

    // 7. Match Source by name (create if not found)
    let sourceId: string | null = null;
    if (sourceName) {
      const source = await prisma.source.findFirst({
        where: { name: { equals: sourceName, mode: 'insensitive' } },
      });
      if (source) {
        sourceId = source.id;
      } else {
        const newSource = await prisma.source.create({ data: { name: sourceName } });
        sourceId = newSource.id;
      }
    }

    // 8. Match Campaign by name (create if not found)
    let campaignId: string | null = null;
    const campaignRef = campaignName ?? utmCampaign;
    if (campaignRef) {
      const campaign = await prisma.campaign.findFirst({
        where: { name: { equals: campaignRef, mode: 'insensitive' } },
      });
      if (campaign) {
        campaignId = campaign.id;
      } else {
        const newCampaign = await prisma.campaign.create({ data: { name: campaignRef } });
        campaignId = newCampaign.id;
      }
    }

    // 9. Create or update Organization (if provided)
    let organizationId: string | null = null;
    if (orgName) {
      const existingOrg = orgCnpj
        ? await prisma.organization.findFirst({ where: { cnpj: orgCnpj } })
        : await prisma.organization.findFirst({
            where: { name: { equals: orgName, mode: 'insensitive' } },
          });

      if (existingOrg) {
        organizationId = existingOrg.id;
        // Update with new data if available
        await prisma.organization.update({
          where: { id: existingOrg.id },
          data: {
            ...(orgCnpj && !existingOrg.cnpj ? { cnpj: orgCnpj } : {}),
            ...(orgWebsite && !existingOrg.website ? { website: orgWebsite } : {}),
            ...(orgSegment && !existingOrg.segment ? { segment: orgSegment } : {}),
          },
        });
      } else {
        const newOrg = await prisma.organization.create({
          data: {
            name: orgName,
            cnpj: orgCnpj ?? null,
            website: orgWebsite ?? null,
            segment: orgSegment ?? null,
          },
        });
        organizationId = newOrg.id;
      }
    }

    // 10. Create or find Contact (upsert by email)
    let contact;
    if (contactEmail) {
      const existing = await prisma.contact.findFirst({
        where: { email: { equals: contactEmail, mode: 'insensitive' } },
      });
      if (existing) {
        contact = await prisma.contact.update({
          where: { id: existing.id },
          data: {
            ...(contactPhone && !existing.phone ? { phone: contactPhone } : {}),
            ...(contactPosition && !existing.position ? { position: contactPosition } : {}),
            ...(contactInstagram && !existing.instagram ? { instagram: contactInstagram } : {}),
            ...(organizationId && !existing.organizationId ? { organizationId } : {}),
          },
        });
      } else {
        contact = await prisma.contact.create({
          data: {
            name: contactName,
            email: contactEmail,
            phone: contactPhone ?? null,
            position: contactPosition ?? null,
            instagram: contactInstagram ?? null,
            organizationId,
          },
        });
      }
    } else {
      contact = await prisma.contact.create({
        data: {
          name: contactName,
          email: null,
          phone: contactPhone ?? null,
          position: contactPosition ?? null,
          instagram: contactInstagram ?? null,
          organizationId,
        },
      });
    }

    // 11. Create LeadTracking
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

    // 12. Create Deal
    const deal = await prisma.deal.create({
      data: {
        title: dealTitle ?? `Lead - ${contactName}`,
        value: dealValue ? parseFloat(dealValue) : null,
        status: 'OPEN',
        pipelineId: defaultPipeline.id,
        stageId: firstStage.id,
        contactId: contact.id,
        organizationId,
        userId: defaultUser.id,
        sourceId,
        campaignId,
      },
    });

    // 13. Log activities
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
          payload: raw,
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
          source: sourceName ?? null,
          campaign: campaignRef ?? null,
        },
      }),
    ]);

    // 14. Dispatch outgoing webhooks (fire-and-forget)
    dispatchWebhook('lead.created', {
      contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
      deal: { id: deal.id, title: deal.title, value: deal.value },
      organization: organizationId ? { id: organizationId, name: orgName } : null,
      source: sourceName ?? null,
      campaign: campaignRef ?? null,
      tracking: { utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrer, landingPage },
    });

    // Trigger lead qualification engine (checks Calendly, activates SDR IA if needed)
    onLeadCreated(contact.id, deal.id).catch((err: unknown) => {
      console.error('[LeadQualification] Erro ao iniciar qualificação:', err);
    });

    return res.status(200).json({ success: true, contactId: contact.id, dealId: deal.id });
  } catch (err) {
    next(err);
  }
}

// POST /api/webhooks/incoming/:id  (POST+JSON)
router.post('/incoming/:id', handleIncoming);

export default router;
