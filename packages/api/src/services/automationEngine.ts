import prisma from '../lib/prisma';
import { executeAction } from './automationActions';

// ─── Trigger Evaluation ──────────────────────────────────────────────────────

/**
 * Finds all ACTIVE automations matching the given triggerType,
 * checks if the contact matches the triggerConfig, and enrolls
 * the contact if not already enrolled.
 */
export async function evaluateTriggers(
  triggerType: string,
  data: { contactId: string; metadata?: any }
): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: {
      status: 'ACTIVE',
      triggerType: triggerType as any,
    },
    include: {
      steps: {
        orderBy: { order: 'asc' },
      },
    },
  });

  // Pre-check: if any automation is a cadence, verify cadenceEnabled once
  let cadenceEnabledChecked = false;
  let cadenceEnabled = false;

  for (const automation of automations) {
    const triggerConfig = automation.triggerConfig as any;

    // Skip cadence automations if cadences are disabled
    if (triggerConfig?.isCadence) {
      if (!cadenceEnabledChecked) {
        const waConfig = await prisma.whatsAppConfig.findFirst({ select: { cadenceEnabled: true } });
        cadenceEnabled = waConfig?.cadenceEnabled === true;
        cadenceEnabledChecked = true;
      }
      if (!cadenceEnabled) continue;
    }

    // Check if the contact matches the trigger config
    const matches = doesTriggerMatch(triggerType, triggerConfig, data.metadata);
    if (!matches) continue;

    // Check if the contact is already enrolled (ACTIVE status)
    const existingEnrollment = await prisma.automationEnrollment.findFirst({
      where: {
        automationId: automation.id,
        contactId: data.contactId,
        status: 'ACTIVE',
      },
    });

    if (existingEnrollment) continue;

    // Find the root step (not referenced by any other step)
    const referencedIds = new Set<string>();
    automation.steps.forEach((s) => {
      if (s.nextStepId) referencedIds.add(s.nextStepId);
      if (s.trueStepId) referencedIds.add(s.trueStepId);
      if (s.falseStepId) referencedIds.add(s.falseStepId);
    });
    const firstStep = automation.steps.find((s) => !referencedIds.has(s.id))
      || automation.steps.find((s) => s.order === 0)
      || automation.steps[0];
    if (!firstStep) continue;

    // Create enrollment
    await prisma.automationEnrollment.create({
      data: {
        automationId: automation.id,
        contactId: data.contactId,
        status: 'ACTIVE',
        currentStepId: firstStep.id,
        nextActionAt: new Date(),
      },
    });
  }
}

/**
 * Checks if the trigger config matches the incoming metadata.
 */
function doesTriggerMatch(
  triggerType: string,
  triggerConfig: any,
  metadata?: any
): boolean {
  switch (triggerType) {
    case 'TAG_ADDED':
    case 'TAG_REMOVED':
      return metadata?.tagId === triggerConfig?.tagId;

    case 'STAGE_CHANGED':
      return metadata?.stageId === triggerConfig?.stageId;

    case 'CONTACT_CREATED':
      return true;

    case 'FIELD_UPDATED':
      return metadata?.field === triggerConfig?.field;

    case 'DATE_BASED':
      // Handled by cron, skip here
      return false;

    default:
      return false;
  }
}

// ─── Enrollment Processing ───────────────────────────────────────────────────

/**
 * Processes all active enrollments whose nextActionAt has passed.
 * Executes the current step, advances to the next, and logs results.
 */
export async function processEnrollments(): Promise<{ processed: number }> {
  const now = new Date();

  const enrollments = await prisma.automationEnrollment.findMany({
    where: {
      status: 'ACTIVE',
      nextActionAt: { lte: now },
    },
    include: {
      currentStep: true,
      automation: {
        include: {
          steps: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  let processed = 0;

  for (const enrollment of enrollments) {
    try {
      const step = enrollment.currentStep;
      if (!step) {
        // No current step — mark as completed
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        processed++;
        continue;
      }

      // ── WAIT_FOR_RESPONSE branching ──────────────────────────────────────
      // When the enrollment arrives at a WAIT_FOR_RESPONSE step and
      // nextActionAt <= now, it means either the client responded early
      // or the timeout has expired. Check metadata to decide the branch.
      if (step.actionType === 'WAIT_FOR_RESPONSE') {
        const meta = (enrollment.metadata as any) || {};
        const config = step.config as any;
        const waitHours = config?.waitHours || 24;
        const channel = config?.channel || 'any';

        let nextStepId: string | null = null;

        if (meta.responseReceived === true) {
          // Client responded before the timeout
          console.log(`[AutomationEngine] Cliente respondeu dentro do prazo — seguindo caminho 'respondeu'`);
          nextStepId = step.falseStepId; // "respondeu" path
        } else {
          // Timeout expired without response
          console.log(`[AutomationEngine] Sem resposta após ${waitHours}h — seguindo caminho 'não respondeu'`);
          nextStepId = step.trueStepId; // "não respondeu" path
        }

        // Log the WAIT_FOR_RESPONSE resolution
        await prisma.automationLog.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            actionType: step.actionType,
            result: {
              success: true,
              output: {
                responseReceived: meta.responseReceived === true,
                channel,
                waitHours,
                branchTaken: meta.responseReceived === true ? 'respondeu (falseStepId)' : 'não respondeu (trueStepId)',
              },
            },
          },
        });

        if (nextStepId) {
          // Advance to the chosen branch and clear awaiting metadata
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStepId: nextStepId,
              nextActionAt: new Date(),
              metadata: {
                ...(typeof meta === 'object' ? meta : {}),
                awaitingResponse: false,
                responseReceived: undefined,
                awaitingSince: undefined,
              },
            },
          });
        } else {
          // No branch target — complete the enrollment
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              currentStepId: null,
              nextActionAt: null,
              metadata: {
                ...(typeof meta === 'object' ? meta : {}),
                awaitingResponse: false,
              },
            },
          });
        }

        processed++;
        continue;
      }

      // Cadence automations: check feature flag + business hours for WhatsApp
      const isCadence = (enrollment.automation.triggerConfig as any)?.isCadence === true;

      if (isCadence) {
        // Check if cadences are enabled globally
        const waConfig = await prisma.whatsAppConfig.findFirst({ select: { cadenceEnabled: true } });
        if (!waConfig?.cadenceEnabled) {
          continue;
        }

        // Check if conversation is in human attention mode — pause cadence
        if (enrollment.contactId) {
          const conv = await prisma.whatsAppConversation.findFirst({
            where: { contactId: enrollment.contactId },
            select: { needsHumanAttention: true },
          });
          if (conv?.needsHumanAttention) {
            console.log(`[AutomationEngine] Cadência pausada — atendimento humano ativo para enrollment ${enrollment.id}`);
            continue;
          }
        }

        // WhatsApp actions respect business hours; emails don't
        const isWhatsAppAction = step.actionType === 'SEND_WHATSAPP' || step.actionType === 'SEND_WHATSAPP_AI';
        if (isWhatsAppAction) {
          const { isBusinessHours, msUntilNextBusinessHour } = await import('../utils/sendingWindow');
          if (!isBusinessHours()) {
            // Schedule for next business hour instead of retrying every minute
            const msUntil = msUntilNextBusinessHour();
            const nextBH = new Date(Date.now() + msUntil);
            await prisma.automationEnrollment.update({
              where: { id: enrollment.id },
              data: { nextActionAt: nextBH },
            });
            console.log(`[AutomationEngine] Cadência WhatsApp fora do horário — reagendado para ${nextBH.toISOString()} (enrollment ${enrollment.id})`);
            continue;
          }
        }
      }

      // Execute the action
      const result = await executeAction(enrollment, step, {
        generalContext: (enrollment.automation.triggerConfig as any)?.generalContext || '',
      });

      // Create log entry
      await prisma.automationLog.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          actionType: step.actionType,
          result: result as any,
        },
      });

      // Determine the next step
      let nextStepId: string | null = null;

      if (step.actionType === 'CONDITION') {
        nextStepId = result.conditionResult ? step.trueStepId : step.falseStepId;
      } else if (step.nextStepId) {
        nextStepId = step.nextStepId;
      } else {
        // Try to find the next step by order
        const currentOrder = step.order;
        const nextStep = enrollment.automation.steps.find(
          (s) => s.order === currentOrder + 1
        );
        nextStepId = nextStep?.id ?? null;
      }

      if (nextStepId) {
        // Advance to next step
        // Use nextActionAt from the action result (e.g. WAIT sets a future date),
        // otherwise default to "now" so the next step runs immediately.
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStepId: nextStepId,
            nextActionAt: result.nextActionAt ?? new Date(),
          },
        });
      } else {
        // No next step — enrollment is completed
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            currentStepId: null,
            nextActionAt: null,
          },
        });
      }

      processed++;
    } catch (error) {
      console.error(
        `[AutomationEngine] Error processing enrollment ${enrollment.id}:`,
        error
      );

      // Log the failure but don't stop processing other enrollments
      if (enrollment.currentStep) {
        await prisma.automationLog.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: enrollment.currentStep.id,
            actionType: enrollment.currentStep.actionType,
            result: {
              success: false,
              output: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      }

      // Mark as FAILED so it doesn't get retried endlessly
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'FAILED' },
      });

      processed++;
    }
  }

  return { processed };
}
