/**
 * Cron: Broadcasts WABA agendados.
 *
 * Roda a cada 1 minuto e dispara as WaBroadcast com status=WA_SCHEDULED
 * cujo scheduledAt já passou.
 *
 * Claim atômico via updateMany (WA_SCHEDULED → WA_SENDING) garante que
 * iterações concorrentes não causem disparo duplicado.
 *
 * O runBroadcastLoop é assíncrono (~25min pra 215 contatos com delay 5-10s);
 * é chamado fire-and-forget pra liberar o cron pro próximo ciclo.
 */

import prisma from '../lib/prisma';
import { runBroadcastLoop } from '../services/wa/broadcastExecutor';

const CHECK_INTERVAL_MS = 60 * 1000;

async function processScheduledBroadcasts(): Promise<void> {
  try {
    const now = new Date();
    const due = await prisma.waBroadcast.findMany({
      where: {
        status: 'WA_SCHEDULED',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true, name: true, scheduledAt: true },
      take: 10,
    });

    if (due.length === 0) return;

    console.log(`[scheduled-broadcast-cron] ${due.length} broadcast(s) para disparar`);

    for (const bc of due) {
      // Claim atômico — só dispara se ainda está SCHEDULED
      const claimed = await prisma.waBroadcast.updateMany({
        where: { id: bc.id, status: 'WA_SCHEDULED' },
        data: { status: 'WA_SENDING', startedAt: new Date(), pausedAt: null },
      });
      if (claimed.count === 0) {
        console.log(`[scheduled-broadcast-cron] ${bc.id} já claimed por outro processo — pulando`);
        continue;
      }

      console.log(
        `[scheduled-broadcast-cron] Disparando "${bc.name}" (${bc.id}) — agendado para ${bc.scheduledAt?.toISOString()}`,
      );

      // Fire-and-forget: o loop leva ~25min pra 215 contatos
      runBroadcastLoop(bc.id)
        .then((r) => {
          console.log(`[scheduled-broadcast-cron] ${bc.id} concluído: ${r.sentCount} enviadas`);
        })
        .catch(async (err) => {
          console.error(`[scheduled-broadcast-cron] ${bc.id} falhou:`, err?.message || err);
          await prisma.waBroadcast
            .update({
              where: { id: bc.id },
              data: { status: 'WA_PAUSED', pausedAt: new Date() },
            })
            .catch(() => undefined);
        });
    }
  } catch (err) {
    console.error('[scheduled-broadcast-cron] Erro no ciclo:', err);
  }
}

let intervalRef: ReturnType<typeof setInterval> | null = null;

export function startScheduledBroadcastCron(): void {
  processScheduledBroadcasts().catch(console.error);

  intervalRef = setInterval(() => {
    processScheduledBroadcasts().catch(console.error);
  }, CHECK_INTERVAL_MS);

  console.log('[scheduled-broadcast-cron] Cron iniciado — verificando a cada 1 minuto');
}

export function stopScheduledBroadcastCron(): void {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    console.log('[scheduled-broadcast-cron] Cron parado');
  }
}
