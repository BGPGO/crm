import prisma from '../lib/prisma';

// In-memory map: conversationId -> scheduled timeout
const scheduledFollowUps = new Map<string, NodeJS.Timeout>();

/**
 * Schedule the next follow-up for a conversation.
 * Called when: bot sends a message, or a follow-up is sent (to schedule the next one).
 */
export async function scheduleNextFollowUp(conversationId: string): Promise<void> {
  // Cancel any existing scheduled follow-up
  cancelFollowUp(conversationId);

  const config = await prisma.whatsAppConfig.findFirst();
  if (!config?.followUpEnabled || !config?.botEnabled) return;

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { followUpState: true },
  });

  if (!conversation || conversation.needsHumanAttention || conversation.meetingBooked) return;

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
  const delayMs = step.delayMinutes * 60 * 1000;

  // Calculate when to send: delay from last bot message
  const lastMsg = state.lastBotMessageAt || state.lastFollowUpAt || new Date();
  const sendAt = new Date(lastMsg).getTime() + delayMs;
  const delay = sendAt - Date.now();

  if (delay <= 0) {
    // Should have already fired — send immediately
    executeFollowUp(conversationId, step, currentStep, steps.length).catch(console.error);
    return;
  }

  const timeout = setTimeout(() => {
    scheduledFollowUps.delete(conversationId);
    executeFollowUp(conversationId, step, currentStep, steps.length).catch(console.error);
  }, delay);

  scheduledFollowUps.set(conversationId, timeout);
  console.log(`[follow-up] Scheduled step ${currentStep + 1} for ${conversationId} in ${Math.round(delay / 60000)}min`);
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
    console.log(`[follow-up] Skipping ${conversationId} — state changed since scheduling`);
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
    console.log(`[follow-up] Sent step ${stepIndex + 1} (${step.tone}) to ${conversationId}`);

    // Schedule the NEXT step
    scheduleNextFollowUp(conversationId);
  } catch (err) {
    console.error(`[follow-up] Error sending step ${stepIndex + 1} for ${conversationId}:`, err);
  }
}

/**
 * Cancel scheduled follow-up for a conversation.
 * Called when: lead responds, conversation paused, meeting booked, etc.
 */
export function cancelFollowUp(conversationId: string): void {
  const existing = scheduledFollowUps.get(conversationId);
  if (existing) {
    clearTimeout(existing);
    scheduledFollowUps.delete(conversationId);
  }
}

/**
 * On server startup, re-schedule follow-ups for all eligible conversations.
 */
export async function initFollowUpScheduler(): Promise<void> {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config?.followUpEnabled || !config?.botEnabled) {
      console.log('[follow-up] Disabled, skipping init');
      return;
    }

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        needsHumanAttention: false,
        meetingBooked: false,
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

    console.log(`[follow-up] Initialized scheduler for ${conversations.length} conversations`);
  } catch (err) {
    console.error('[follow-up] Init error:', err);
  }
}
