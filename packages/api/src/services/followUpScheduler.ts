import prisma from '../lib/prisma';

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

  // Create DB records for ALL remaining steps (for visibility)
  const remainingSteps = steps.slice(currentStep);
  let cumulativeDelay = 0;
  for (let i = 0; i < remainingSteps.length; i++) {
    const s = remainingSteps[i];
    cumulativeDelay += s.delayMinutes;
    const stepSendAt = new Date(new Date(lastMsg).getTime() + cumulativeDelay * 60 * 1000);

    // Only create if not already exists
    const existing = await prisma.scheduledFollowUp.findFirst({
      where: { conversationId, stepNumber: currentStep + i + 1, status: 'PENDING' },
    });
    if (!existing) {
      await prisma.scheduledFollowUp.create({
        data: {
          conversationId,
          stepNumber: currentStep + i + 1,
          tone: s.tone,
          delayMinutes: s.delayMinutes,
          scheduledAt: stepSendAt,
          status: 'PENDING',
        },
      });
    }
  }

  // Now set the actual timeout for only the NEXT step
  const delayMs = step.delayMinutes * 60 * 1000;
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

    // Mark as SENT in the DB
    await prisma.scheduledFollowUp.updateMany({
      where: { conversationId, stepNumber: stepIndex + 1, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() },
    });

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
