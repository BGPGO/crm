import { ActivityType, Activity } from '@prisma/client';
import prisma from '../lib/prisma';

interface LogActivityParams {
  type: ActivityType;
  content: string;
  userId: string;
  dealId?: string;
  contactId?: string;
  metadata?: unknown;
}

export async function logActivity(params: LogActivityParams): Promise<Activity> {
  const { type, content, userId, dealId, contactId, metadata } = params;

  return prisma.activity.create({
    data: {
      type,
      content,
      userId,
      dealId: dealId ?? null,
      contactId: contactId ?? null,
      metadata: metadata ?? undefined,
    },
  });
}
