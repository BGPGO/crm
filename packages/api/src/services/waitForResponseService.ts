import prisma from '../lib/prisma';

/**
 * Checks if a contact has any active automation enrollments waiting for a response
 * (WAIT_FOR_RESPONSE step with awaitingResponse metadata). If found, marks them
 * as responded so the automation engine advances on the next cron tick.
 *
 * @param contactId - The contact ID to check
 * @returns Number of enrollments that were updated
 */
export async function checkAndCancelWaitForResponse(contactId: string): Promise<number> {
  const enrollments = await prisma.automationEnrollment.findMany({
    where: {
      contactId,
      status: 'ACTIVE',
      currentStep: {
        actionType: 'WAIT_FOR_RESPONSE',
      },
    },
    include: { currentStep: true },
  });

  let updated = 0;

  for (const enrollment of enrollments) {
    const metadata = (enrollment.metadata as Record<string, unknown>) || {};

    if (metadata.awaitingResponse) {
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: {
          nextActionAt: new Date(), // process on next cron tick
          metadata: {
            ...metadata,
            responseReceived: true,
            respondedAt: new Date().toISOString(),
          },
        },
      });

      console.log(
        `[WAIT_FOR_RESPONSE] Cliente respondeu — enrollment ${enrollment.id} será processado no próximo tick`
      );
      updated++;
    }
  }

  return updated;
}
