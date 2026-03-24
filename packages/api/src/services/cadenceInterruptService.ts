import prisma from '../lib/prisma';

// Tag IDs for each cadence (created by cadenceSeed)
const CADENCE_TAG_IDS = [
  'cmn50zh8h0000ey2yuzau9dmx', // Cadência Etapa 2
  'cmn50zheu0001ey2ywj3ickql', // Cadência Etapa 3
  'cmn50zhix0002ey2y7fsj2oy8', // Cadência Etapa 5
];

/** Remove all cadence tags from a contact */
async function removeCadenceTags(contactId: string): Promise<void> {
  await prisma.contactTag.deleteMany({
    where: { contactId, tagId: { in: CADENCE_TAG_IDS } },
  }).catch(() => {});
}

/**
 * When a lead responds on WhatsApp, cancel all ACTIVE automation enrollments
 * that have triggerType STAGE_CHANGED (cadence automations).
 * This implements the rule: "Qualquer resposta do lead cancela os próximos follows
 * agendados e devolve o controle para a IA conversacional."
 *
 * Only cancels enrollments for automations with triggerConfig containing
 * isCadence: true (set when creating cadence automations).
 */
/**
 * When a deal changes stage, cancel all ACTIVE cadence enrollments for that contact
 * EXCEPT the one that matches the new stage. This prevents two cadences running in parallel.
 *
 * Example: Lead moves from "Contato feito" → "Marcar reunião"
 * → Cadência Etapa 2 (Contato feito) is cancelled
 * → Cadência Etapa 3 (Marcar reunião) is allowed to start via evaluateTriggers
 */
export async function interruptCadenceOnStageChange(contactId: string, newStageId: string): Promise<number> {
  try {
    const enrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId,
        status: 'ACTIVE',
        automation: { status: 'ACTIVE' },
      },
      include: {
        automation: { select: { id: true, name: true, triggerConfig: true } },
      },
    });

    let cancelled = 0;

    for (const enrollment of enrollments) {
      const triggerConfig = enrollment.automation.triggerConfig as Record<string, unknown> | null;
      if (!triggerConfig?.isCadence) continue;

      // Don't cancel the cadence that matches the NEW stage (it will be the one starting)
      if (triggerConfig.stageId === newStageId) continue;

      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'PAUSED',
          metadata: {
            ...((enrollment.metadata as Record<string, unknown>) || {}),
            interruptedByStageChange: true,
            newStageId,
            interruptedAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `[cadence-interrupt] Enrollment ${enrollment.id} pausado — etapa mudou para ${newStageId} (automação: "${enrollment.automation.name}")`
      );
      cancelled++;
    }

    if (cancelled > 0) {
      // Remove cadence tags — new cadence will add its own tag
      await removeCadenceTags(contactId);
      console.log(`[cadence-interrupt] ${cancelled} cadência(s) antiga(s) canceladas para contato ${contactId} (nova etapa: ${newStageId})`);
    }

    return cancelled;
  } catch (err) {
    console.error('[cadence-interrupt] Erro em stageChange:', err);
    return 0;
  }
}

export async function interruptCadenceOnResponse(contactId: string): Promise<number> {
  try {
    // Find all ACTIVE enrollments for this contact in cadence automations
    const enrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId,
        status: 'ACTIVE',
        automation: {
          status: 'ACTIVE',
        },
      },
      include: {
        automation: { select: { id: true, name: true, triggerConfig: true } },
      },
    });

    let cancelled = 0;

    for (const enrollment of enrollments) {
      const triggerConfig = enrollment.automation.triggerConfig as Record<string, unknown> | null;

      // Only cancel if the automation is marked as a cadence (isCadence: true in triggerConfig)
      if (!triggerConfig?.isCadence) continue;

      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: 'PAUSED',
          metadata: {
            ...((enrollment.metadata as Record<string, unknown>) || {}),
            interruptedByResponse: true,
            interruptedAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `[cadence-interrupt] Enrollment ${enrollment.id} pausado — lead respondeu (automação: "${enrollment.automation.name}")`
      );
      cancelled++;
    }

    if (cancelled > 0) {
      // Remove cadence tags — lead responded, bot takes over
      await removeCadenceTags(contactId);
      console.log(`[cadence-interrupt] ${cancelled} enrollment(s) de cadência cancelados para contato ${contactId}`);
    }

    return cancelled;
  } catch (err) {
    console.error('[cadence-interrupt] Erro:', err);
    return 0;
  }
}
