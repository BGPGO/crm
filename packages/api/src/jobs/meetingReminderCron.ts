import prisma from '../lib/prisma';
import { EvolutionApiClient } from '../services/evolutionApiClient';

// Window of 2.5 minutes each side to catch reminders on the cron cycle
const CHECK_WINDOW_MS = 2.5 * 60 * 1000;

// In-memory cache of sent reminders (resets on restart — acceptable for MVP)
const sentReminders = new Set<string>();

function reminderKey(eventId: string, minutes: number): string {
  return `${eventId}:${minutes}`;
}

function formatMinutesLabel(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return h === 1 ? '1 hora' : `${h} horas`;
  }
  return `${minutes} minutos`;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

async function checkMeetingReminders() {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config?.meetingReminderEnabled) return;

    // Load enabled steps from DB
    const steps = await prisma.meetingReminderStep.findMany({
      where: { enabled: true },
      orderBy: { minutesBefore: 'desc' },
    });

    if (steps.length === 0) return;

    const maxMinutes = Math.max(...steps.map((s) => s.minutesBefore));
    const now = Date.now();

    // Find all active future meetings within the max look-ahead window
    const maxLookAhead = new Date(now + (maxMinutes + 15) * 60 * 1000);
    const meetings = await prisma.calendlyEvent.findMany({
      where: {
        status: 'active',
        startTime: {
          gte: new Date(now),
          lte: maxLookAhead,
        },
        contactId: { not: null },
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
      },
    });

    if (meetings.length === 0) return;

    // Check Z-API connection before processing
    let client: InstanceType<typeof EvolutionApiClient> | null = null;
    try {
      client = await EvolutionApiClient.fromConfig();
      const status = await client.getInstanceStatus();
      const state = (status as any)?.instance?.state || (status as any)?.state;
      if (state !== 'open' && state !== 'connected') {
        // WhatsApp not connected — skip all reminders silently
        return;
      }
    } catch {
      // Can't reach Z-API — skip silently
      return;
    }

    for (const meeting of meetings) {
      if (!meeting.contact?.phone) continue;

      const timeUntilMeeting = new Date(meeting.startTime).getTime() - now;

      for (const step of steps) {
        const targetTime = step.minutesBefore * 60 * 1000;
        const diff = Math.abs(timeUntilMeeting - targetTime);

        // Check if we're within the check window for this reminder
        if (diff <= CHECK_WINDOW_MS) {
          const key = reminderKey(meeting.id, step.minutesBefore);
          if (sentReminders.has(key)) continue;

          // Build template variables
          const contactName = meeting.contact.name || meeting.inviteeName || 'Ola';
          const meetingTime = new Date(meeting.startTime).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo',
          });
          const meetingDate = new Date(meeting.startTime).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            timeZone: 'America/Sao_Paulo',
          });

          const message = renderTemplate(step.message, {
            nome: contactName,
            data: meetingDate,
            hora: meetingTime,
            falta: formatMinutesLabel(step.minutesBefore),
          });

          try {
            if (!client) {
              client = await EvolutionApiClient.fromConfig();
            }
            await client.sendText(meeting.contact.phone, message);

            sentReminders.add(key);
            const label = formatMinutesLabel(step.minutesBefore);
            console.log(`[meeting-reminder] Sent ${label} reminder to ${meeting.contact.phone} for meeting ${meeting.id}`);
          } catch (err) {
            console.error(`[meeting-reminder] Failed to send reminder to ${meeting.contact.phone}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[meeting-reminder] Error checking reminders:', err);
  }
}

let intervalRef: ReturnType<typeof setInterval> | null = null;

export function startMeetingReminderCron() {
  // Check every 2 minutes
  intervalRef = setInterval(checkMeetingReminders, 2 * 60 * 1000);
  // Also run immediately
  checkMeetingReminders();
  console.log('[meeting-reminder] Cron started — checking every 2 minutes');
}

export function stopMeetingReminderCron() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
}
