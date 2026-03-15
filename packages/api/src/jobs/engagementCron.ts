import cron from 'node-cron';
import { recalculateAllScores } from '../services/leadScoreEngine';

export function startEngagementCron() {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[engagementCron] Recalculating engagement levels for all contacts...');
      const result = await recalculateAllScores();
      console.log('[engagementCron] Done:', result);
    } catch (error) {
      console.error('[engagementCron] Error recalculating scores:', error);
    }
  });

  console.log('[engagementCron] Scheduled: daily at 2 AM');
}
