import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { onLeadCreated } from '../services/leadQualificationEngine';
import { onStageChanged, onContactCreated } from '../services/automationTriggerListener';
import { handleAutentiqueWebhook } from '../services/contractWebhookHandler';
import { normalizePhone, phoneVariants } from '../utils/phoneNormalize';
import { sendLeadNotifications } from '../services/leadNotificationService';
import { resolveLeadPipeline, isNewsletterLead, isNoAutomationPipeline } from '../lib/pipelines';
import { subscribeFromWebhook } from '../services/newsletterJourney';

const router = Router();

/**
 * Quem é avisado do lead que cai em funil de atendimento humano (indicação).
 * É o email corporativo da Fernanda de propósito — o cadastro dela no CRM tem
 * email pessoal, e o aviso é de trabalho.
 */
const NOTIFY_LEAD_INDICACAO = ['fernanda@bertuzzipatrimonial.com.br'];

// Extrai o fbclid de uma URL (query param). A GreatPages não manda o fbclid
// como campo solto — ele vem embutido na URL da landing page (landing_page).
function extractFbclid(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /[?&]fbclid=([^&#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

// Monta o `fbc` no formato exigido pela Meta CAPI: fb.1.<timestamp_ms>.<fbclid>.
// Ordem de preferência: cookie _fbc já formatado (começa com "fb.") → fbclid cru
// enviado no corpo → fbclid extraído da URL da landing page.
function buildFbc(
  rawFbc: string | undefined,
  landingPage: string | undefined,
  nowMs: number
): string | null {
  if (rawFbc && rawFbc.startsWith('fb.')) return rawFbc;
  const fbclid = (rawFbc && rawFbc.trim() !== '' ? rawFbc : null) ?? extractFbclid(landingPage);
  if (!fbclid) return null;
  return `fb.1.${nowMs}.${fbclid}`;
}

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

    // 2. Validate secret — headers only (never accept secrets in body/query)
    if (webhookConfig.secret) {
      const incomingSecret =
        (req.headers['x-webhook-secret'] as string) ??
        req.headers['authorization']?.replace(/^Bearer\s+/i, '');

      if (!incomingSecret || String(incomingSecret) !== webhookConfig.secret) {
        return next(createError('Invalid webhook secret', 401));
      }
    }

    // 2b. Check if this is an Autentique contract webhook
    const events = Array.isArray(webhookConfig.events) ? webhookConfig.events as string[] : [];
    if (events.some(e => String(e).includes('document.'))) {
      console.log(`[webhooks] Routing to Autentique handler for webhook ${webhookConfig.name}`);
      return handleAutentiqueWebhook(req, res);
    }

    // 3. Extract contact data — support flexible field mapping
    const fieldMapping =
      webhookConfig.headers &&
      typeof webhookConfig.headers === 'object' &&
      !Array.isArray(webhookConfig.headers) &&
      'fieldMapping' in (webhookConfig.headers as object)
        ? (webhookConfig.headers as Record<string, Record<string, string>>).fieldMapping
        : null;

    // O que o lead digita no formulário entrava cru: "Marcos André " (espaço no
    // fim) não casa com "Marcos André" na comparação byte a byte do Postgres, e
    // o webhook do Calendly acabava criando contato + negociação duplicados.
    // Valor só de espaços conta como ausente — cai no próximo candidato.
    function pickValue(value: unknown): string | undefined {
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === '' ? undefined : trimmed;
    }

    function resolveField(candidates: string[]): string | undefined {
      if (fieldMapping) {
        for (const candidate of candidates) {
          const mapped = fieldMapping[candidate];
          const mappedValue = mapped ? pickValue(raw[mapped]) : undefined;
          if (mappedValue !== undefined) return mappedValue;
        }
      }
      for (const candidate of candidates) {
        const value = pickValue(raw[candidate]);
        if (value !== undefined) return value;
      }
      return undefined;
    }

    const contactName = resolveField(['name', 'nome', 'full_name', 'fullName', 'lead_name']) ?? 'Contato sem nome';
    const contactEmail = resolveField(['email', 'e_mail', 'email_address', 'lead_email']);
    const contactPhoneRaw = resolveField(['phone', 'telefone', 'celular', 'whatsapp', 'phone_number', 'lead_phone']);
    const contactPhone = contactPhoneRaw ? normalizePhone(contactPhoneRaw) : null;
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
    // Meta Pixel cookies / click id (para matching na Conversions API):
    //   _fbp  → cookie do Pixel (gerado em todo pageview com FBQ) — só chega se a LP mandar
    //   _fbc  → click ID; derivado do fbclid. A GreatPages não manda campo solto, então
    //           extraímos o fbclid da URL da landing page e montamos fb.1.<ts>.<fbclid>.
    // Aceitamos múltiplos nomes para compatibilidade com diferentes templates de LP.
    const fbp = resolveField(['fbp', '_fbp', 'fb_pixel_id']);
    const rawFbc = resolveField(['fbc', '_fbc', 'fb_click_id', 'fbclid']);
    const fbc = buildFbc(rawFbc, landingPage, Date.now());

    // 5. Funil de destino: quem classifica o lead é o CRM, pelo link da LP e
    // depois pela campanha — a mesma régua do edge do GreatPages, para que toda
    // LP (GreatPages, GO Studio, o que vier) caia no funil certo sem precisar
    // ser cadastrada uma por uma. O responsável é o SDR daquele funil.
    const destino = resolveLeadPipeline({ landingPage, campaign: campaignName });

    const [destinoPipeline, destinoStage, destinoOwner] = await Promise.all([
      prisma.pipeline.findUnique({ where: { id: destino.pipelineId } }),
      prisma.pipelineStage.findUnique({ where: { id: destino.stageId } }),
      prisma.user.findUnique({ where: { id: destino.ownerId } }),
    ]);

    if (!destinoPipeline || !destinoStage) {
      return next(createError(`Funil de destino não encontrado: ${destino.pipelineId}`, 500));
    }

    // Se o SDR do funil estiver inativo/removido, cai no dono por omissão de
    // antes (Oliver) em vez de recusar o lead — perder lead é pior.
    const fallbackOwner = destinoOwner?.isActive
      ? null
      : await prisma.user.findFirst({
          where: { role: 'ADMIN', isActive: true },
          orderBy: { createdAt: 'asc' },
        });

    const ownerId = destinoOwner?.isActive ? destinoOwner.id : fallbackOwner?.id;

    if (!ownerId) {
      return next(createError('No active user found to assign deal', 500));
    }

    console.log(
      `[webhook] Lead → funil ${destinoPipeline.name} (${destino.motivo}), responsável ${ownerId}`
    );

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

    // 10. Create or find Contact (dedup by email, then by normalized phone, inside transaction)
    const phoneSearchVariants = contactPhone ? phoneVariants(contactPhone) : [];

    const contact = await prisma.$transaction(async (tx) => {
      // Step 1: Try to find by email
      if (contactEmail) {
        const byEmail = await tx.contact.findFirst({
          where: { email: { equals: contactEmail, mode: 'insensitive' } },
        });
        if (byEmail) {
          return tx.contact.update({
            where: { id: byEmail.id },
            data: {
              ...(contactPhone && !byEmail.phone ? { phone: contactPhone } : {}),
              ...(contactPosition && !byEmail.position ? { position: contactPosition } : {}),
              ...(contactInstagram && !byEmail.instagram ? { instagram: contactInstagram } : {}),
              ...(organizationId && !byEmail.organizationId ? { organizationId } : {}),
            },
          });
        }
      }

      // Step 2: Try to find by normalized phone (exact match via phoneVariants)
      if (phoneSearchVariants.length > 0) {
        const byPhone = await tx.contact.findFirst({
          where: { phone: { in: phoneSearchVariants } },
        });
        if (byPhone) {
          console.log(`[webhook] Contato existente encontrado por telefone (${contactPhone}) — reutilizando ${byPhone.id}`);
          return tx.contact.update({
            where: { id: byPhone.id },
            data: {
              ...(contactEmail && !byPhone.email ? { email: contactEmail } : {}),
              ...(contactPosition && !byPhone.position ? { position: contactPosition } : {}),
              ...(contactInstagram && !byPhone.instagram ? { instagram: contactInstagram } : {}),
              ...(organizationId && !byPhone.organizationId ? { organizationId } : {}),
            },
          });
        }
      }

      // Step 3: No match — create new contact
      return tx.contact.create({
        data: {
          name: contactName,
          email: contactEmail ?? null,
          phone: contactPhone ?? null,
          position: contactPosition ?? null,
          instagram: contactInstagram ?? null,
          organizationId,
        },
      });
    });

    // 10b. Link orphan WhatsApp conversation — no fluxo CTWA a 1ª mensagem chega
    // antes do contato existir (o cron da planilha roda a cada 5min) e o
    // messageRouter só re-tenta o vínculo quando chega OUTRA mensagem inbound.
    // (i) pelo telefone; (ii) pelo email dentro do corpo da 1ª mensagem (o
    // Instant Form ecoa os dados do form na mensagem, e o telefone preenchido
    // pode diferir do WhatsApp de onde o lead mandou).
    try {
      let linked = 0;
      if (phoneSearchVariants.length > 0) {
        const { count } = await prisma.waConversation.updateMany({
          where: { phone: { in: phoneSearchVariants }, contactId: null },
          data: { contactId: contact.id },
        });
        linked += count;
      }
      if (linked === 0 && contactEmail) {
        const orphansByEmail = await prisma.waConversation.findMany({
          where: {
            contactId: null,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            messages: {
              some: { direction: 'INBOUND', body: { contains: contactEmail, mode: 'insensitive' } },
            },
          },
          select: { id: true },
        });
        if (orphansByEmail.length > 0) {
          const { count } = await prisma.waConversation.updateMany({
            where: { id: { in: orphansByEmail.map((c) => c.id) }, contactId: null },
            data: { contactId: contact.id },
          });
          linked += count;
        }
      }
      if (linked > 0) {
        console.log(`[webhook] ${linked} conversa(s) WhatsApp órfã(s) vinculada(s) ao contato ${contact.id}`);
      }
    } catch (linkErr) {
      console.error('[webhook] Erro ao vincular conversa WhatsApp órfã:', linkErr);
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
        fbp: fbp ?? null,
        fbc: fbc ?? null,
      },
    });

    // 11b. INSCRIÇÃO NA NEWSLETTER — não é lead de venda: vira contato +
    // NewsletterSubscriber e para por aqui. Sem deal, sem notificar SDR, sem
    // cadência. O deal só nasce quando a jornada qualifica (newsletterJourney).
    if (contactEmail && isNewsletterLead({ landingPage })) {
      const subscriber = await subscribeFromWebhook({
        contactId: contact.id,
        email: contactEmail,
        cargo: contactPosition ?? null,
        setor: orgSegment ?? null,
        segmentoDetalhe: resolveField(['segmento_detalhe', 'segmento_detalhado']) ?? null,
        faturamento: resolveField(['faturamento', 'porte', 'revenue_range']) ?? null,
      });

      await logActivity({
        type: 'WEBHOOK_RECEIVED',
        content: `Inscrição na newsletter via ${webhookConfig.name} (tier ${subscriber.tier ?? '—'})`,
        userId: ownerId,
        contactId: contact.id,
        metadata: {
          webhookConfigId: webhookConfig.id,
          webhookName: webhookConfig.name,
          newsletterSubscriberId: subscriber.id,
          payload: raw,
        },
      });

      console.log(
        `[webhook] Inscrição newsletter — contato ${contact.id}, tier ${subscriber.tier ?? 'null'}, estado ${subscriber.estado}`
      );
      return res.status(200).json({ success: true, contactId: contact.id, subscriber: true });
    }

    // 12. Deal — reaproveita deal OPEN existente em vez de criar outro.
    //
    // Quem compra anúncio preenche a LP várias vezes (2 minutos, 2 meses). Com
    // dedup só por janela de tempo, a re-entrada criava um deal novo e o lead
    // reaparecia na coluna "Lead" mesmo estando em "Proposta enviada" — a equipe
    // perdia o histórico. Mesma regra do edge do GreatPages (fix de 17/04).
    const recentDeal = await prisma.deal.findFirst({
      where: { contactId: contact.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });

    let deal;
    if (recentDeal) {
      console.log(
        `[webhook] Deal OPEN reaproveitado para contato ${contact.id} — deal ${recentDeal.id} (etapa preservada)`
      );
      deal = await prisma.deal.update({
        where: { id: recentDeal.id },
        data: { updatedAt: new Date() },
      });
    } else {
      deal = await prisma.deal.create({
        data: {
          title: dealTitle ?? `Lead - ${contactName}`,
          value: dealValue ? parseFloat(dealValue) : null,
          status: 'OPEN',
          pipelineId: destinoPipeline.id,
          stageId: destinoStage.id,
          contactId: contact.id,
          organizationId,
          userId: ownerId,
          sourceId,
          campaignId,
        },
      });
    }

    // 13. Log activities
    await Promise.all([
      logActivity({
        type: 'WEBHOOK_RECEIVED',
        content: recentDeal
          ? `Lead reentrou via webhook: ${webhookConfig.name} (deal OPEN existente reutilizado)`
          : `Lead recebido via webhook: ${webhookConfig.name}`,
        userId: ownerId,
        contactId: contact.id,
        dealId: deal.id,
        metadata: {
          webhookConfigId: webhookConfig.id,
          webhookName: webhookConfig.name,
          reused: !!recentDeal,
          reusedStageId: recentDeal?.stageId ?? null,
          payload: raw,
        },
      }),
      ...(recentDeal
        ? []
        : [
            logActivity({
              type: 'DEAL_CREATED',
              content: `Negociação criada automaticamente via webhook`,
              userId: ownerId,
              contactId: contact.id,
              dealId: deal.id,
              metadata: {
                pipelineName: destinoPipeline.name,
                stageName: destinoStage.name,
                classificacao: destino.motivo,
                source: sourceName ?? null,
                campaign: campaignRef ?? null,
              },
            }),
          ]),
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

    // Funil de atendimento humano (indicação): o lead entra no CRM e para aí.
    // Sem cadência, sem email automático por etapa e sem BIA — quem vem por
    // indicação é atendido por pessoa. O aviso do lead vai só pra quem atende,
    // não pra lista de plantão do comercial.
    const semAutomacao = isNoAutomationPipeline(destinoPipeline.id);

    // Trigger automations para o novo lead
    if (!recentDeal) {
      if (!semAutomacao) {
        onContactCreated(contact.id);
        onStageChanged(contact.id, destinoStage.id, deal.id);
      }

      // Email notification to team (fire-and-forget)
      const utmUrl = resolveField(['URL', 'url', 'page_url', 'landing_page']);
      sendLeadNotifications({
        dealId: deal.id,
        contactName,
        contactEmail: contactEmail ?? null,
        contactPhone: contactPhone ?? null,
        sourceName: sourceName ?? null,
        campaignName: campaignRef ?? null,
        utmUrl: utmUrl ?? null,
        recipientsOverride: semAutomacao ? NOTIFY_LEAD_INDICACAO : null,
      }).catch(err => console.error('[webhook] Lead notification error:', err));
    }

    // Trigger lead qualification engine (checks Calendly, activates SDR IA if needed)
    if (!semAutomacao) {
      onLeadCreated(contact.id, deal.id).catch((err: unknown) => {
        console.error('[LeadQualification] Erro ao iniciar qualificação:', err);
      });
    } else {
      console.log(
        `[webhook] Lead ${contact.id} em funil sem automação (${destinoPipeline.name}) — sem BIA, sem cadência, aviso só pra ${NOTIFY_LEAD_INDICACAO.join(', ')}`
      );
    }

    return res.status(200).json({ success: true, contactId: contact.id, dealId: deal.id });
  } catch (err) {
    next(err);
  }
}

// POST /api/webhooks/incoming/:id  (POST+JSON)
router.post('/incoming/:id', handleIncoming);

export default router;
