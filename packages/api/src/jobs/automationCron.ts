import cron from 'node-cron';
import { processEnrollments } from '../services/automationEngine';
import prisma from '../lib/prisma';

let isProcessing = false;

export function startAutomationCron() {
  cron.schedule('* * * * *', async () => {
    if (isProcessing) {
      console.log('[automationCron] Previous run still in progress, skipping');
      return;
    }

    isProcessing = true;

    try {
      console.log('[automationCron] Processing automation enrollments...');
      const result = await processEnrollments();
      console.log('[automationCron] Done:', result);

      // Rede de segurança: processar lembretes pendentes/falhados que o setTimeout não enviou
      await processOverdueReminders();
    } catch (error) {
      console.error('[automationCron] Error processing enrollments:', error);
    } finally {
      isProcessing = false;
    }
  });

  console.log('[automationCron] Scheduled: every 60 seconds');
}

/**
 * Rede de segurança para lembretes de reunião.
 * Processa lembretes PENDING vencidos e retenta FAILED (após 5 min).
 */
async function processOverdueReminders(): Promise<void> {
  try {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Buscar lembretes PENDING vencidos + FAILED para retry
    const overdueReminders = await prisma.scheduledFollowUp.findMany({
      where: {
        type: 'MEETING_REMINDER',
        OR: [
          { status: 'PENDING', scheduledAt: { lte: now } },
          { status: 'FAILED', scheduledAt: { lte: fiveMinAgo } }, // retry de falhas após 5 min
        ],
      },
      take: 10, // Limitar para não sobrecarregar
    });

    if (overdueReminders.length === 0) return;

    console.log(`[meeting-reminder-backup] Encontrados ${overdueReminders.length} lembretes pendentes/falhados vencidos`);

    const { ZApiClient } = await import('../services/zapiClient');
    const client = await ZApiClient.fromConfig();

    // Verificar Z-API uma vez só (não por lembrete)
    let zapiConnected = false;
    try {
      const status = await client.getInstanceStatus();
      const state = status?.instance?.state?.toLowerCase() || '';
      zapiConnected = state === 'open' || state === 'connected';
    } catch {
      console.warn('[meeting-reminder-backup] Não foi possível verificar status Z-API');
    }

    if (!zapiConnected) {
      console.warn('[meeting-reminder-backup] Z-API desconectada — pulando lembretes');
      return;
    }

    for (const reminder of overdueReminders) {
      // Buscar a reunião vinculada
      const meeting = reminder.meetingId
        ? await prisma.calendlyEvent.findUnique({
            where: { id: reminder.meetingId },
            include: { contact: { select: { id: true, phone: true, name: true } } },
          })
        : null;

      if (!meeting || meeting.status !== 'active' || !meeting.contact?.phone) {
        // Cancelar lembrete órfão
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        continue;
      }

      // Verificar se a reunião já passou (não faz sentido enviar lembrete pós-reunião)
      if (new Date(meeting.startTime).getTime() < now.getTime()) {
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        console.log(`[meeting-reminder-backup] Reunião ${meeting.id} já passou — cancelando lembrete`);
        continue;
      }

      // Verificar opt-out
      const conv = await prisma.whatsAppConversation.findFirst({
        where: { contactId: meeting.contact.id },
        select: { optedOut: true },
      });
      if (conv?.optedOut) {
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        continue;
      }

      // Para FAILED, marcar como PENDING antes de tentar (anti-duplicação vai checar PENDING)
      if (reminder.status === 'FAILED') {
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'PENDING' },
        });
      }

      // Trava anti-duplicação: marca SENT antes de enviar
      const updated = await prisma.scheduledFollowUp.updateMany({
        where: { id: reminder.id, status: 'PENDING' },
        data: { status: 'SENT', sentAt: now },
      });
      if (updated.count === 0) continue; // outro processo já pegou

      // Montar mensagem
      const steps = await prisma.meetingReminderStep.findMany({ where: { enabled: true } });
      const step = steps.find(s => s.minutesBefore === reminder.stepNumber);
      if (!step) {
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'FAILED' },
        });
        continue;
      }

      const meetingDate = new Date(meeting.startTime);
      const dateStr = meetingDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const timeStr = meetingDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      const minutesLeft = step.minutesBefore;
      let faltaStr: string;
      if (minutesLeft >= 1440) faltaStr = `${Math.floor(minutesLeft / 1440)} dia(s)`;
      else if (minutesLeft >= 60) faltaStr = `${Math.floor(minutesLeft / 60)} hora(s)`;
      else faltaStr = `${minutesLeft} minutos`;

      const message = step.message
        .replace(/\{\{nome\}\}/gi, meeting.contact.name || '')
        .replace(/\{\{data\}\}/gi, dateStr)
        .replace(/\{\{hora\}\}/gi, timeStr)
        .replace(/\{\{falta\}\}/gi, faltaStr);

      // Checar limite diário
      const { canSend, registerSent } = await import('../services/dailyLimitService');
      if (!await canSend()) {
        console.log(`[meeting-reminder-backup] Limite diário atingido — pulando lembrete para ${meeting.contact.phone}`);
        // Reverter para PENDING para tentar amanhã
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'PENDING' },
        }).catch(() => {});
        continue;
      }

      try {
        await client.sendText(meeting.contact.phone, message);
        await registerSent('reminder');
        console.log(`[meeting-reminder-backup] Enviado lembrete para ${meeting.contact.phone} (meeting ${meeting.id})`);
      } catch (err) {
        // Reverter para FAILED
        await prisma.scheduledFollowUp.update({
          where: { id: reminder.id },
          data: { status: 'FAILED' },
        });
        console.error(`[meeting-reminder-backup] FALHA ao enviar para ${meeting.contact.phone}:`, err);
      }
    }
  } catch (err) {
    console.error('[meeting-reminder-backup] Erro geral:', err);
  }
}
