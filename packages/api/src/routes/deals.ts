import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { logActivity } from '../services/activityLogger';
import { dispatchWebhook } from '../services/webhookDispatcher';
import { onStageChanged } from '../services/automationTriggerListener';
import { activateSdrIa, normalizePhone } from '../services/leadQualificationEngine';
import { sendSaleNotifications } from '../services/saleNotificationService';
import { scheduleMeetingReminders } from '../services/meetingReminderScheduler';

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
  products: { select: { unitPrice: true, quantity: true, setupPrice: true, recurrenceValue: true, discount: true } },
};

// GET /api/deals
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const query = req.query as Record<string, unknown>;
    const str = (key: string) => query[key] as string | undefined;

    const where: Record<string, unknown> = {};

    if (str('pipelineId')) where.pipelineId = str('pipelineId');
    if (str('stageId')) where.stageId = str('stageId');
    if (str('userId')) where.userId = str('userId');
    if (str('status')) where.status = str('status');
    if (str('sourceId')) where.sourceId = str('sourceId');
    if (str('lostReasonId')) where.lostReasonId = str('lostReasonId');
    if (str('contactId')) where.contactId = str('contactId');
    if (str('organizationId')) where.organizationId = str('organizationId');
    if (str('classification')) where.classification = str('classification');

    // Campaign filter (supports comma-separated list or single id)
    const campaignIds = str('campaignIds');
    if (campaignIds) {
      where.campaignId = { in: campaignIds.split(',').filter(Boolean) };
    } else if (str('campaignId')) {
      where.campaignId = str('campaignId');
    }

    // Product filter: deals that have this product
    if (str('productId')) {
      where.products = { some: { productId: str('productId') } };
    }

    // UTM filter: matches deals whose contact has matching LeadTracking UTMs
    const utmCampaign = str('utmCampaign');
    const utmSource = str('utmSource');
    const utmMedium = str('utmMedium');
    if (utmCampaign || utmSource || utmMedium) {
      const utmWhere: Record<string, unknown> = {};
      if (utmCampaign) utmWhere.utmCampaign = { contains: utmCampaign, mode: 'insensitive' };
      if (utmSource) utmWhere.utmSource = { contains: utmSource, mode: 'insensitive' };
      if (utmMedium) utmWhere.utmMedium = { contains: utmMedium, mode: 'insensitive' };
      where.contact = {
        ...((where.contact as Record<string, unknown>) || {}),
        leadTrackings: { some: utmWhere },
      };
    }

    // Value range
    const valueMin = str('valueMin');
    const valueMax = str('valueMax');
    if (valueMin || valueMax) {
      const valueFilter: Record<string, number> = {};
      if (valueMin) valueFilter.gte = parseFloat(valueMin);
      if (valueMax) valueFilter.lte = parseFloat(valueMax);
      where.value = valueFilter;
    }

    // Overdue task filter
    if (str('hasOverdueTask') === 'true') {
      where.tasks = {
        some: {
          status: { not: 'COMPLETED' },
          dueDate: { lt: new Date() },
        },
      };
    }

    // Period preset filter
    const period = str('period');
    const status = str('status');
    if (period) {
      const now = new Date();
      let from: Date;
      switch (period) {
        case 'today': {
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          from = todayStart;
          break;
        }
        case 'this_week': {
          const dayOfWeek = now.getDay();
          const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
          break;
        }
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
      const dateField = status === 'WON' ? 'closedAt' : 'createdAt';
      where[dateField] = { gte: from };
    }

    // Helper: parse date strings (date-only or datetime)
    const parseFrom = (val: string): Date => new Date(val);
    const parseTo = (val: string): Date => {
      if (val.includes('T')) return new Date(val);
      return new Date(val + 'T23:59:59.999Z');
    };

    // Created date range
    const createdFrom = str('createdAtFrom');
    const createdTo = str('createdAtTo');
    if (createdFrom || createdTo) {
      const createdFilter: Record<string, Date> = {};
      if (createdFrom) createdFilter.gte = parseFrom(createdFrom);
      if (createdTo) createdFilter.lte = parseTo(createdTo);
      where.createdAt = { ...((where.createdAt as Record<string, Date>) || {}), ...createdFilter };
    }

    // Updated date range
    const updatedFrom = str('updatedAtFrom');
    const updatedTo = str('updatedAtTo');
    if (updatedFrom || updatedTo) {
      const updatedFilter: Record<string, Date> = {};
      if (updatedFrom) updatedFilter.gte = parseFrom(updatedFrom);
      if (updatedTo) updatedFilter.lte = parseTo(updatedTo);
      where.updatedAt = updatedFilter;
    }

    // Closed date range
    const closedFrom = str('closedAtFrom');
    const closedTo = str('closedAtTo');
    if (closedFrom || closedTo) {
      const closedFilter: Record<string, Date> = {};
      if (closedFrom) closedFilter.gte = parseFrom(closedFrom);
      if (closedTo) closedFilter.lte = parseTo(closedTo);
      where.closedAt = closedFilter;
    }

    // Expected close date range
    const expectedFrom = str('expectedCloseDateFrom');
    const expectedTo = str('expectedCloseDateTo');
    if (expectedFrom || expectedTo) {
      const expectedFilter: Record<string, Date> = {};
      if (expectedFrom) expectedFilter.gte = parseFrom(expectedFrom);
      if (expectedTo) expectedFilter.lte = parseTo(expectedTo);
      where.expectedCloseDate = expectedFilter;
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

// GET /api/deals/sdr-diagnostics — mostra o que está bloqueando o SDR IA
router.get('/sdr-diagnostics', async (req, res, next) => {
  try {
    const { getFirstContactLimit } = await import('../services/dailyLimitService');
    const { BYPASS_SDR_BUSINESS_HOURS, isBusinessHours } = await import('../utils/sendingWindow');

    const config = await prisma.whatsAppConfig.findFirst();

    const today = new Date(new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo' }).split(',')[0] + 'T00:00:00.000Z');
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const firstContactToday = await prisma.activity.count({
      where: { type: 'NOTE', content: { contains: 'SDR IA ativada' }, createdAt: { gte: today, lt: tomorrow } },
    });
    const firstContactLimit = config ? await getFirstContactLimit() : 2;

    const defaultPipeline = await prisma.pipeline.findFirst({
      where: { isDefault: true },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
    });
    const firstStageId = defaultPipeline?.stages[0]?.id;
    const leadsTotal = firstStageId ? await prisma.deal.count({ where: { stageId: firstStageId, status: 'OPEN' } }) : 0;
    const leadsNaoAtivados = firstStageId ? await prisma.deal.count({ where: { stageId: firstStageId, status: 'OPEN', sdrActivatedAt: null } }) : 0;

    res.json({
      bloqueios: {
        configNaoEncontrada: !config,
        botDesabilitado: config ? !config.botEnabled : true,
        sdrAutoMessageDesabilitado: config ? !config.sdrAutoMessageEnabled : true,
        leadQualificationDesabilitado: config ? !config.leadQualificationEnabled : true,
        foraDaJanela: !BYPASS_SDR_BUSINESS_HOURS && !isBusinessHours(),
        limiteDiarioAtingido: firstContactToday >= firstContactLimit,
      },
      limites: {
        firstContactHoje: firstContactToday,
        firstContactLimite: firstContactLimit,
        warmupAtivo: config?.warmupEnabled ?? false,
        warmupInicio: config?.warmupStartDate ?? null,
      },
      bypassHorarioAtivo: BYPASS_SDR_BUSINESS_HOURS,
      leads: { total: leadsTotal, semSdrAtivado: leadsNaoAtivados },
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
      const { title, value, pipelineId, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, expectedReturnDate, classification, contaAzulCode, recurrence, campaignId } = req.body;
      const deal = await prisma.deal.create({
        data: { title, value, pipelineId, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, expectedReturnDate, classification, contaAzulCode, recurrence, campaignId },
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

    const { title, value, stageId, userId, contactId, organizationId, sourceId, expectedCloseDate, expectedReturnDate, classification, contaAzulCode, recurrence, campaignId } = req.body;
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (value !== undefined) data.value = value;
    if (stageId !== undefined) data.stageId = stageId;
    if (userId !== undefined) data.userId = userId;
    if (contactId !== undefined) data.contactId = contactId;
    if (organizationId !== undefined) data.organizationId = organizationId;
    if (sourceId !== undefined) data.sourceId = sourceId;
    if (expectedCloseDate !== undefined) data.expectedCloseDate = expectedCloseDate;
    if (expectedReturnDate !== undefined) data.expectedReturnDate = expectedReturnDate;
    if (classification !== undefined) data.classification = typeof classification === 'string' ? parseInt(classification) : classification;
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
      const actingUserId = (req as any).user?.id ?? existing.userId;
      await logActivity({
        type: 'STAGE_CHANGE',
        content: `Etapa alterada de "${fromStage}" para "${toStage}"`,
        userId: actingUserId,
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

// PATCH /api/deals/batch/status — mark multiple deals as lost (batch)
router.patch(
  '/batch/status',
  validate({ status: 'required', dealIds: 'required' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, lostReasonId, dealIds } = req.body as {
        status: string;
        lostReasonId?: string;
        dealIds: string[];
      };

      if (!Array.isArray(dealIds) || dealIds.length === 0) {
        return next(createError('dealIds must be a non-empty array', 400));
      }

      if (dealIds.length > 200) {
        return next(createError('Maximum 200 deals per batch', 400));
      }

      const allowedStatuses = ['OPEN', 'WON', 'LOST'];
      if (!allowedStatuses.includes(status)) {
        return next(createError(`Status must be one of: ${allowedStatuses.join(', ')}`, 400));
      }

      if (status === 'LOST' && !lostReasonId) {
        return next(createError('lostReasonId is required when status is LOST', 400));
      }

      // Fetch all deals with their current stage info
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds } },
        include: { stage: true },
      });

      if (deals.length === 0) {
        return next(createError('No deals found with the provided IDs', 404));
      }

      const actingUserId = (req as any).user?.id ?? deals[0].userId;
      const now = new Date();

      // Update all deals in a transaction
      const results = await prisma.$transaction(
        deals.map((deal) => {
          const updateData: Record<string, unknown> = { status };

          if (status === 'LOST') {
            updateData.closedAt = now;
            updateData.lostReasonId = lostReasonId;
            updateData.lostAtStage = deal.stage.name;
          } else if (status === 'WON') {
            updateData.closedAt = now;
            updateData.lostReasonId = null;
          } else {
            updateData.closedAt = null;
            updateData.lostReasonId = null;
            updateData.lostAtStage = null;
          }

          return prisma.deal.update({
            where: { id: deal.id },
            data: updateData,
          });
        })
      );

      // Log activities for each deal (fire-and-forget)
      Promise.all(
        deals.map((deal) =>
          logActivity({
            type: 'STATUS_CHANGE',
            content: `Status alterado para ${status} (em massa)`,
            userId: actingUserId,
            dealId: deal.id,
            contactId: deal.contactId ?? undefined,
            metadata: { fromStatus: deal.status, toStatus: status, batch: true },
          })
        )
      ).catch((err) => console.error('[deals] Batch activity log error:', err));

      // Dispatch webhooks for each deal (fire-and-forget)
      if (status === 'LOST') {
        deals.forEach((deal) => {
          dispatchWebhook('deal.lost', {
            dealId: deal.id,
            dealTitle: deal.title,
            lostAtStage: deal.stage.name,
            lostReasonId,
            closedAt: now,
            batch: true,
          });
        });
      }

      res.json({ data: { updated: results.length, dealIds: results.map((r) => r.id) } });
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
      const actingUserId = (req as any).user?.id ?? existing.userId;
      await logActivity({
        type: 'STATUS_CHANGE',
        content: `Status alterado para ${status}`,
        userId: actingUserId,
        dealId: existing.id,
        contactId: existing.contactId ?? undefined,
        metadata: { fromStatus: existing.status, toStatus: status },
      });

      // Dispatch outgoing webhook
      if (status === 'WON') {
        dispatchWebhook('deal.won', { dealId: deal.id, dealTitle: deal.title, closedAt: deal.closedAt });

        // Send sale notifications (email + WhatsApp) — fire-and-forget
        const products = await prisma.dealProduct.findMany({
          where: { dealId: deal.id },
          include: { product: { select: { name: true } } },
        });
        const productNames = products.map(p => p.product.name).join(', ');

        sendSaleNotifications({
          dealId: deal.id,
          dealTitle: deal.title,
          clientName: deal.contact?.name || deal.organization?.name || deal.title,
          productName: productNames || undefined,
          monthlyValue: deal.value ? Number(deal.value) : undefined,
          closedAt: deal.closedAt ? new Date(deal.closedAt as unknown as string) : new Date(),
        }).catch(err => console.error('[deals] Sale notification error:', err));
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

// GET /deals/:id/whatsapp-conversation — Check if deal has a linked WhatsApp conversation
router.get('/:id/whatsapp-conversation', async (req, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        contact: { select: { id: true, phone: true } },
        dealContacts: { include: { contact: { select: { id: true, phone: true } } } },
      },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Resolve contact: primary or first dealContact with phone
    const contact = deal.contact?.phone
      ? deal.contact
      : deal.dealContacts?.find((dc) => dc.contact.phone)?.contact ?? null;

    if (!contact?.phone) {
      return res.json({ data: null });
    }

    // Try by contactId first
    let conversation = await prisma.whatsAppConversation.findFirst({
      where: { contactId: contact.id },
      include: { _count: { select: { messages: true } } },
    });

    // Fallback: try by normalized phone
    if (!conversation) {
      const normalized = normalizePhone(contact.phone);
      conversation = await prisma.whatsAppConversation.findUnique({
        where: { phone: normalized },
        include: { _count: { select: { messages: true } } },
      });
    }

    if (!conversation) return res.json({ data: null });

    res.json({
      data: {
        conversationId: conversation.id,
        phone: conversation.phone,
        status: conversation.status,
        isActive: conversation.isActive,
        lastMessageAt: conversation.lastMessageAt,
        messageCount: conversation._count.messages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /deals/:id/start-conversation — Create conversation without sending any message
router.post('/:id/start-conversation', async (req, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        dealContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
      },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Resolve contact: primary contact or first dealContact with phone
    const contact = deal.contact?.phone
      ? deal.contact
      : deal.dealContacts?.find((dc) => dc.contact.phone)?.contact ?? null;

    if (!contact?.phone) return res.status(400).json({ error: 'Nenhum contato com telefone vinculado a esta negociação' });

    const normalized = normalizePhone(contact.phone);

    // Find or create conversation (empty — no messages sent)
    let conversation = await prisma.whatsAppConversation.findUnique({
      where: { phone: normalized },
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phone: normalized,
          pushName: contact.name || null,
          contactId: contact.id,
        },
      });
    }

    res.status(201).json({ data: { conversationId: conversation.id, phone: conversation.phone } });
  } catch (err) {
    next(err);
  }
});

// POST /deals/:id/activate-bot — Trigger SDR IA bot for this deal
router.post('/:id/activate-bot', async (req, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { contact: { select: { id: true, phone: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (!deal.contactId) return res.status(400).json({ error: 'Deal has no contact' });
    if (!deal.contact?.phone) return res.status(400).json({ error: 'Contact has no phone number' });

    await activateSdrIa(deal.contactId, deal.id);

    const normalized = normalizePhone(deal.contact.phone);
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { phone: normalized },
    });

    res.status(200).json({ data: { conversationId: conversation?.id ?? null } });
  } catch (err) {
    next(err);
  }
});


// POST /api/deals/trigger-pending-sdr — dispara SDR IA para todos os leads ainda não chamados
// TEMPORÁRIO — remover após chamar os leads pendentes
// NOTA: busca por ausência de mensagem BOT (não por sdrActivatedAt) porque o guard
// de idempotência grava sdrActivatedAt ANTES da checagem de horário, então leads
// bloqueados pelo horário já têm sdrActivatedAt preenchido mas nunca receberam msg.
router.post('/trigger-pending-sdr', async (req, res, next) => {
  try {
    const defaultPipeline = await prisma.pipeline.findFirst({
      where: { isDefault: true },
      include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
    });

    if (!defaultPipeline || defaultPipeline.stages.length === 0) {
      return res.status(400).json({ error: 'Nenhum pipeline padrão encontrado' });
    }

    const firstStageId = defaultPipeline.stages[0].id;

    // Busca deals na 1ª etapa sem mensagem BOT enviada ao contato
    const dealsInFirstStage = await prisma.deal.findMany({
      where: {
        stageId: firstStageId,
        status: 'OPEN',
        contact: { phone: { not: null } },
      },
      include: { contact: { select: { id: true, phone: true } } },
    });

    const results: { dealId: string; phone: string; status: string }[] = [];

    for (const deal of dealsInFirstStage) {
      if (!deal.contactId || !deal.contact?.phone) continue;

      const { normalizePhone } = await import('../services/leadQualificationEngine');
      const normalized = normalizePhone(deal.contact.phone);

      // Verifica se já existe mensagem BOT para esse contato
      const botMsg = await prisma.whatsAppMessage.findFirst({
        where: { conversation: { phone: normalized }, sender: 'BOT' },
      });

      if (botMsg) {
        results.push({ dealId: deal.id, phone: normalized, status: 'já chamado — pulado' });
        continue;
      }

      // Reseta sdrActivatedAt para permitir re-disparo pelo guard de idempotência
      await prisma.deal.update({ where: { id: deal.id }, data: { sdrActivatedAt: null } });

      try {
        await activateSdrIa(deal.contactId, deal.id);
        results.push({ dealId: deal.id, phone: normalized, status: 'triggered' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ dealId: deal.id, phone: normalized, status: `error: ${msg}` });
      }
    }

    const triggered = results.filter(r => r.status === 'triggered').length;
    res.json({ total: dealsInFirstStage.length, triggered, results });
  } catch (err) {
    next(err);
  }
});

// POST /api/deals/:id/manual-meeting — create a manual meeting for a deal
router.post('/:id/manual-meeting', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        contact: { select: { id: true, name: true, email: true, phone: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!deal) return next(createError('Deal not found', 404));

    const { startTime, duration, eventType, notes } = req.body;
    if (!startTime) return next(createError('startTime is required', 400));

    const start = new Date(startTime);
    const durationMin = parseInt(duration) || 30;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    // Create CalendlyEvent with synthetic ID for manual meetings
    const meeting = await prisma.calendlyEvent.create({
      data: {
        calendlyEventId: `manual-${deal.id}-${Date.now()}`,
        eventType: eventType || 'Reunião Manual',
        inviteeEmail: deal.contact?.email || '',
        inviteeName: deal.contact?.name || null,
        hostEmail: deal.user?.email || null,
        hostName: deal.user?.name || null,
        startTime: start,
        endTime: end,
        status: 'active',
        contactId: deal.contact?.id || null,
        dealId: deal.id,
      },
    });

    // Schedule event-driven meeting reminders
    scheduleMeetingReminders(meeting.id).catch(console.error);

    // Mark conversation as meetingBooked if exists
    if (deal.contact?.id) {
      await prisma.whatsAppConversation.updateMany({
        where: { contactId: deal.contact.id },
        data: { meetingBooked: true },
      });
    }

    // Create Activity
    await prisma.activity.create({
      data: {
        type: 'MEETING',
        content: `Reunião manual agendada para ${start.toLocaleDateString('pt-BR')} às ${start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} (${durationMin}min)${notes ? ` — ${notes}` : ''}`,
        userId: deal.userId,
        dealId: deal.id,
        contactId: deal.contact?.id || null,
        metadata: {
          source: 'manual',
          meetingId: meeting.id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          duration: durationMin,
          eventType: meeting.eventType,
          notes: notes || null,
        },
      },
    });

    res.status(201).json({ data: meeting });
  } catch (err) {
    next(err);
  }
});

// GET /api/deals/:id/scheduled-tasks — Get scheduled follow-ups and reminders for a deal
router.get('/:id/scheduled-tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tasks = await prisma.scheduledFollowUp.findMany({
      where: { dealId: req.params.id },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json({ data: tasks });
  } catch (err) {
    next(err);
  }
});

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
