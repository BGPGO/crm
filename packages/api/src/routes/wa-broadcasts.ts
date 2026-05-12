/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Broadcast API — WhatsApp Cloud API v2 (módulo WA unificado)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rotas autenticadas para gerenciar broadcasts (campanhas via template).
 * Usa modelos WaBroadcast / WaBroadcastContact + envio via WaMessageService.
 *
 *   GET    /                    — Listar broadcasts com paginacao
 *   POST   /                    — Criar broadcast
 *   GET    /:id                 — Broadcast individual com stats
 *   POST   /:id/start           — Iniciar execucao do broadcast
 *   POST   /:id/pause           — Pausar broadcast
 *   GET    /:id/contacts        — Listar contatos com status
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { normalizePhone } from '../utils/phoneNormalize';

const router = Router();

/** Random delay between sends (5-10s) — templates aprovados pelo Meta são seguros para bulk */
function randomBroadcastDelay(): Promise<void> {
  const delayMs = 5000 + Math.random() * 5000; // 5-10s
  console.log(`[wa-broadcast] Aguardando ${Math.round(delayMs / 1000)}s ate proximo envio...`);
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

/** Circuit breaker — pausa broadcast apos erros consecutivos */
const MAX_CONSECUTIVE_ERRORS = 5;

/** Track active broadcast loops to prevent concurrent execution */
const activeBroadcastLoops = new Set<string>();

/**
 * Resolve CRM Contact by normalized phone.
 * Phones in Contact table are stored in raw format (e.g. "15 98821-4393"),
 * so we strip formatting and compare digits only.
 */
async function findContactByPhone(normalizedPhone: string): Promise<{ id: string; name: string | null } | null> {
  // Try exact normalized match first (fast path for phones already normalized)
  const exactMatch = await prisma.contact.findFirst({
    where: { phone: normalizedPhone },
    select: { id: true, name: true },
  });
  if (exactMatch) return exactMatch;

  // Extract DDD + last 4 digits for fuzzy search (works even with dashes/spaces)
  const ddd = normalizedPhone.slice(2, 4);
  const last4 = normalizedPhone.slice(-4);

  const candidates = await prisma.contact.findMany({
    where: {
      phone: { not: null, contains: last4 },
    },
    select: { id: true, name: true, phone: true },
  });

  // Normalize each candidate and compare
  for (const c of candidates) {
    if (!c.phone) continue;
    const cNormalized = normalizePhone(c.phone);
    if (cNormalized === normalizedPhone) return { id: c.id, name: c.name };
  }

  return null;
}

// ─── GET /api/wa/broadcasts — List broadcasts with pagination ───────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.waBroadcast.count({ where }),
      prisma.waBroadcast.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { id: true, name: true, status: true, body: true } },
          segment: { select: { id: true, name: true } },
          stage: { select: { id: true, name: true } },
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

// ─── POST /api/wa/broadcasts — Create broadcast ────────────────────────────

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, templateId, templateParams, segmentId, stageId, stageIds, dealStatus } = req.body;

    if (!name) return next(createError('name is required', 400));
    if (!templateId) return next(createError('templateId is required (Meta exige template para bulk)', 400));

    // Validate template exists and is approved
    const template = await prisma.cloudWaTemplate.findUnique({ where: { id: templateId } });
    if (!template) return next(createError('Template not found', 404));
    if (template.status !== 'APPROVED') {
      return next(createError(`Template "${template.name}" nao esta aprovado (status: ${template.status})`, 400));
    }

    // Bloqueio: criação de broadcast MARKETING bloqueada quando qualityRating != GREEN
    if (template.category === 'MARKETING') {
      const config = await prisma.cloudWaConfig.findFirst({
        select: { qualityRating: true },
      });
      if (config?.qualityRating !== 'GREEN') {
        return res.status(403).json({
          error: 'QUALITY_RATING_NOT_GREEN',
          message: `Bloqueado: quality rating está em ${config?.qualityRating || 'desconhecido'}. Broadcasts MARKETING só podem ser criados quando quality estiver GREEN.`,
        });
      }
    }

    // Resolve contacts from segment or stage(s)
    let phoneNumbers: string[] = [];

    // Normalize stage IDs: support both single stageId and stageIds array
    const resolvedStageIds: string[] = Array.isArray(stageIds) && stageIds.length > 0
      ? stageIds
      : stageId ? [stageId] : [];

    const resolvedDealStatus: string = dealStatus || 'OPEN';

    if (segmentId) {
      const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
      if (!segment) return next(createError('Segment not found', 404));

      const { buildSegmentWhere } = await import('../services/segmentEngine');
      const segmentWhere = buildSegmentWhere(segment.filters as any, segment.brand);

      const contacts = await prisma.contact.findMany({
        where: { ...segmentWhere, phone: { not: null } },
        select: { phone: true, id: true },
      });

      phoneNumbers = contacts
        .map(c => normalizePhone(c.phone!))
        .filter(p => p.trim() !== '');
    } else if (resolvedStageIds.length > 0) {
      const deals = await prisma.deal.findMany({
        where: {
          stageId: { in: resolvedStageIds },
          status: resolvedDealStatus as any,
        },
        include: { contact: { select: { phone: true, id: true } } },
      });

      phoneNumbers = deals
        .map(d => d.contact?.phone)
        .filter((p): p is string => !!p && p.trim() !== '')
        .map(p => normalizePhone(p));
    }

    // Deduplicate
    phoneNumbers = [...new Set(phoneNumbers)];

    if (phoneNumbers.length === 0 && (segmentId || resolvedStageIds.length > 0)) {
      return next(createError('Nenhum contato com telefone encontrado nos filtros selecionados', 422));
    }

    const broadcast = await prisma.waBroadcast.create({
      data: {
        name,
        templateId,
        templateParams: templateParams || null,
        segmentId: segmentId || null,
        stageId: resolvedStageIds[0] || null,
        stageIds: resolvedStageIds.length > 0 ? resolvedStageIds : null,
        dealStatus: resolvedStageIds.length > 0 ? resolvedDealStatus : null,
        totalContacts: phoneNumbers.length,
        createdById: req.user?.id ?? null,
        contacts: {
          create: phoneNumbers.map((phone: string) => ({ phone })),
        },
      },
      include: {
        template: { select: { id: true, name: true, status: true } },
        _count: { select: { contacts: true } },
      },
    });

    res.status(201).json({ data: broadcast });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/broadcasts/:id — Single broadcast with stats ───────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: req.params.id },
      include: {
        template: { select: { id: true, name: true, status: true, body: true, language: true } },
        segment: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
        _count: { select: { contacts: true } },
      },
    });

    if (!broadcast) return next(createError('Broadcast not found', 404));

    // Aggregate contact statuses for live stats
    const [statusCounts, clickedCount] = await Promise.all([
      prisma.waBroadcastContact.groupBy({
        by: ['status'],
        where: { broadcastId: broadcast.id },
        _count: true,
      }),
      prisma.waBroadcastContact.count({
        where: { broadcastId: broadcast.id, clickedAt: { not: null } },
      }),
    ]);

    const stats: Record<string, number> = {};
    for (const row of statusCounts) {
      stats[row.status] = row._count;
    }

    res.json({
      data: {
        ...broadcast,
        clickedCount,
        stats,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/wa/broadcasts/:id/start — Start broadcast execution ─────────

router.post('/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: true,
        template: true,
      },
    });

    if (!broadcast) return next(createError('Broadcast not found', 404));

    if (broadcast.status === 'WA_SENDING') {
      return next(createError('Broadcast ja esta em execucao', 400));
    }

    if (broadcast.status === 'WA_COMPLETED') {
      return next(createError('Broadcast ja foi concluido', 400));
    }

    if (broadcast.contacts.length === 0) {
      return next(createError('Broadcast nao tem contatos', 400));
    }

    if (!broadcast.template) {
      return next(createError('Broadcast nao tem template vinculado', 400));
    }

    if (broadcast.template.status !== 'APPROVED') {
      return next(createError(`Template "${broadcast.template.name}" nao esta aprovado`, 400));
    }

    // Bloqueio: iniciar broadcast MARKETING bloqueado quando qualityRating != GREEN
    if (broadcast.template.category === 'MARKETING') {
      const config = await prisma.cloudWaConfig.findFirst({
        select: { qualityRating: true },
      });
      if (config?.qualityRating !== 'GREEN') {
        return res.status(403).json({
          error: 'QUALITY_RATING_NOT_GREEN',
          message: `Bloqueado: quality rating está em ${config?.qualityRating || 'desconhecido'}. Não é possível iniciar broadcast MARKETING fora de GREEN.`,
        });
      }
    }

    // Prevent concurrent loops for the same broadcast
    if (activeBroadcastLoops.has(broadcast.id)) {
      return next(createError('Broadcast ja tem um loop ativo — aguarde a pausa completar antes de reiniciar', 409));
    }

    // Optimistic lock: only mark SENDING if not already SENDING
    const result = await prisma.waBroadcast.updateMany({
      where: { id: broadcast.id, status: { not: 'WA_SENDING' } },
      data: { status: 'WA_SENDING', startedAt: new Date(), pausedAt: null },
    });

    if (result.count === 0) {
      return next(createError('Broadcast already started by another process', 409));
    }

    const updated = await prisma.waBroadcast.findUnique({ where: { id: broadcast.id } });

    // Execute in background
    activeBroadcastLoops.add(broadcast.id);
    (async () => {
      try {
        const { WaMessageService } = await import('../services/wa/messageService');

        let sentCount = 0;
        let consecutiveErrors = 0;

        // Broadcasts NÃO usam dailyLimitService (budget de automações é separado)

        // Pré-carregar contatos bloqueados pelo cap cross-business da Meta (tag wa-cap-hit)
        const capHitContactIds = new Set(
          (await prisma.contactTag.findMany({
            where: { tag: { name: 'wa-cap-hit' } },
            select: { contactId: true },
          })).map((ct) => ct.contactId)
        );

        // Pré-carregar nomes de templates MARKETING (evita N queries dentro do loop)
        const marketingTemplateRows = await prisma.cloudWaTemplate.findMany({
          where: { category: 'MARKETING' },
          select: { name: true },
        });
        const marketingTemplateNames = marketingTemplateRows.map((t) => t.name);

        for (const contact of broadcast.contacts) {
          // Re-read contact status from DB to prevent duplicate sends on restart
          const freshContact = await prisma.waBroadcastContact.findUnique({
            where: { id: contact.id },
            select: { status: true },
          });
          if (freshContact?.status !== 'WA_BC_PENDING') continue;

          // Re-check broadcast status (might have been paused)
          const current = await prisma.waBroadcast.findUnique({
            where: { id: broadcast.id },
            select: { status: true },
          });
          if (current?.status !== 'WA_SENDING') {
            console.log(`[wa-broadcast] Broadcast ${broadcast.id} nao esta mais em SENDING — parando`);
            break;
          }

          // Skip contacts already marked as phone invalid
          const crmContact = await findContactByPhone(contact.phone);
          if (crmContact) {
            const contactRecord = await prisma.contact.findUnique({
              where: { id: crmContact.id },
              select: { phoneInvalid: true },
            });
            if (contactRecord?.phoneInvalid) {
              await prisma.waBroadcastContact.update({
                where: { id: contact.id },
                data: { status: 'WA_BC_SKIPPED' },
              });
              console.log(`[wa-broadcast] Pulando ${contact.phone} — telefone marcado como invalido`);
              continue;
            }
          }

          // Filtro wa-cap-hit: pular contatos saturados no cap cross-business da Meta
          if (crmContact && capHitContactIds.has(crmContact.id)) {
            await prisma.waBroadcastContact.update({
              where: { id: contact.id },
              data: { status: 'WA_BC_SKIPPED', error: 'wa-cap-hit-blocked' },
            });
            console.log(`[wa-broadcast] Pulando ${contact.phone} — contato tem tag wa-cap-hit (cap-saturado Meta)`);
            continue;
          }

          // Check opt-out ou atendimento humano ativo
          const existingConv = await prisma.waConversation.findUnique({
            where: { phone: contact.phone },
            select: { optedOut: true, needsHumanAttention: true, contactId: true },
          });
          // Fallback: também checa WhatsAppConversation (Z-API) pelo contactId,
          // caso takeover tenha sido ativado na conversa antiga
          let zapHumanAttention = false;
          if (existingConv?.contactId) {
            const zap = await prisma.whatsAppConversation.findFirst({
              where: { contactId: existingConv.contactId },
              select: { needsHumanAttention: true },
            });
            zapHumanAttention = !!zap?.needsHumanAttention;
          }
          const humanAttention = existingConv?.needsHumanAttention || zapHumanAttention;
          if (existingConv?.optedOut || humanAttention) {
            const reason = existingConv?.optedOut ? 'opt-out' : 'atendimento humano';
            await prisma.waBroadcastContact.update({
              where: { id: contact.id },
              data: { status: 'WA_BC_SKIPPED' },
            });
            console.log(`[wa-broadcast] Pulando ${contact.phone} — ${reason}`);
            continue;
          }

          // ── Per-recipient cooldown de 48h para MARKETING templates ─────────────
          if (broadcast.template.category === 'MARKETING') {
            const FORTY_EIGHT_HOURS_AGO = new Date(Date.now() - 48 * 60 * 60 * 1000);
            const lastMarketing = await prisma.waMessage.findFirst({
              where: {
                direction: 'OUTBOUND',
                type: 'TEMPLATE',
                createdAt: { gte: FORTY_EIGHT_HOURS_AGO },
                conversation: { phone: contact.phone },
                templateName: { in: marketingTemplateNames },
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true, templateName: true },
            });

            if (lastMarketing) {
              const holdUntil = new Date(lastMarketing.createdAt.getTime() + 48 * 60 * 60 * 1000);
              await prisma.waBroadcastContact.update({
                where: { id: contact.id },
                data: {
                  status: 'WA_BC_HELD',
                  holdUntil,
                  error: `Cooldown 48h — última MARKETING em ${lastMarketing.createdAt.toISOString()} (${lastMarketing.templateName})`,
                },
              });
              console.log(`[wa-broadcast] HOLD ${contact.phone} até ${holdUntil.toISOString()} (recebeu ${lastMarketing.templateName} <48h)`);
              continue;
            }
          }
          // ────────────────────────────────────────────────────────────────────────

          try {
            // Find or create conversation — linked to CRM Contact
            let conversation = await prisma.waConversation.findUnique({
              where: { phone: contact.phone },
            });

            if (!conversation) {
              // Resolve CRM contact to link the conversation
              const crmContact = await findContactByPhone(contact.phone);
              conversation = await prisma.waConversation.create({
                data: {
                  phone: contact.phone,
                  ...(crmContact ? { contactId: crmContact.id } : {}),
                },
              });
              if (crmContact) {
                console.log(`[wa-broadcast] Conversa ${contact.phone} vinculada ao contato ${crmContact.name} (${crmContact.id})`);
              }
            } else if (!conversation.contactId) {
              // Conversation exists but has no contact link — fix it
              const crmContact = await findContactByPhone(contact.phone);
              if (crmContact) {
                await prisma.waConversation.update({
                  where: { id: conversation.id },
                  data: { contactId: crmContact.id },
                });
                console.log(`[wa-broadcast] Conversa existente ${contact.phone} vinculada ao contato ${crmContact.name}`);
              }
            }

            // Send template — inject tracking URL component if template has URL button
            const templateParams = contact.templateParams || broadcast.templateParams;
            const components = templateParams ? (Array.isArray(templateParams) ? [...templateParams] : [templateParams]) : [];

            // Check if template has URL button with dynamic suffix ({{1}})
            const buttons = broadcast.template!.buttons as Array<{ type: string; url?: string }> | null;
            const hasUrlButton = buttons?.some(b => b.type === 'URL' && b.url?.includes('{{1}}'));
            if (hasUrlButton) {
              // Inject tracking token as URL suffix
              const trackingToken = contact.id;
              const buttonIdx = buttons!.findIndex(b => b.type === 'URL');
              components.push({
                type: 'button',
                sub_type: 'url',
                index: buttonIdx >= 0 ? buttonIdx : 0,
                parameters: [{ type: 'text', text: trackingToken }],
              });
            }

            const msg = await WaMessageService.sendTemplate(
              conversation.id,
              broadcast.template!.name,
              broadcast.template!.language || 'pt_BR',
              components,
              { senderType: 'WA_SYSTEM' },
              { isBroadcast: true },
            );

            await prisma.waBroadcastContact.update({
              where: { id: contact.id },
              data: {
                status: 'WA_BC_SENT',
                sentAt: new Date(),
                waMessageId: msg?.waMessageId || null, // Meta wamid, not Prisma ID
                contactId: conversation.contactId || null,
              },
            });

            // Update broadcast sent count
            await prisma.waBroadcast.update({
              where: { id: broadcast.id },
              data: { sentCount: { increment: 1 } },
            });

            sentCount++;
            consecutiveErrors = 0;

            // Broadcast não registra no dailyLimit (budget separado de automações)
          } catch (err: any) {
            console.error(`[wa-broadcast] Falha ao enviar para ${contact.phone}:`, err);
            const errorMsg = err.message || 'Unknown error';
            await prisma.waBroadcastContact.update({
              where: { id: contact.id },
              data: {
                status: 'WA_BC_FAILED',
                failedAt: new Date(),
                error: errorMsg,
              },
            });

            await prisma.waBroadcast.update({
              where: { id: broadcast.id },
              data: { failedCount: { increment: 1 } },
            });

            // Mark contact as phoneInvalid for undeliverable/invalid number errors
            const isInvalidPhone = /undeliverable|131026|131051|not.+valid|nao.+possui.+whatsapp/i.test(errorMsg);
            if (isInvalidPhone) {
              const invalidContact = await findContactByPhone(contact.phone);
              if (invalidContact) {
                await prisma.contact.update({
                  where: { id: invalidContact.id },
                  data: { phoneInvalid: true, phoneInvalidAt: new Date() },
                });
                console.log(`[wa-broadcast] Contato ${invalidContact.name} (${contact.phone}) marcado como telefone invalido`);
              }
            }

            consecutiveErrors++;

            // Circuit breaker
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.log(`[wa-broadcast] Circuit breaker ativado apos ${MAX_CONSECUTIVE_ERRORS} erros consecutivos. Broadcast pausado.`);
              await prisma.waBroadcast.update({
                where: { id: broadcast.id },
                data: { status: 'WA_PAUSED', pausedAt: new Date() },
              });
              break;
            }
          }

          // Random delay between sends (30-90s)
          await randomBroadcastDelay();
        }

        // Only mark COMPLETED if still in SENDING status
        const finalStatus = await prisma.waBroadcast.findUnique({
          where: { id: broadcast.id },
          select: { status: true },
        });
        if (finalStatus?.status === 'WA_SENDING') {
          await prisma.waBroadcast.update({
            where: { id: broadcast.id },
            data: { status: 'WA_COMPLETED', completedAt: new Date() },
          });
        }

        console.log(`[wa-broadcast] Concluido: ${broadcast.id} — ${sentCount} enviadas`);
      } catch (err) {
        console.error(`[wa-broadcast] Broadcast ${broadcast.id} falhou:`, err);
        await prisma.waBroadcast.update({
          where: { id: broadcast.id },
          data: { status: 'WA_PAUSED', pausedAt: new Date() },
        });
      } finally {
        activeBroadcastLoops.delete(broadcast.id);
      }
    })();

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/wa/broadcasts/:id/pause — Pause broadcast ───────────────────

router.post('/:id/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: req.params.id },
    });

    if (!broadcast) return next(createError('Broadcast not found', 404));

    if (broadcast.status !== 'WA_SENDING') {
      return next(createError('Broadcast nao esta em execucao', 400));
    }

    const updated = await prisma.waBroadcast.update({
      where: { id: req.params.id },
      data: { status: 'WA_PAUSED', pausedAt: new Date() },
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/wa/broadcasts/:id/contacts — List contacts with status ────────

router.get('/:id/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id: req.params.id },
    });
    if (!broadcast) return next(createError('Broadcast not found', 404));

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const { status } = req.query;
    const where: Record<string, unknown> = { broadcastId: broadcast.id };
    if (status) where.status = status as string;

    const [total, data] = await Promise.all([
      prisma.waBroadcastContact.count({ where }),
      prisma.waBroadcastContact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
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

export default router;
