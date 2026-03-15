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

  for (const automation of automations) {
    const triggerConfig = automation.triggerConfig as any;

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

    // Find the first step (order 1)
    const firstStep = automation.steps.find((s) => s.order === 1);
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

      // Execute the action
      const result = await executeAction(enrollment, step);

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
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStepId: nextStepId,
            nextActionAt: enrollment.nextActionAt, // keep current unless WAIT updated it
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
