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

  console.log('[jobs] All cron jobs started');
}
