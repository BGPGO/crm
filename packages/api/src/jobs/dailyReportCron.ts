import cron from 'node-cron';
import { sendDailyReport } from '../services/dailyReportService';

export function startDailyReportCron() {
  // 7h da manhã, horário de São Paulo (UTC-3 = 10:00 UTC)
  cron.schedule('0 10 * * *', async () => {
    try {
      console.log('[daily-report-cron] Sending daily funnel report...');
      await sendDailyReport();
    } catch (error) {
      console.error('[daily-report-cron] Error:', error);
    }
  });

  console.log('[daily-report-cron] Scheduled: daily at 7 AM (BRT)');
}
