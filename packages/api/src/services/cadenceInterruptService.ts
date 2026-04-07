import prisma from '../lib/prisma';
import { phoneVariants } from '../utils/phoneNormalize';

/** Remove all cadence tags from a contact (and all duplicate contacts with same phone) */
async function removeCadenceTags(contactIds: string[]): Promise<void> {
  const cadenceTags = await prisma.tag.findMany({
    where: { name: { startsWith: 'Cadência Etapa' } },
    select: { id: true },
  });
  if (cadenceTags.length === 0) return;
  await prisma.contactTag.deleteMany({
    where: { contactId: { in: contactIds }, tagId: { in: cadenceTags.map(t => t.id) } },
  }).catch(() => {});
}

/**
 * Resolve all contactIds that share the same phone number.
 * Uses phoneVariants (normalized + without-9 variant) for exact matching,
 * avoiding false positives from substring matching.
 */
async function resolveAllContactIds(contactId: string): Promise<string[]> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { phone: true },
  });
  if (!contact?.phone) return [contactId];

  const variants = phoneVariants(contact.phone);

  const allContacts = await prisma.contact.findMany({
    where: { phone: { in: variants } },
    select: { id: true },
  });

  // Always include the original contactId even if phone format didn't match
  const ids = new Set(allContacts.map(c => c.id));
  ids.add(contactId);
  return [...ids];
}

/**
 * When a deal changes stage, cancel all ACTIVE cadence enrollments for that contact
 * EXCEPT the one that matches the new stage. This prevents two cadences running in parallel.
 *
 * Example: Lead moves from "Contato feito" → "Marcar reunião"
 * → Cadência Etapa 2 (Contato feito) is cancelled
 * → Cadência Etapa 3 (Marcar reunião) is allowed to start via evaluateTriggers
 */
export async function interruptCadenceOnStageChange(contactId: string, newStageId: string | null): Promise<number> {
  try {
    const allContactIds = await resolveAllContactIds(contactId);

    const enrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId: { in: allContactIds },
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
          status: 'CANCELLED',
          metadata: {
            ...((enrollment.metadata as Record<string, unknown>) || {}),
            cancelledByStageChange: true,
            newStageId,
            interruptedAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `[cadence-interrupt] Enrollment ${enrollment.id} cancelado — etapa mudou para ${newStageId} (automação: "${enrollment.automation.name}")`
      );
      cancelled++;
    }

    if (cancelled > 0) {
      await removeCadenceTags(allContactIds);
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
    const allContactIds = await resolveAllContactIds(contactId);

    // Find all ACTIVE enrollments across all duplicate contacts
    const enrollments = await prisma.automationEnrollment.findMany({
      where: {
        contactId: { in: allContactIds },
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
      await removeCadenceTags(allContactIds);
      console.log(`[cadence-interrupt] ${cancelled} enrollment(s) de cadência cancelados para contato(s) ${allContactIds.join(', ')}`);
    }

    return cancelled;
  } catch (err) {
    console.error('[cadence-interrupt] Erro:', err);
    return 0;
  }
}
