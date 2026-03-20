import prisma from '../lib/prisma';
import { isBusinessHours, msUntilNextBusinessHour } from '../utils/sendingWindow';

// In-memory map: conversationId -> scheduled timeout
const scheduledFollowUps = new Map<string, NodeJS.Timeout>();

/**
 * Schedule the next follow-up for a conversation.
 * Called when: bot sends a message, or a follow-up is sent (to schedule the next one).
 * Creates DB records for ALL remaining steps (for UI visibility), but only
 * sets a setTimeout for the immediate next step.
 */
export async function scheduleNextFollowUp(conversationId: string): Promise<void> {
  // Cancel any existing scheduled follow-up
  await cancelFollowUp(conversationId);

  const config = await prisma.whatsAppConfig.findFirst();
  if (!config?.followUpEnabled || !config?.botEnabled) return;

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { followUpState: true },
  });

  if (!conversation || conversation.needsHumanAttention || conversation.meetingBooked) return;
  if (conversation.optedOut) return; // Não agendar follow-up para quem fez opt-out

  const state = conversation.followUpState;
  if (!state || state.paused || state.respondedSinceLastBot) return;

  // Load follow-up steps
  const steps = await prisma.whatsAppFollowUpStep.findMany({
    where: { configId: config.id },
    orderBy: { order: 'asc' },
  });

  if (steps.length === 0) return;

  const currentStep = state.followUpCount;
  if (currentStep >= steps.length) return; // All steps completed

  const step = steps[currentStep];
  const lastMsg = state.lastBotMessageAt || state.lastFollowUpAt || new Date();

  // Look up dealId from contact's open deals
  const deal = conversation.contactId ? await prisma.deal.findFirst({
    where: { contactId: conversation.contactId, status: 'OPEN' },
    select: { id: true },
  }) : null;

  // Create DB records for ALL remaining steps (for visibility)
  const remainingSteps = steps.slice(currentStep);
  let cumulativeDelay = 0;
  const toneLabels: Record<string, string> = { CASUAL: 'Casual', REFORCO: 'Reforço', ENCERRAMENTO: 'Encerramento' };
  for (let i = 0; i < remainingSteps.length; i++) {
    const s = remainingSteps[i];
    cumulativeDelay += s.delayMinutes;
    const stepSendAt = new Date(new Date(lastMsg).getTime() + cumulativeDelay * 60 * 1000);
    const toneLabel = toneLabels[s.tone] || s.tone || '';

    // Create — if unique constraint fires, skip (already exists)
    try {
      await prisma.scheduledFollowUp.create({
        data: {
          conversationId,
          dealId: deal?.id || null,
          stepNumber: currentStep + i + 1,
          label: `Follow-up #${currentStep + i + 1} ${toneLabel}`.trim(),
          tone: s.tone,
          delayMinutes: s.delayMinutes,
          scheduledAt: stepSendAt,
          status: 'PENDING',
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') continue; // Unique constraint — already exists, skip
      throw e;
    }
  }

  // Now set the actual timeout for only the NEXT step
  const delayMs = step.delayMinutes * 60 * 1000;
  const sendAt = new Date(lastMsg).getTime() + delayMs;
  const delay = sendAt - Date.now();

  if (delay <= 0) {
    // Should have already fired — send immediately (respeitando horário comercial)
    executeFollowUp(conversationId, step, currentStep, steps.length).catch(console.error);
    return;
  }

  const timeout = setTimeout(() => {
    scheduledFollowUps.delete(conversationId);
    executeFollowUp(conversationId, step, currentStep, steps.length).catch(console.error);
  }, delay);

  scheduledFollowUps.set(conversationId, timeout);
  console.log(`[follow-up] Agendado step ${currentStep + 1} para ${conversationId} em ${Math.round(delay / 60000)}min`);
}

async function executeFollowUp(conversationId: string, step: any, stepIndex: number, totalSteps: number): Promise<void> {
  // Re-check state (lead might have responded since scheduling)
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { followUpState: true },
  });

  if (!conversation?.followUpState) return;
  const state = conversation.followUpState;
  if (state.paused || state.respondedSinceLastBot || conversation.meetingBooked) {
    console.log(`[follow-up] Pulando ${conversationId} — estado mudou desde o agendamento`);
    return;
  }

  // Não enviar para quem fez opt-out
  if (conversation.optedOut) {
    console.log(`[follow-up] Pulando ${conversationId} — opt-out`);
    return;
  }

  // Verificar horário comercial — follow-ups proativos respeitam 9h–18h seg–sex
  if (!isBusinessHours()) {
    const msUntil = msUntilNextBusinessHour();
    console.log(`[follow-up] Fora do horário comercial — reagendando ${conversationId} para daqui ${Math.round(msUntil / 60000)}min`);

    const timeout = setTimeout(() => {
      scheduledFollowUps.delete(conversationId);
      executeFollowUp(conversationId, step, stepIndex, totalSteps).catch(console.error);
    }, msUntil);

    scheduledFollowUps.set(conversationId, timeout);
    return;
  }

  // Verificar limite diário antes de enviar follow-up proativo
  const { canSend, registerSent } = await import('./dailyLimitService');
  if (!await canSend()) {
    const msUntil = msUntilNextBusinessHour();
    console.log(`[follow-up] Limite diário atingido — reagendando ${conversationId} para próxima janela`);
    const timeout = setTimeout(() => {
      scheduledFollowUps.delete(conversationId);
      executeFollowUp(conversationId, step, stepIndex, totalSteps).catch(console.error);
    }, msUntil + 60_000); // +1min após abertura da janela
    scheduledFollowUps.set(conversationId, timeout);
    return;
  }

  // Import and send using the existing sendFollowUp from whatsappFollowUp
  const { sendFollowUp } = await import('./whatsappFollowUp');
  try {
    await sendFollowUp(
      {
        id: conversation.id,
        phone: conversation.phone,
        pushName: conversation.pushName,
        needsHumanAttention: conversation.needsHumanAttention,
        meetingBooked: conversation.meetingBooked,
        followUpState: conversation.followUpState,
      },
      step,
      stepIndex + 1,
      totalSteps,
    );
    console.log(`[follow-up] Enviado step ${stepIndex + 1} (${step.tone}) para ${conversationId}`);
    await registerSent('followUp').catch(() => {});

    // Mark as SENT in the DB
    await prisma.scheduledFollowUp.updateMany({
      where: { conversationId, stepNumber: stepIndex + 1, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });

    // Schedule the NEXT step
    scheduleNextFollowUp(conversationId);
  } catch (err) {
    console.error(`[follow-up] Erro ao enviar step ${stepIndex + 1} para ${conversationId}:`, err);
  }
}

/**
 * Cancel scheduled follow-up for a conversation.
 * Called when: lead responds, conversation paused, meeting booked, etc.
 */
export async function cancelFollowUp(conversationId: string): Promise<void> {
  const existing = scheduledFollowUps.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    scheduledFollowUps.delete(conversationId);
  }
  // Cancel all pending DB records
  await prisma.scheduledFollowUp.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  }).catch(() => {}); // Don't fail if DB error
}

/**
 * On server startup, re-schedule follow-ups for all eligible conversations.
 */
export async function initFollowUpScheduler(): Promise<void> {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config?.followUpEnabled || !config?.botEnabled) {
      console.log('[follow-up] Desabilitado, pulando init');
      return;
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        needsHumanAttention: false,
        meetingBooked: false,
        optedOut: false,
        followUpState: {
          respondedSinceLastBot: false,
          paused: false,
        },
      },
      select: { id: true },
    });

    for (const conv of conversations) {
      await scheduleNextFollowUp(conv.id);
    }

    console.log(`[follow-up] Scheduler inicializado para ${conversations.length} conversas`);
  } catch (err) {
    console.error('[follow-up] Erro no init:', err);
  }
}
