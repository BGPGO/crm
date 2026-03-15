import { startAutomationCron } from './automationCron';
import { startEngagementCron } from './engagementCron';
import { startSegmentCountCron } from './segmentCountCron';

export function startAllJobs() {
  startAutomationCron();
  startEngagementCron();
  startSegmentCountCron();
  console.log('[jobs] All cron jobs started');
}
