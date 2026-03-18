import { startAutomationCron } from './automationCron';
import { startEngagementCron } from './engagementCron';
import { startSegmentCountCron } from './segmentCountCron';
import { startLeadQualificationCron } from './leadQualificationCron';
import { startConversationAutoCloseCron } from './conversationAutoClose';
import { initMeetingReminders } from '../services/meetingReminderScheduler';
import { initFollowUpScheduler } from '../services/followUpScheduler';

export function startAllJobs() {
  startAutomationCron();
  startEngagementCron();
  startSegmentCountCron();
  startLeadQualificationCron();
  startConversationAutoCloseCron();

  // Event-driven schedulers (replace old polling crons)
  initMeetingReminders().catch(console.error);
  initFollowUpScheduler().catch(console.error);

  console.log('[jobs] All cron jobs started');
}
