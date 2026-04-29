import prisma from '../lib/prisma';

interface UnsubscribeParams {
  email: string;
  contactId?: string;
  reason?: string;
  emailSendId?: string;
}

export async function unsubscribe(params: UnsubscribeParams): Promise<void> {
  const { email, contactId, reason, emailSendId } = params;

  await prisma.unsubscribeList.upsert({
    where: { email },
    create: {
      email,
      contactId: contactId ?? null,
      reason: reason ?? null,
    },
    update: {
      contactId: contactId ?? undefined,
      reason: reason ?? undefined,
    },
  });

  if (emailSendId) {
    await prisma.emailSend.update({
      where: { id: emailSendId },
      data: {
        unsubscribedAt: new Date(),
        status: 'UNSUBSCRIBED',
      },
    });
  } else if (contactId) {
    await prisma.emailSend.updateMany({
      where: {
        contactId,
        status: { notIn: ['UNSUBSCRIBED', 'BOUNCED'] },
      },
      data: {
        unsubscribedAt: new Date(),
        status: 'UNSUBSCRIBED',
      },
    });
  }
}

export async function isUnsubscribed(email: string): Promise<boolean> {
  const entry = await prisma.unsubscribeList.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { email: true },
  });

  return entry !== null;
}

export async function resubscribe(email: string): Promise<void> {
  await prisma.unsubscribeList.delete({
    where: { email },
  });
}

export async function getUnsubscribedEmails(): Promise<string[]> {
  const entries = await prisma.unsubscribeList.findMany({
    select: { email: true },
  });

  return entries.map((entry) => entry.email);
}
