import { LeadScore, EngagementLevel } from '@prisma/client';
import prisma from '../lib/prisma';

/**
 * Evaluates whether a contact matches a single scoring rule.
 */
export function evaluateRule(
  contact: any,
  rule: { field: string; operator: string; value: string }
): boolean {
  const fieldValue = contact[rule.field];

  // If the field doesn't exist on the contact, the rule doesn't match
  if (fieldValue === undefined || fieldValue === null) {
    return false;
  }

  const contactVal = String(fieldValue).toLowerCase();
  const ruleVal = rule.value.toLowerCase();

  switch (rule.operator) {
    case 'EQUALS':
      return contactVal === ruleVal;

    case 'CONTAINS':
      return contactVal.includes(ruleVal);

    case 'GREATER_THAN':
      return Number(fieldValue) > Number(rule.value);

    case 'LESS_THAN':
      return Number(fieldValue) < Number(rule.value);

    case 'IN': {
      const allowed = rule.value.split(',').map((v) => v.trim().toLowerCase());
      return allowed.includes(contactVal);
    }

    case 'NOT_IN': {
      const excluded = rule.value.split(',').map((v) => v.trim().toLowerCase());
      return !excluded.includes(contactVal);
    }

    default:
      return false;
  }
}

/**
 * Determines the engagement level based on the most recent email interaction dates.
 *
 * - Opened/clicked in the last 2 months → ENGAGED
 * - 2–4 months ago → INTERMEDIATE
 * - More than 4 months ago or never → DISENGAGED
 */
function deriveEngagementLevel(
  lastEmailOpenedAt: Date | null | undefined,
  lastEmailClickedAt: Date | null | undefined
): EngagementLevel {
  const now = new Date();
  const twoMonthsAgo = new Date(now);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

  // Pick the most recent interaction
  const dates = [lastEmailOpenedAt, lastEmailClickedAt].filter(Boolean) as Date[];
  if (dates.length === 0) {
    return EngagementLevel.DISENGAGED;
  }

  const mostRecent = new Date(Math.max(...dates.map((d) => d.getTime())));

  if (mostRecent >= twoMonthsAgo) {
    return EngagementLevel.ENGAGED;
  }
  if (mostRecent >= fourMonthsAgo) {
    return EngagementLevel.INTERMEDIATE;
  }
  return EngagementLevel.DISENGAGED;
}

/**
 * Calculates the lead score for a single contact by applying all active rules
 * and determining the engagement level from email interaction timestamps.
 */
export async function calculateScoreForContact(contactId: string): Promise<LeadScore> {
  // Fetch the contact with related data used by rules
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: {
      organization: true,
      deals: true,
      tags: { include: { tag: true } },
      leadScore: true,
    },
  });

  // Fetch all active scoring rules
  const rules = await prisma.leadScoreRule.findMany({
    where: { isActive: true },
  });

  // Evaluate each rule and accumulate points
  let score = 0;
  for (const rule of rules) {
    if (evaluateRule(contact, rule)) {
      score += rule.points;
    }
  }

  // Determine engagement from existing lead score email timestamps
  const lastEmailOpenedAt = contact.leadScore?.lastEmailOpenedAt ?? null;
  const lastEmailClickedAt = contact.leadScore?.lastEmailClickedAt ?? null;
  const engagementLevel = deriveEngagementLevel(lastEmailOpenedAt, lastEmailClickedAt);

  // Upsert the LeadScore record
  const leadScore = await prisma.leadScore.upsert({
    where: { contactId },
    update: {
      score,
      engagementLevel,
    },
    create: {
      contactId,
      score,
      engagementLevel,
    },
  });

  return leadScore;
}

/**
 * Recalculates scores for every contact in the database.
 * Processes in batches of 50 to avoid overloading the database.
 */
export async function recalculateAllScores(): Promise<{ total: number; updated: number }> {
  const contacts = await prisma.contact.findMany({ select: { id: true } });
  const total = contacts.length;
  let updated = 0;

  const BATCH_SIZE = 50;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (c) => {
        await calculateScoreForContact(c.id);
        updated++;
      })
    );
  }

  return { total, updated };
}
