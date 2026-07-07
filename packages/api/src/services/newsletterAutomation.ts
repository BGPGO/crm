import prisma from '../lib/prisma';
import { buildEdition } from './newsletterBuilder';
import { sendNewsletterTo } from './newsletterService';

const SEND_DELAY_MS = 600; // Resend: ~10 req/s — folga confortável

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getOrCreateConfig() {
  return prisma.newsletterConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
}

/**
 * Envia uma edição de teste (monta uma edição nova e manda só pro email dado).
 */
export async function runNewsletterTest(testEmail: string): Promise<{ editionId: string }> {
  const { id } = await buildEdition({ isTest: true });
  const result = await sendNewsletterTo(id, testEmail);
  if (result.error) throw new Error(result.error);
  await prisma.newsletterEdition.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date(), recipientCount: 1 },
  });
  return { editionId: id };
}

/**
 * Execução completa da automação (o que o cron de segunda 5h roda):
 * monta a edição e envia pra lista configurada.
 */
export async function runNewsletterAutomation(opts?: { force?: boolean }): Promise<{
  editionId: string | null;
  sent: number;
  skipped: string | null;
}> {
  const config = await getOrCreateConfig();

  if (!config.enabled && !opts?.force) {
    console.log('[newsletter] automação desativada — pulando');
    return { editionId: null, sent: 0, skipped: 'desativada' };
  }

  const recipients = (Array.isArray(config.recipients) ? config.recipients : []) as string[];
  if (recipients.length === 0) {
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: { lastRunAt: new Date(), lastRunStatus: 'erro: lista de destinatários vazia' },
    });
    console.warn('[newsletter] lista de destinatários vazia — nada enviado');
    return { editionId: null, sent: 0, skipped: 'lista vazia' };
  }

  try {
    const { id, subject } = await buildEdition();
    console.log(`[newsletter] edição montada: ${id} — "${subject}"`);

    let sent = 0;
    for (const email of recipients) {
      const result = await sendNewsletterTo(id, email);
      if (result.error) {
        console.error(`[newsletter] falha pra ${email}:`, result.error);
      } else {
        sent++;
      }
      await sleep(SEND_DELAY_MS);
    }

    await prisma.newsletterEdition.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: sent },
    });
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: sent === recipients.length ? 'ok' : `ok parcial: ${sent}/${recipients.length}`,
      },
    });

    console.log(`[newsletter] enviada pra ${sent}/${recipients.length} destinatários`);
    return { editionId: id, sent, skipped: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: { lastRunAt: new Date(), lastRunStatus: `erro: ${msg.slice(0, 180)}` },
    });
    throw error;
  }
}
