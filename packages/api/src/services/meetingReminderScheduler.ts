import prisma from '../lib/prisma';
import { ZApiClient } from './zapiClient';
import { safeFirstName } from '../utils/nameSanitizer';

// In-memory map of scheduled timeouts: meetingId -> timeout[]
const scheduledReminders = new Map<string, NodeJS.Timeout[]>();

/**
 * Schedule all reminder messages for a meeting.
 * Called when a CalendlyEvent is created (from calendly webhook or manual meeting).
 */
export async function scheduleMeetingReminders(meetingId: string): Promise<void> {
  // Delete any existing PENDING reminders (re-scheduling, not cancellation)
  await cancelMeetingReminders(meetingId, false);

  const meeting = await prisma.calendlyEvent.findUnique({
    where: { id: meetingId },
    include: { contact: { select: { id: true, phone: true, name: true } } },
  });

  if (!meeting || meeting.status !== 'active' || !meeting.contact?.phone) {
    console.warn(`[meeting-reminder] Meeting ${meetingId} sem contato/telefone — pulando`);
    return;
  }

  // Check if reminders are enabled
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config?.meetingReminderEnabled) return;

  // Load reminder steps
  const steps = await prisma.meetingReminderStep.findMany({
    where: { enabled: true },
    orderBy: { minutesBefore: 'desc' },
  });

  if (steps.length === 0) return;

  const now = Date.now();
  const meetingTime = new Date(meeting.startTime).getTime();
  const timeouts: NodeJS.Timeout[] = [];

  const dealId = meeting.dealId || null;

  // Try to find conversationId from the contact's phone
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { contactId: meeting.contact.id },
  });
  const conversationId = conversation?.id || null;

  // Create DB records for ALL reminder steps (for visibility)
  for (const step of steps) {
    const sendAt = meetingTime - step.minutesBefore * 60 * 1000;
    if (sendAt <= now) continue;

    const minutesBefore = step.minutesBefore;
    let label: string;
    if (minutesBefore >= 1440) label = `${Math.floor(minutesBefore / 1440)} dia(s) antes`;
    else if (minutesBefore >= 60) label = `${Math.floor(minutesBefore / 60)} hora(s) antes`;
    else label = `${minutesBefore} min antes`;

    // Skip if a PENDING reminder already exists for this meeting + step
    const existing = await prisma.scheduledFollowUp.findFirst({
      where: { meetingId: meeting.id, stepNumber: step.minutesBefore, type: 'MEETING_REMINDER', status: 'PENDING' },
    });
    if (!existing) {
      try {
        await prisma.scheduledFollowUp.create({
          data: {
            type: 'MEETING_REMINDER',
            conversationId,
            dealId,
            meetingId: meeting.id,
            stepNumber: step.minutesBefore,
            label: `Lembrete ${label}`,
            tone: null,
            delayMinutes: step.minutesBefore,
            scheduledAt: new Date(sendAt),
            status: 'PENDING',
          },
        });
      } catch (e: any) {
        if (e.code !== 'P2002') throw e; // Ignore unique constraint, rethrow others
      }
    }
  }

  for (const step of steps) {
    const sendAt = meetingTime - step.minutesBefore * 60 * 1000;
    const delay = sendAt - now;

    if (delay <= 0) continue; // Already past this reminder time

    const timeout = setTimeout(async () => {
      try {
        const client = await ZApiClient.fromConfig();
        const status = await client.getInstanceStatus();
        const state = status?.instance?.state?.toLowerCase() || '';
        if (state !== 'open' && state !== 'connected') {
          console.warn(`[meeting-reminder] Z-API desconectada (state: ${state}) — lembrete para meeting ${meetingId} NÃO enviado, será tentado pelo cron`);
          return; // O cron backup vai tentar depois
        }

        // Build message from template
        const meetingDate = new Date(meeting.startTime);
        const dateStr = meetingDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const timeStr = meetingDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

        const minutesLeft = step.minutesBefore;
        let faltaStr: string;
        if (minutesLeft >= 1440) faltaStr = `${Math.floor(minutesLeft / 1440)} dia(s)`;
        else if (minutesLeft >= 60) faltaStr = `${Math.floor(minutesLeft / 60)} hora(s)`;
        else faltaStr = `${minutesLeft} minutos`;

        const message = step.message
          .replace(/\{\{nome\}\}/gi, safeFirstName(meeting.contact?.name))
          .replace(/\{\{data\}\}/gi, dateStr)
          .replace(/\{\{hora\}\}/gi, timeStr)
          .replace(/\{\{falta\}\}/gi, faltaStr);

        // Verificar opt-out ou atendimento humano (checa as DUAS tabelas — WaConversation
        // é onde a UI seta o flag de takeover humano; WhatsAppConversation tem os campos Z-API)
        const [zapConv, waConv] = await Promise.all([
          prisma.whatsAppConversation.findFirst({
            where: { contactId: meeting.contact!.id },
            select: { optedOut: true, needsHumanAttention: true, phone: true },
          }),
          prisma.waConversation.findFirst({
            where: { contactId: meeting.contact!.id },
            select: { needsHumanAttention: true },
          }),
        ]);
        const humanAttention = zapConv?.needsHumanAttention || waConv?.needsHumanAttention;
        if (zapConv?.optedOut || humanAttention) {
          const reason = zapConv?.optedOut ? 'opt-out' : 'atendimento humano';
          console.log(`[meeting-reminder] Pulando ${meeting.contact!.phone} — ${reason}`);
          await prisma.scheduledFollowUp.updateMany({
            where: { meetingId: meeting.id, stepNumber: step.minutesBefore, status: 'PENDING' },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
          return;
        }

        // Checar limite diário antes de enviar
        const { canSend, registerSent } = await import('./dailyLimitService');
        if (!await canSend()) {
          console.log(`[meeting-reminder] Limite diário atingido — lembrete para ${meeting.contact!.phone} NÃO enviado`);
          return;
        }

        // Marca SENT primeiro (atômico — padrão anti-duplicação)
        const updated = await prisma.scheduledFollowUp.updateMany({
          where: { meetingId: meeting.id, stepNumber: step.minutesBefore, status: 'PENDING' },
          data: { status: 'SENT', sentAt: new Date() },
        });
        if (updated.count === 0) return; // outro processo já enviou

        // Agora envia
        try {
          await client.sendText(meeting.contact!.phone!, message);
          await registerSent('reminder');
          console.log(`[meeting-reminder] Enviado lembrete ${faltaStr} para ${meeting.contact!.phone} (meeting ${meetingId})`);
        } catch (sendErr) {
          // Falhou — reverter para FAILED
          await prisma.scheduledFollowUp.updateMany({
            where: { meetingId: meeting.id, stepNumber: step.minutesBefore, status: 'SENT' },
            data: { status: 'FAILED' },
          }).catch(() => {});
          console.error(`[meeting-reminder] FALHA ao enviar para ${meeting.contact!.phone}:`, sendErr);
        }
      } catch (err) {
        console.error(`[meeting-reminder] Erro ao enviar lembrete meeting ${meetingId}:`, err);
        await prisma.scheduledFollowUp.updateMany({
          where: { meetingId: meeting.id, stepNumber: step.minutesBefore, status: 'PENDING' },
          data: { status: 'FAILED' },
        }).catch(() => {});
      }
    }, delay);

    timeouts.push(timeout);
    const delayMin = Math.round(delay / 60000);
    console.log(`[meeting-reminder] Scheduled ${step.minutesBefore}min reminder for meeting ${meetingId} (fires in ${delayMin}min)`);
  }

  if (timeouts.length > 0) {
    scheduledReminders.set(meetingId, timeouts);
  }
}

/**
 * Cancel all scheduled reminders for a meeting (e.g., when cancelled).
 */
export async function cancelMeetingReminders(meetingId: string, markCancelled = true): Promise<void> {
  const existing = scheduledReminders.get(meetingId);
  if (existing) {
    existing.forEach(t => clearTimeout(t));
    scheduledReminders.delete(meetingId);
    console.log(`[meeting-reminder] Cancelled reminders for meeting ${meetingId}`);
  }
  if (markCancelled) {
    // Real cancellation (meeting cancelled): mark as CANCELLED for audit trail
    await prisma.scheduledFollowUp.updateMany({
      where: { meetingId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }).catch(() => {});
  } else {
    // Re-scheduling: delete old PENDING so we don't leave duplicates
    await prisma.scheduledFollowUp.deleteMany({
      where: { meetingId, status: 'PENDING' },
    }).catch(() => {});
  }
}

/**
 * On server startup, schedule reminders for all upcoming meetings.
 * This ensures reminders work after server restart.
 */
export async function initMeetingReminders(): Promise<void> {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config?.meetingReminderEnabled) {
      console.log('[meeting-reminder] Disabled, skipping init');
      return;
    }

    // Seed defaults if empty
    const stepCount = await prisma.meetingReminderStep.count();
    if (stepCount === 0) {
      await prisma.meetingReminderStep.createMany({
        data: [
          { minutesBefore: 240, enabled: true, message: 'Olá {{nome}}! \nLembrete: sua reunião está marcada para *{{data}}* às *{{hora}}* (faltam {{falta}}).\nTe esperamos lá!' },
          { minutesBefore: 60, enabled: true, message: '{{nome}}, sua reunião começa em *{{falta}}*, às *{{hora}}*.\nTe esperamos!' },
          { minutesBefore: 15, enabled: true, message: '{{nome}}, sua reunião começa em *{{falta}}*!' },
        ],
      });
      console.log('[meeting-reminder] Seeded 3 default steps');
    }

    // Find all upcoming active meetings
    const upcomingMeetings = await prisma.calendlyEvent.findMany({
      where: {
        status: 'active',
        startTime: { gt: new Date() },
        contactId: { not: null },
      },
      select: { id: true },
    });

    for (const meeting of upcomingMeetings) {
      await scheduleMeetingReminders(meeting.id);
    }

    console.log(`[meeting-reminder] Initialized reminders for ${upcomingMeetings.length} upcoming meetings`);
  } catch (err) {
    console.error('[meeting-reminder] Init error:', err);
  }
}
