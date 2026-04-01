/**
 * Cron: WABA Meeting Reminder
 *
 * Roda a cada 5 minutos e processa os ScheduledFollowUp do tipo
 * MEETING_REMINDER_WABA que já passaram do horário agendado.
 *
 * O envio é feito via WaMessageService.sendTemplate() usando templates
 * aprovados pela Meta (não precisa de janela de 24h aberta).
 *
 * Só executa se CloudWaConfig.wabaMeetingReminderEnabled = true.
 */

import prisma from '../lib/prisma';
import { sendWabaMeetingReminder } from '../services/wa/meetingReminderWaba';

// Intervalo de verificação: 5 minutos
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function processWabaMeetingReminders(): Promise<void> {
  try {
    // Verificar flag global antes de qualquer consulta pesada
    const config = await prisma.cloudWaConfig.findFirst({
      select: { wabaMeetingReminderEnabled: true },
    });

    if (!config?.wabaMeetingReminderEnabled) {
      // Sistema desativado — sai silenciosamente
      return;
    }

    const now = new Date();

    // Buscar lembretes WABA pendentes cujo horário já passou
    const pendingReminders = await prisma.scheduledFollowUp.findMany({
      where: {
        type: 'MEETING_REMINDER_WABA',
        status: 'PENDING',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    if (pendingReminders.length === 0) return;

    console.log(`[waba-meeting-reminder-cron] ${pendingReminders.length} lembrete(s) para processar`);

    // Processar um por um (evita sobrecarregar a API da Meta)
    for (const reminder of pendingReminders) {
      try {
        await sendWabaMeetingReminder(reminder.id);
      } catch (err) {
        console.error(`[waba-meeting-reminder-cron] Erro ao processar lembrete ${reminder.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[waba-meeting-reminder-cron] Erro no ciclo de verificação:', err);
  }
}

let intervalRef: ReturnType<typeof setInterval> | null = null;

export function startMeetingReminderWabaCron(): void {
  // Executa imediatamente ao iniciar para não perder lembretes após restart
  processWabaMeetingReminders().catch(console.error);

  intervalRef = setInterval(() => {
    processWabaMeetingReminders().catch(console.error);
  }, CHECK_INTERVAL_MS);

  console.log('[waba-meeting-reminder-cron] Cron iniciado — verificando a cada 5 minutos');
}

export function stopMeetingReminderWabaCron(): void {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    console.log('[waba-meeting-reminder-cron] Cron parado');
  }
}
