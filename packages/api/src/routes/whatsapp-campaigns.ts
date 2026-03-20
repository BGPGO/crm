import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { EvolutionApiClient } from '../services/evolutionApiClient';
import { isBusinessHours, msUntilNextBusinessHour } from '../utils/sendingWindow';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If 10-11 digits (BR without country code), prepend 55
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}

/** Delay não-uniforme (log-normal aproximado) — simula comportamento humano */
function randomDelay(): Promise<void> {
  const roll = Math.random();
  let delayMs: number;
  if (roll < 0.6) {
    delayMs = 25000 + Math.random() * 20000; // 25-45s (~60%)
  } else if (roll < 0.9) {
    delayMs = 45000 + Math.random() * 30000; // 45-75s (~30%)
  } else {
    delayMs = 75000 + Math.random() * 45000; // 75-120s (~10% pausa natural)
  }
  console.log(`[campaign] Aguardando ${Math.round(delayMs / 1000)}s até próximo envio...`);
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

/** Circuit breaker — pausa campanha após erros consecutivos */
const MAX_CONSECUTIVE_ERRORS = 5;

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

// GET /api/whatsapp-campaigns/preview-count — Count contacts that match stage filters
router.get('/preview-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stageId, dealStatus, valueMin, valueMax, createdFrom, createdTo, segmentId } = req.query;

    if (segmentId) {
      const segment = await prisma.segment.findUnique({ where: { id: segmentId as string } });
      if (!segment) return res.json({ count: 0 });
      const { buildSegmentWhere } = await import('../services/segmentEngine');
      const segmentWhere = buildSegmentWhere(segment.filters as any);
      const count = await prisma.contact.count({
        where: { ...segmentWhere, phone: { not: null } },
      });
      return res.json({ count });
    }

    if (!stageId) return res.json({ count: 0 });

    const dealWhere: Record<string, unknown> = { stageId: stageId as string };

    if (dealStatus) dealWhere.status = dealStatus as string;

    if (valueMin || valueMax) {
      const vf: Record<string, number> = {};
      if (valueMin) vf.gte = parseFloat(valueMin as string);
      if (valueMax) vf.lte = parseFloat(valueMax as string);
      dealWhere.value = vf;
    }

    if (createdFrom || createdTo) {
      const df: Record<string, Date> = {};
      if (createdFrom) df.gte = new Date(createdFrom as string);
      if (createdTo) df.lte = new Date((createdTo as string) + 'T23:59:59.999Z');
      dealWhere.createdAt = df;
    }

    const deals = await prisma.deal.findMany({
      where: dealWhere,
      include: { contact: { select: { phone: true } } },
    });

    const phones = new Set(
      deals
        .map(d => d.contact?.phone)
        .filter((p): p is string => !!p && p.trim() !== '')
        .map(p => normalizePhone(p))
    );

    res.json({ count: phones.size });
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

    // Campanhas só iniciam em horário comercial (9h–18h seg–sex)
    if (!isBusinessHours()) {
      const msUntil = msUntilNextBusinessHour();
      const nextHour = new Date(Date.now() + msUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      return next(createError(
        `Campanhas só podem ser enviadas em horário comercial (9h–18h, seg–sex). Próximo horário disponível: ${nextHour}`,
        400
      ));
    }

    // Lock otimista: só marca RUNNING se não estiver já RUNNING (evita dois processos paralelos)
    const result = await prisma.whatsAppCampaign.updateMany({
      where: { id: campaign.id, status: { not: 'RUNNING' } },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    if (result.count === 0) {
      return next(createError('Campaign already started by another process', 409));
    }

    const updated = await prisma.whatsAppCampaign.findUnique({ where: { id: campaign.id } });

    // Send messages in background with random delay and business hours respect
    (async () => {
      try {
        const client = await EvolutionApiClient.fromConfig();
        let sentCount = 0;
        let consecutiveErrors = 0;

        // Lote variável — tamanho aleatório regenerado a cada ciclo
        let currentBatchSize = 12 + Math.floor(Math.random() * 14); // 12-25
        let batchCount = 0;

        // Import dinâmico do dailyLimitService (criado pelo Squad C)
        let dailyLimit: { canSend: () => Promise<boolean>; registerSent: (source: 'campaign' | 'followUp' | 'reminder') => Promise<void>; getRemainingToday: () => Promise<number> } | null = null;
        try {
          dailyLimit = await import('../services/dailyLimitService');
        } catch {
          console.log('[campaign] dailyLimitService não disponível — prosseguindo sem limite diário');
        }

        for (const contact of campaign.contacts) {
          if (contact.status !== 'PENDING') continue;

          // Verificar limite diário antes de cada mensagem
          if (dailyLimit) {
            if (!await dailyLimit.canSend()) {
              const remaining = await dailyLimit.getRemainingToday();
              console.log(`[campaign] Limite diário atingido (${remaining} restantes). Pausando campanha.`);
              await prisma.whatsAppCampaign.update({
                where: { id: campaign.id },
                data: { status: 'PAUSED' },
              });
              break;
            }
          }

          // Buscar contatos opt-out em tempo real (pode ter saído durante o envio)
          const conv = await prisma.whatsAppConversation.findUnique({
            where: { phone: contact.phone },
            select: { optedOut: true },
          });
          if (conv?.optedOut) {
            await prisma.whatsAppCampaignContact.update({
              where: { id: contact.id },
              data: { status: 'SKIPPED' },
            });
            console.log(`[campaign] Pulando ${contact.phone} — opt-out`);
            continue;
          }

          // Verificar horário comercial antes de cada mensagem
          if (!isBusinessHours()) {
            const msUntil = msUntilNextBusinessHour();
            console.log(`[campaign] Fora do horário comercial — aguardando ${Math.round(msUntil / 60000)}min`);
            await new Promise(resolve => setTimeout(resolve, msUntil));
          }

          try {
            await client.sendText(contact.phone, campaign.message);
            await prisma.whatsAppCampaignContact.update({
              where: { id: contact.id },
              data: { status: 'SENT', sentAt: new Date() },
            });
            sentCount++;
            batchCount++;
            consecutiveErrors = 0;

            // Registrar envio no limite diário
            if (dailyLimit) {
              await dailyLimit.registerSent('campaign');
            }
          } catch (err) {
            console.error(`[campaign] Falha ao enviar para ${contact.phone}:`, err);
            await prisma.whatsAppCampaignContact.update({
              where: { id: contact.id },
              data: { status: 'ERROR' },
            });
            consecutiveErrors++;

            // Circuit breaker — pausa campanha após erros consecutivos
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.log(`[campaign] Circuit breaker ativado após ${MAX_CONSECUTIVE_ERRORS} erros consecutivos. Campanha pausada.`);
              await prisma.whatsAppCampaign.update({
                where: { id: campaign.id },
                data: { status: 'PAUSED' },
              });
              break;
            }
          }

          // Pausa longa variável a cada lote (comportamento humano)
          if (sentCount > 0 && batchCount >= currentBatchSize) {
            const pauseMs = (3 + Math.random() * 7) * 60 * 1000; // 3-10 min
            console.log(`[campaign] Pausa de ${Math.round(pauseMs / 60000)}min após ${batchCount} mensagens...`);
            await new Promise(resolve => setTimeout(resolve, pauseMs));
            batchCount = 0;
            currentBatchSize = 12 + Math.floor(Math.random() * 14); // novo tamanho
          } else {
            // Delay aleatório entre mensagens
            await randomDelay();
          }
        }

        // Só marca COMPLETED se não foi pausado pelo circuit breaker ou limite diário
        const current = await prisma.whatsAppCampaign.findUnique({
          where: { id: campaign.id },
          select: { status: true },
        });
        if (current?.status === 'RUNNING') {
          await prisma.whatsAppCampaign.update({
            where: { id: campaign.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
        }
        console.log(`[campaign] Concluída: ${campaign.id} — ${sentCount} enviadas`);
      } catch (err) {
        console.error(`[campaign] Campanha ${campaign.id} falhou:`, err);
        await prisma.whatsAppCampaign.update({
          where: { id: campaign.id },
          data: { status: 'PAUSED' },
        });
      }
    })();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * Recovery de campanhas RUNNING após restart do servidor.
 * Marca como PAUSED (não COMPLETED) para indicar interrupção inesperada.
 */
export async function recoverStuckCampaigns(): Promise<void> {
  const stuck = await prisma.whatsAppCampaign.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, name: true },
  });

  if (stuck.length === 0) return;

  await prisma.whatsAppCampaign.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'PAUSED' },
  });

  console.log(`[campaign] Recovery: ${stuck.length} campanha(s) RUNNING marcada(s) como PAUSED — ${stuck.map(c => c.name).join(', ')}`);
}

export default router;
