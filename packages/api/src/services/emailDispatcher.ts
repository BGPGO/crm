import prisma from '../lib/prisma';
import {
  buildSegmentWhere,
  buildSegmentWhereFromGroups,
  SegmentFilter,
  FilterGroup,
} from './segmentEngine';

interface DispatchOptions {
  sendTeamCopy?: boolean;
}

/**
 * Reivindica a campanha (atomic CAS de DRAFT/SCHEDULED -> SENDING), enfileira
 * os EmailSends, atualiza totalRecipients/sentAt e dispara o envio.
 * Usado pelo POST /:id/send e pelo scheduledEmailCron.
 *
 * Retorna a campanha atualizada, ou null se outro processo já reivindicou.
 */
export async function dispatchEmailCampaign(
  campaignId: string,
  options: DispatchOptions = {},
) {
  const claimed = await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: { in: ['DRAFT', 'SCHEDULED'] } },
    data: { status: 'SENDING' },
  });
  if (claimed.count === 0) return null;

  const campaign = await prisma.emailCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { segment: true },
  });

  let contacts;
  const inlineFilterGroups = campaign.filters as unknown as FilterGroup[] | null;
  if (inlineFilterGroups && Array.isArray(inlineFilterGroups) && inlineFilterGroups.length > 0) {
    const where = buildSegmentWhereFromGroups(inlineFilterGroups);
    contacts = await prisma.contact.findMany({
      where: { ...where, email: { not: null } },
      select: { id: true, email: true },
    });
  } else if (campaign.segmentId && campaign.segment) {
    const filters = campaign.segment.filters as unknown as SegmentFilter[] | FilterGroup[];
    const where = buildSegmentWhere(filters);
    contacts = await prisma.contact.findMany({
      where: { ...where, email: { not: null } },
      select: { id: true, email: true },
    });
  } else {
    contacts = await prisma.contact.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true },
    });
  }

  await prisma.emailSend.createMany({
    data: contacts.map((contact) => ({
      emailCampaignId: campaign.id,
      contactId: contact.id,
      status: 'QUEUED' as const,
    })),
    skipDuplicates: true,
  });

  const updated = await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      totalRecipients: contacts.length,
      sentAt: new Date(),
    },
  });

  const sendTeamCopy = options.sendTeamCopy !== false;
  const { sendCampaignEmails } = await import('./emailSender');
  sendCampaignEmails(campaign.id, { sendTeamCopy }).catch(async (error) => {
    console.error(`Failed to send campaign ${campaign.id}:`, error);
    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED' },
    });
  });

  return updated;
}
