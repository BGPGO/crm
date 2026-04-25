/**
 * Cron: Email Campaigns agendadas
 *
 * Roda a cada 1 minuto e dispara as EmailCampaign com status=SCHEDULED
 * cujo scheduledAt já passou.
 *
 * O dispatcher usa um claim atômico (updateMany SCHEDULED -> SENDING),
 * então iterações sobrepostas não causam envio duplicado.
 */

import prisma from '../lib/prisma';
import { dispatchEmailCampaign } from '../services/emailDispatcher';

const CHECK_INTERVAL_MS = 60 * 1000;

async function processScheduledCampaigns(): Promise<void> {
  try {
    const now = new Date();
    const due = await prisma.emailCampaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, name: true, scheduledAt: true },
      take: 20,
    });

    if (due.length === 0) return;

    console.log(`[scheduled-email-cron] ${due.length} campanha(s) para disparar`);

    for (const campaign of due) {
      try {
        const updated = await dispatchEmailCampaign(campaign.id);
        if (updated) {
          console.log(
            `[scheduled-email-cron] Disparada "${campaign.name}" (${campaign.id}) — agendada para ${campaign.scheduledAt?.toISOString()}`,
          );
        }
      } catch (err) {
        console.error(`[scheduled-email-cron] Erro ao disparar ${campaign.id}:`, err);
        await prisma.emailCampaign
          .updateMany({
            where: { id: campaign.id, status: { in: ['SCHEDULED', 'SENDING'] } },
            data: { status: 'FAILED' },
          })
          .catch(() => undefined);
      }
    }
  } catch (err) {
    console.error('[scheduled-email-cron] Erro no ciclo de verificação:', err);
  }
}

let intervalRef: ReturnType<typeof setInterval> | null = null;

export function startScheduledEmailCron(): void {
  processScheduledCampaigns().catch(console.error);

  intervalRef = setInterval(() => {
    processScheduledCampaigns().catch(console.error);
  }, CHECK_INTERVAL_MS);

  console.log('[scheduled-email-cron] Cron iniciado — verificando a cada 1 minuto');
}

export function stopScheduledEmailCron(): void {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    console.log('[scheduled-email-cron] Cron parado');
  }
}
