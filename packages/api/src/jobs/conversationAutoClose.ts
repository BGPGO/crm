import prisma from '../lib/prisma';

const INACTIVITY_HOURS = 24; // close conversations after 24h of inactivity
const INTERVAL_MS = 30 * 60 * 1000; // run every 30 minutes

export async function autoCloseConversations() {
  const cutoff = new Date(Date.now() - INACTIVITY_HOURS * 60 * 60 * 1000);

  const result = await prisma.whatsAppConversation.updateMany({
    where: {
      status: 'open',
      lastMessageAt: { lt: cutoff },
    },
    data: { status: 'closed' },
  });

  if (result.count > 0) {
    console.log(`[auto-close] Closed ${result.count} inactive conversations`);
  }
}

export function startConversationAutoCloseCron() {
  // Run once on startup
  autoCloseConversations().catch((err) =>
    console.error('[auto-close] Error on startup run:', err)
  );

  // Then run every 30 minutes
  setInterval(() => {
    autoCloseConversations().catch((err) =>
      console.error('[auto-close] Error:', err)
    );
  }, INTERVAL_MS);

  console.log('[auto-close] Cron started (every 30 min)');
}
