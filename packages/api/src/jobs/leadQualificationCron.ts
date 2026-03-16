import cron from 'node-cron';
import prisma from '../lib/prisma';
import { onLeadCreated } from '../services/leadQualificationEngine';

// ─── In-memory set of already-processed deal IDs (with TTL cleanup) ──────────
// This prevents re-triggering onLeadCreated for the same deal across cron ticks.
// The LeadQualificationEngine itself also has idempotency (pendingTimers map +
// recent BOT message check), so this is a first layer of defense.

const processedDeals = new Set<string>();
const DEAL_TTL_MS = 5 * 60 * 1000; // keep IDs for 5 minutes, then forget

function markProcessed(dealId: string): void {
  processedDeals.add(dealId);
  setTimeout(() => processedDeals.delete(dealId), DEAL_TTL_MS);
}

let isProcessing = false;

// ─── Core: find new deals created by external sources (Edge Function, etc.) ──

async function processNewDeals(): Promise<{ found: number; triggered: number }> {
  // Look for deals created in the last 5 minutes (wider window for reliability)
  const since = new Date(Date.now() - 5 * 60 * 1000);

  // Find the first stage of every default pipeline
  const defaultPipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
  });

  if (!defaultPipeline || defaultPipeline.stages.length === 0) {
    return { found: 0, triggered: 0 };
  }

  const firstStageId = defaultPipeline.stages[0].id;

  // Fetch recent deals on the first stage that have a contact with a phone number
  const recentDeals = await prisma.deal.findMany({
    where: {
      createdAt: { gte: since },
      stageId: firstStageId,
      status: 'OPEN',
      contact: {
        phone: { not: null },
      },
    },
    select: {
      id: true,
      contactId: true,
    },
  });

  let triggered = 0;

  for (const deal of recentDeals) {
    // Skip if already processed in recent memory
    if (processedDeals.has(deal.id)) {
      continue;
    }

    // Skip if there is already a WhatsApp conversation linked to this contact
    // (means onLeadCreated already ran for this contact — either via webhook route
    // or a previous cron tick)
    if (deal.contactId) {
      const existingConversation = await prisma.whatsAppConversation.findFirst({
        where: { contactId: deal.contactId },
      });

      if (existingConversation) {
        markProcessed(deal.id);
        continue;
      }
    }

    // Mark as processed BEFORE triggering (so next tick won't re-trigger)
    markProcessed(deal.id);

    if (deal.contactId) {
      console.log(
        `[leadQualificationCron] New deal detected: deal=${deal.id} contact=${deal.contactId} — triggering onLeadCreated`,
      );

      // Fire-and-forget: onLeadCreated handles its own errors
      onLeadCreated(deal.contactId, deal.id).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[leadQualificationCron] Error triggering onLeadCreated for deal=${deal.id}:`,
          errMsg,
        );
      });

      triggered++;
    }
  }

  return { found: recentDeals.length, triggered };
}

// ─── Public: start the cron ─────────────────────────────────────────────────

export function startLeadQualificationCron(): void {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    try {
      const result = await processNewDeals();
      if (result.found > 0 || result.triggered > 0) {
        console.log(
          `[leadQualificationCron] Tick: ${result.found} recent deals, ${result.triggered} newly triggered`,
        );
      }
    } catch (error) {
      console.error('[leadQualificationCron] Error processing new deals:', error);
    } finally {
      isProcessing = false;
    }
  });

  console.log('[leadQualificationCron] Scheduled: every 30 seconds');
}
