import prisma from '../lib/prisma';
import { getAIResponse, sendBotMessages } from './whatsappBot';
import { EvolutionApiClient } from './evolutionApiClient';
import { MessageSender } from '@prisma/client';

// ─── Idempotency Map ─────────────────────────────────────────────────────────

const pendingTimers = new Map<string, NodeJS.Timeout>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  // If 11 digits (DDD + 9-digit number), add Brazil country code 55
  if (digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function buildCampaignContext(params: {
  contactName: string;
  campaignName?: string | null;
  sourceName?: string | null;
  landingPage?: string | null;
}): string {
  return `CONTEXTO DO LEAD (use para personalizar a primeira abordagem):
- Nome: ${params.contactName}
- Campanha: ${params.campaignName || 'Não identificada'}
- Fonte: ${params.sourceName || 'Não identificada'}
- Página de entrada: ${params.landingPage || 'Não identificada'}
- Este lead acabou de se cadastrar e ainda NÃO agendou reunião.
- Sua missão: iniciar a conversa de forma natural, usar o contexto para criar rapport, e direcionar para o agendamento.
- Esta é a PRIMEIRA mensagem — não há histórico. Comece com uma saudação personalizada.`;
}

// ─── Calendly Check ──────────────────────────────────────────────────────────

async function checkCalendlyForContact(email: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const event = await prisma.calendlyEvent.findFirst({
    where: {
      inviteeEmail: { equals: email, mode: 'insensitive' },
      status: 'active',
      createdAt: { gte: since },
    },
  });
  return event !== null;
}

// ─── Activate SDR IA ─────────────────────────────────────────────────────────

async function activateSdrIa(contactId: string, dealId: string): Promise<void> {
  console.log(`[LeadQualification] Ativando SDR IA para contact=${contactId} deal=${dealId}`);

  // 1. Load contact
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    console.warn(`[LeadQualification] Contato ${contactId} não encontrado`);
    return;
  }

  // 2. Check phone
  if (!contact.phone) {
    console.warn(`[LeadQualification] Contato ${contactId} sem telefone — SDR IA não ativada`);
    return;
  }

  // 3. Load lead tracking (most recent)
  const tracking = await prisma.leadTracking.findFirst({
    where: { contactId },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Load deal with source, campaign and stage
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { source: true, campaign: true, stage: true },
  });

  if (!deal) {
    console.warn(`[LeadQualification] Deal ${dealId} não encontrado`);
    return;
  }

  // 5. Load WhatsApp config
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config) {
    console.warn('[LeadQualification] WhatsAppConfig não encontrada');
    return;
  }

  // 6. Check if bot is enabled
  if (!config.botEnabled) {
    console.log('[LeadQualification] Bot desabilitado — SDR IA não ativada');
    return;
  }

  // 6b. Check if SDR auto message is enabled
  if (!config.sdrAutoMessageEnabled) {
    console.log('[LeadQualification] Mensagem automática SDR desabilitada — SDR IA não ativada');
    return;
  }

  // 7. Build context string — prefer CampaignContext from DB (with trigger matching)
  let contextString: string;

  // Try to load campaign-specific context from DB
  let campaignContext = deal.campaignId
    ? await prisma.campaignContext.findUnique({ where: { campaignId: deal.campaignId } })
    : null;

  // If no direct match, try trigger-based matching
  if (!campaignContext) {
    const allContexts = await prisma.campaignContext.findMany({
      include: { campaign: { select: { name: true } } },
    });

    const fieldsToMatch = [
      deal.campaign?.name,
      tracking?.utmCampaign,
      tracking?.utmSource,
      tracking?.landingPage,
      deal.source?.name,
    ].filter(Boolean).map(f => f!.toLowerCase());

    campaignContext = allContexts.find(ctx => {
      const triggers = Array.isArray(ctx.triggers) ? (ctx.triggers as string[]) : [];
      if (triggers.length === 0) return false;
      return triggers.some(trigger => {
        const t = trigger.toLowerCase();
        return fieldsToMatch.some(field => field.includes(t) || t.includes(field));
      });
    }) ?? null;
  }

  // Fallback to default context if no campaign-specific one
  if (!campaignContext) {
    campaignContext = await prisma.campaignContext.findFirst({ where: { isDefault: true } });
  }

  if (campaignContext) {
    contextString = `CONTEXTO DO LEAD (use para personalizar a primeira abordagem):
- Nome: ${contact.name}
- Campanha: ${deal.campaign?.name || 'Não identificada'}
- Fonte: ${deal.source?.name || 'Não identificada'}
- Página de entrada: ${tracking?.landingPage || 'Não identificada'}

CONTEXTO DA CAMPANHA:
${campaignContext.context}

- Este lead acabou de se cadastrar e ainda NÃO agendou reunião.
- Sua missão: iniciar a conversa de forma natural, usar o contexto para criar rapport, e direcionar para o agendamento.
- Esta é a PRIMEIRA mensagem — não há histórico. Comece com uma saudação personalizada.`;
  } else {
    contextString = buildCampaignContext({
      contactName: contact.name,
      campaignName: deal.campaign?.name,
      sourceName: deal.source?.name,
      landingPage: tracking?.landingPage,
    });
  }

  console.log(`[LeadQualification] Contexto construído para ${contact.name}`);

  // 8. Find or create WhatsAppConversation by normalized phone
  const normalizedPhone = normalizePhone(contact.phone);

  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone: normalizedPhone },
    include: { followUpState: true },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phone: normalizedPhone,
        pushName: contact.name || null,
        contactId: contact.id,
      },
      include: { followUpState: true },
    });
    console.log(`[LeadQualification] Conversa criada para ${normalizedPhone}`);
  } else {
    console.log(`[LeadQualification] Conversa existente encontrada para ${normalizedPhone}`);
  }

  // 9. Idempotency: check for recent BOT messages in the last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentBotMessage = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: conversation.id,
      sender: MessageSender.BOT,
      createdAt: { gte: fiveMinAgo },
    },
  });

  if (recentBotMessage) {
    console.log(`[LeadQualification] Mensagem BOT recente encontrada — ignorando envio duplicado`);
    return;
  }

  // 10. Call getAIResponse with context (empty history = first message)
  console.log(`[LeadQualification] Gerando resposta IA para ${contact.name}...`);
  const aiReply = await getAIResponse([], contact.name || 'Lead', config.meetingLink, contextString);
  console.log(`[LeadQualification] Resposta IA gerada (${aiReply.length} chars)`);

  // 11. Save WhatsAppMessage (sender: BOT)
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      sender: MessageSender.BOT,
      text: aiReply,
    },
  });

  // Save WhatsAppAIHistory (role: assistant)
  await prisma.whatsAppAIHistory.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: aiReply,
    },
  });

  // 12. Create or update WhatsAppFollowUpState
  const followUpData = {
    lastBotMessageAt: new Date(),
    respondedSinceLastBot: false,
    followUpCount: 0,
  };

  if (conversation.followUpState) {
    await prisma.whatsAppFollowUpState.update({
      where: { id: conversation.followUpState.id },
      data: followUpData,
    });
  } else {
    await prisma.whatsAppFollowUpState.create({
      data: {
        conversationId: conversation.id,
        ...followUpData,
      },
    });
  }

  // Update conversation updatedAt
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  console.log(`[LeadQualification] Registros salvos no banco para conversa ${conversation.id}`);

  // 13. Check Evolution API connection BEFORE attempting to send
  try {
    const client = await EvolutionApiClient.fromConfig();

    // Verify connection is active
    let isConnected = false;
    try {
      const status = await client.getInstanceStatus();
      const state = (status as any)?.instance?.state || (status as any)?.state;
      isConnected = state === 'open' || state === 'connected';
    } catch {
      isConnected = false;
    }

    if (!isConnected) {
      console.warn(`[LeadQualification] WhatsApp não conectado — marcando mensagens como não enviadas`);
      // Mark the bot message we just saved as not delivered
      await prisma.whatsAppMessage.updateMany({
        where: { conversationId: conversation.id, sender: 'BOT' },
        data: { delivered: false },
      });
      // Do NOT set needsHumanAttention — it's a connection issue, not a lead issue
      return;
    }

    await sendBotMessages(client, normalizedPhone, aiReply);
    console.log(`[LeadQualification] Mensagem enviada via Evolution API para ${normalizedPhone}`);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[LeadQualification] Erro ao enviar via Evolution API:`, errMsg);

    // Mark messages as not delivered
    await prisma.whatsAppMessage.updateMany({
      where: { conversationId: conversation.id, sender: 'BOT' },
      data: { delivered: false },
    });

    // Do NOT set needsHumanAttention for connection/send failures
    console.warn(`[LeadQualification] Mensagens marcadas como não enviadas para conversa ${conversation.id}`);
  }

  // 14. Create Activity on deal
  await prisma.activity.create({
    data: {
      type: 'NOTE',
      content: `SDR IA ativada — primeira mensagem enviada via WhatsApp para ${normalizedPhone} (${contact.name}).`,
      userId: deal.userId,
      dealId: deal.id,
      contactId: contact.id,
      metadata: {
        source: 'sdr-ia',
        phone: normalizedPhone,
        campaign: deal.campaign?.name ?? null,
        sourceName: deal.source?.name ?? null,
      },
    },
  });

  console.log(`[LeadQualification] Activity de SDR IA criada no deal ${dealId}`);
}

// ─── Delayed Calendly Check ──────────────────────────────────────────────────

async function delayedCalendlyCheck(contactId: string, dealId: string): Promise<void> {
  console.log(`[LeadQualification] Executando checagem Calendly após delay — contact=${contactId}`);

  // Remove from pending timers map
  pendingTimers.delete(`${contactId}:${dealId}`);

  // Reload contact
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    console.warn(`[LeadQualification] Contato ${contactId} não encontrado na checagem Calendly`);
    return;
  }

  // Re-check deal stage (it may have advanced since lead was created)
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { stage: true },
  });

  if (!deal) {
    console.warn(`[LeadQualification] Deal ${dealId} não encontrado na checagem Calendly`);
    return;
  }

  // If deal stage is no longer the first stage, skip SDR IA
  const firstStage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: deal.pipelineId },
    orderBy: { order: 'asc' },
  });

  if (firstStage && deal.stageId !== firstStage.id) {
    console.log(
      `[LeadQualification] Deal já avançou de etapa (${deal.stage?.name}) — SDR IA não necessária`,
    );
    return;
  }

  // Check Calendly: if lead already booked a meeting in the last 24h, skip
  if (contact.email) {
    const hasCalendly = await checkCalendlyForContact(contact.email);
    if (hasCalendly) {
      console.log(
        `[LeadQualification] Lead ${contact.name} já agendou via Calendly — SDR IA não necessária`,
      );
      return;
    }
  } else {
    console.log(
      `[LeadQualification] Contato ${contactId} sem email — pulando checagem Calendly`,
    );
  }

  // No meeting booked and still on first stage — activate SDR IA
  await activateSdrIa(contactId, dealId);
}

// ─── Public: onLeadCreated ───────────────────────────────────────────────────

export async function onLeadCreated(contactId: string, dealId: string): Promise<void> {
  console.log(`[LeadQualification] Lead criado: contact=${contactId} deal=${dealId}`);

  // Check if lead qualification is enabled
  const config = await prisma.whatsAppConfig.findFirst();
  if (config && !config.leadQualificationEnabled) {
    console.log('[LeadQualification] Qualificação de leads desabilitada — ignorando lead criado');
    return;
  }

  const timerKey = `${contactId}:${dealId}`;

  // Idempotency: prevent duplicate timers for the same contact/deal
  if (pendingTimers.has(timerKey)) {
    console.warn(`[LeadQualification] Timer já pendente para ${timerKey} — ignorando duplicata`);
    return;
  }

  console.log(`[LeadQualification] Agendando checagem Calendly em 10min para ${timerKey}`);

  const timer = setTimeout(async () => {
    try {
      await delayedCalendlyCheck(contactId, dealId);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[LeadQualification] Erro na checagem Calendly:`, errMsg);
      pendingTimers.delete(timerKey);
    }
  }, 10 * 60 * 1000);

  pendingTimers.set(timerKey, timer);
}

// ─── Public: simulateLeadEntry ───────────────────────────────────────────────

export async function simulateLeadEntry(params: {
  contactName: string;
  campaignName?: string;
  sourceName?: string;
}): Promise<{ aiReply: string; context: string }> {
  console.log(`[LeadQualification] Simulando entrada de lead: ${params.contactName}`);

  let contextString: string;

  // Try to find CampaignContext by campaign name
  let campaignContext = null;
  if (params.campaignName) {
    const campaign = await prisma.campaign.findFirst({
      where: { name: { equals: params.campaignName, mode: 'insensitive' } },
      include: { campaignContext: true },
    });
    if (campaign?.campaignContext) {
      campaignContext = campaign.campaignContext;
    }
  }

  // If no direct match, try trigger-based matching
  if (!campaignContext && params.campaignName) {
    const allContexts = await prisma.campaignContext.findMany({
      include: { campaign: { select: { name: true } } },
    });

    const searchTerm = params.campaignName.toLowerCase();
    const sourceTerm = params.sourceName?.toLowerCase();

    campaignContext = allContexts.find(ctx => {
      const triggers = Array.isArray(ctx.triggers) ? (ctx.triggers as string[]) : [];
      if (triggers.length === 0) return false;
      return triggers.some(trigger => {
        const t = trigger.toLowerCase();
        return searchTerm.includes(t) || t.includes(searchTerm) ||
          (sourceTerm && (sourceTerm.includes(t) || t.includes(sourceTerm)));
      });
    }) ?? null;
  }

  // Fallback to default context
  if (!campaignContext) {
    campaignContext = await prisma.campaignContext.findFirst({ where: { isDefault: true } });
  }

  if (campaignContext) {
    contextString = `CONTEXTO DO LEAD (use para personalizar a primeira abordagem):
- Nome: ${params.contactName}
- Campanha: ${params.campaignName || 'Não identificada'}
- Fonte: ${params.sourceName || 'Não identificada'}
- Página de entrada: Não identificada

CONTEXTO DA CAMPANHA:
${campaignContext.context}

- Este lead acabou de se cadastrar e ainda NÃO agendou reunião.
- Sua missão: iniciar a conversa de forma natural, usar o contexto para criar rapport, e direcionar para o agendamento.
- Esta é a PRIMEIRA mensagem — não há histórico. Comece com uma saudação personalizada.`;
  } else {
    contextString = buildCampaignContext({
      contactName: params.contactName,
      campaignName: params.campaignName,
      sourceName: params.sourceName,
      landingPage: null,
    });
  }

  const config = await prisma.whatsAppConfig.findFirst();
  const meetingLink = config?.meetingLink || null;

  // Does NOT create real records — only builds context and calls AI
  const aiReply = await getAIResponse([], params.contactName, meetingLink, contextString);

  console.log(`[LeadQualification] Simulação concluída para ${params.contactName}`);

  return { aiReply, context: contextString };
}
