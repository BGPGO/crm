/**
 * Loop de execução de broadcast WABA — extraído da rota POST /:id/start
 * pra permitir disparo via script (Coolify Scheduled Task, ad-hoc, etc).
 *
 * Pré-requisito: o caller já transicionou status pra WA_SENDING (optimistic lock).
 * Esta função APENAS itera os contatos PENDING e marca o broadcast como COMPLETED
 * (ou PAUSED em caso de circuit breaker / erro fatal).
 *
 * Mesma lógica de proteções da rota: cooldown 24h MARKETING, opt-out, atendimento
 * humano, wa-cap-hit, phoneInvalid, circuit breaker após 5 erros consecutivos.
 */

import prisma from '../../lib/prisma';
import { normalizePhone } from '../../utils/phoneNormalize';
import { buildTemplateHeaderComponent } from '../../utils/templateHeaderBuilder';

const MAX_CONSECUTIVE_ERRORS = 5;

function randomBroadcastDelay(): Promise<void> {
  const delayMs = 5000 + Math.random() * 5000; // 5-10s
  console.log(`[broadcastExecutor] Aguardando ${Math.round(delayMs / 1000)}s ate proximo envio...`);
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function findContactByPhone(normalizedPhone: string): Promise<{ id: string; name: string | null } | null> {
  const exactMatch = await prisma.contact.findFirst({
    where: { phone: normalizedPhone },
    select: { id: true, name: true },
  });
  if (exactMatch) return exactMatch;

  const last4 = normalizedPhone.slice(-4);
  const candidates = await prisma.contact.findMany({
    where: { phone: { not: null, contains: last4 } },
    select: { id: true, name: true, phone: true },
  });

  for (const c of candidates) {
    if (!c.phone) continue;
    if (normalizePhone(c.phone) === normalizedPhone) return { id: c.id, name: c.name };
  }
  return null;
}

export interface BroadcastLoopResult {
  sentCount: number;
  finalStatus: string;
}

/**
 * Roda o loop de envio do broadcast (síncrono, com delays de 5-10s entre envios).
 * Assume que o broadcast já está em status WA_SENDING.
 *
 * Para 215 contatos com delay médio de 7.5s ≈ 27 min de execução.
 */
export async function runBroadcastLoop(broadcastId: string): Promise<BroadcastLoopResult> {
  const broadcast = await prisma.waBroadcast.findUnique({
    where: { id: broadcastId },
    include: { contacts: true, template: true },
  });
  if (!broadcast) throw new Error(`Broadcast ${broadcastId} não encontrado`);
  if (!broadcast.template) throw new Error(`Broadcast ${broadcastId} sem template`);

  const { WaMessageService } = await import('./messageService');

  let sentCount = 0;
  let consecutiveErrors = 0;

  // Pré-carregar contatos bloqueados pelo cap cross-business da Meta
  const capHitContactIds = new Set(
    (await prisma.contactTag.findMany({
      where: { tag: { name: 'wa-cap-hit' } },
      select: { contactId: true },
    })).map((ct) => ct.contactId)
  );

  const marketingTemplateRows = await prisma.cloudWaTemplate.findMany({
    where: { category: 'MARKETING' },
    select: { name: true },
  });
  const marketingTemplateNames = marketingTemplateRows.map((t) => t.name);

  for (const contact of broadcast.contacts) {
    const freshContact = await prisma.waBroadcastContact.findUnique({
      where: { id: contact.id },
      select: { status: true },
    });
    if (freshContact?.status !== 'WA_BC_PENDING') continue;

    const current = await prisma.waBroadcast.findUnique({
      where: { id: broadcast.id },
      select: { status: true },
    });
    if (current?.status !== 'WA_SENDING') {
      console.log(`[broadcastExecutor] Broadcast ${broadcast.id} nao esta mais em SENDING — parando`);
      break;
    }

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
        console.log(`[broadcastExecutor] Pulando ${contact.phone} — telefone marcado como invalido`);
        continue;
      }
    }

    if (crmContact && capHitContactIds.has(crmContact.id)) {
      await prisma.waBroadcastContact.update({
        where: { id: contact.id },
        data: { status: 'WA_BC_SKIPPED', error: 'wa-cap-hit-blocked' },
      });
      console.log(`[broadcastExecutor] Pulando ${contact.phone} — wa-cap-hit`);
      continue;
    }

    const existingConv = await prisma.waConversation.findUnique({
      where: { phone: contact.phone },
      select: { optedOut: true, needsHumanAttention: true, contactId: true },
    });
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
      console.log(`[broadcastExecutor] Pulando ${contact.phone} — ${reason}`);
      continue;
    }

    // Cooldown 24h MARKETING
    if (broadcast.template.category === 'MARKETING') {
      const MARKETING_COOLDOWN_MS = 24 * 60 * 60 * 1000;
      const cooldownStart = new Date(Date.now() - MARKETING_COOLDOWN_MS);
      const lastMarketing = await prisma.waMessage.findFirst({
        where: {
          direction: 'OUTBOUND',
          type: 'TEMPLATE',
          createdAt: { gte: cooldownStart },
          conversation: { phone: contact.phone },
          templateName: { in: marketingTemplateNames },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, templateName: true },
      });

      if (lastMarketing) {
        const holdUntil = new Date(lastMarketing.createdAt.getTime() + MARKETING_COOLDOWN_MS);
        await prisma.waBroadcastContact.update({
          where: { id: contact.id },
          data: {
            status: 'WA_BC_HELD',
            holdUntil,
            error: `Cooldown 24h — última MARKETING em ${lastMarketing.createdAt.toISOString()} (${lastMarketing.templateName})`,
          },
        });
        console.log(`[broadcastExecutor] HOLD ${contact.phone} até ${holdUntil.toISOString()}`);
        continue;
      }
    }

    try {
      let conversation = await prisma.waConversation.findUnique({
        where: { phone: contact.phone },
      });

      if (!conversation) {
        const crm = await findContactByPhone(contact.phone);
        conversation = await prisma.waConversation.create({
          data: {
            phone: contact.phone,
            ...(crm ? { contactId: crm.id } : {}),
          },
        });
      } else if (!conversation.contactId) {
        const crm = await findContactByPhone(contact.phone);
        if (crm) {
          await prisma.waConversation.update({
            where: { id: conversation.id },
            data: { contactId: crm.id },
          });
        }
      }

      const explicitParams = contact.templateParams || broadcast.templateParams;
      const components: any[] = [];

      const headerComponent = buildTemplateHeaderComponent({
        headerType: broadcast.template!.headerType,
        headerContent: broadcast.template!.headerContent,
      });
      if (headerComponent) components.push(headerComponent);

      if (explicitParams) {
        if (Array.isArray(explicitParams)) components.push(...explicitParams);
        else components.push(explicitParams);
      } else {
        const variableMapping = (broadcast.template as any).variableMapping;
        if (Array.isArray(variableMapping) && variableMapping.length > 0) {
          const { resolveTemplateVariables } = await import('../../utils/templateVariableResolver');
          const resolvedContactId = contact.contactId || crmContact?.id || null;
          const resolved = await resolveTemplateVariables(
            variableMapping,
            { contactId: resolvedContactId, dealId: null },
          );
          if (resolved.missingVars.length > 0) {
            const missing = resolved.missingVars.map(v => `${v.var}=${v.source}`).join(', ');
            await prisma.waBroadcastContact.update({
              where: { id: contact.id },
              data: {
                status: 'WA_BC_SKIPPED',
                error: `Variáveis não resolvidas: ${missing}`,
              },
            });
            console.log(`[broadcastExecutor] SKIP ${contact.phone} — variáveis não resolvidas: ${missing}`);
            continue;
          }
          if (resolved.parameters.length > 0) {
            components.push({ type: 'body', parameters: resolved.parameters });
          }
        }
      }

      const buttons = broadcast.template!.buttons as Array<{ type: string; url?: string }> | null;
      const hasUrlButton = buttons?.some(b => b.type === 'URL' && b.url?.includes('{{1}}'));
      if (hasUrlButton) {
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
        conversation!.id,
        broadcast.template!.name,
        broadcast.template!.language || 'pt_BR',
        components,
        { senderType: 'WA_SYSTEM' as any },
        { isBroadcast: true },
      );

      await prisma.waBroadcastContact.update({
        where: { id: contact.id },
        data: {
          status: 'WA_BC_SENT',
          sentAt: new Date(),
          waMessageId: msg?.waMessageId || null,
          contactId: conversation!.contactId || null,
        },
      });

      await prisma.waBroadcast.update({
        where: { id: broadcast.id },
        data: { sentCount: { increment: 1 } },
      });

      sentCount++;
      consecutiveErrors = 0;
    } catch (err: any) {
      console.error(`[broadcastExecutor] Falha ao enviar para ${contact.phone}:`, err);
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

      const isInvalidPhone = /undeliverable|131026|131051|not.+valid|nao.+possui.+whatsapp/i.test(errorMsg);
      if (isInvalidPhone) {
        const invalidContact = await findContactByPhone(contact.phone);
        if (invalidContact) {
          await prisma.contact.update({
            where: { id: invalidContact.id },
            data: { phoneInvalid: true, phoneInvalidAt: new Date() },
          });
        }
      }

      consecutiveErrors++;

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.log(`[broadcastExecutor] Circuit breaker (${MAX_CONSECUTIVE_ERRORS} erros consecutivos). Pausando.`);
        await prisma.waBroadcast.update({
          where: { id: broadcast.id },
          data: { status: 'WA_PAUSED', pausedAt: new Date() },
        });
        break;
      }
    }

    await randomBroadcastDelay();
  }

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

  console.log(`[broadcastExecutor] Concluido: ${broadcast.id} — ${sentCount} enviadas`);
  return { sentCount, finalStatus: finalStatus?.status || 'unknown' };
}
