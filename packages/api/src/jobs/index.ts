import { startAutomationCron } from './automationCron';
import { startEngagementCron } from './engagementCron';
import { startSegmentCountCron } from './segmentCountCron';
import { startLeadQualificationCron } from './leadQualificationCron';
import { startConversationAutoCloseCron } from './conversationAutoClose';
import { startMeetingReminderCron } from './meetingReminderCron';

export function startAllJobs() {
  startAutomationCron();
  startEngagementCron();
  startSegmentCountCron();
  startLeadQualificationCron();
  startConversationAutoCloseCron();
  startMeetingReminderCron();
  console.log('[jobs] All cron jobs started');
}
