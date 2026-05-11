import { startAutomationCron } from './automationCron';
import { startEngagementCron } from './engagementCron';
import { startSegmentCountCron } from './segmentCountCron';
import { startLeadQualificationCron } from './leadQualificationCron';
import { startConversationAutoCloseCron } from './conversationAutoClose';
import { startWarmupJob } from './warmupJob';
import { initMeetingReminders } from '../services/meetingReminderScheduler';
import { initFollowUpScheduler } from '../services/followUpScheduler';
import { recoverStuckCampaigns } from '../routes/whatsapp-campaigns';
import { startMeetingReminderWabaCron } from './meetingReminderWabaCron';
import { startDailyReportCron } from './dailyReportCron';
import { startScheduledEmailCron } from './scheduledEmailCron';
import { runWabaTemplateHealthCheck } from './wabaTemplateHealthCheck';
import cron from 'node-cron';

export function startAllJobs() {
  // Recovery: campanhas que ficaram RUNNING após restart
  recoverStuckCampaigns().catch(console.error);

  startAutomationCron();
  startEngagementCron();
  startSegmentCountCron();
  startLeadQualificationCron();
  startConversationAutoCloseCron();
  startWarmupJob();

  // Event-driven schedulers (replace old polling crons)
  initMeetingReminders().catch(console.error);
  initFollowUpScheduler();

  // WABA meeting reminders (desativado por padrão — CloudWaConfig.wabaMeetingReminderEnabled)
  startMeetingReminderWabaCron();

  // Relatório diário do funil por email (7h BRT)
  startDailyReportCron();

  // Email campaigns agendadas (status=SCHEDULED com scheduledAt passado)
  startScheduledEmailCron();

  // Health check de templates WABA (a cada 1h)
  cron.schedule('0 * * * *', async () => {
    console.log('[waba-template-health-check] Iniciando ciclo de health check...');
    try {
      const result = await runWabaTemplateHealthCheck();
      console.log(
        `[waba-template-health-check] Ciclo concluído — ` +
        `total: ${result.total}, critical: ${result.critical}, ` +
        `warning: ${result.warning}, healthy: ${result.healthy}, unknown: ${result.unknown}`,
      );
    } catch (err) {
      console.error('[waba-template-health-check] Erro no ciclo:', err);
    }
  });
  console.log('[waba-template-health-check] Agendado: a cada 1h (cron 0 * * * *)');

  console.log('[jobs] All cron jobs started');
}
