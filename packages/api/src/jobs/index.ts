import { startAutomationCron } from './automationCron';
import { startEngagementCron } from './engagementCron';
import { startSegmentCountCron } from './segmentCountCron';
import { startLeadQualificationCron } from './leadQualificationCron';
import { startConversationAutoCloseCron } from './conversationAutoClose';
import { startMeetingReminderCron } from './meetingReminderCron';
import { startFollowUpCron } from '../services/whatsappFollowUp';

export function startAllJobs() {
  startAutomationCron();
  startEngagementCron();
  startSegmentCountCron();
  startLeadQualificationCron();
  startConversationAutoCloseCron();
  startMeetingReminderCron();
  startFollowUpCron();
  console.log('[jobs] All cron jobs started');
}
