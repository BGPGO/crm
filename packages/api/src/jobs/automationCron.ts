import cron from 'node-cron';
import { processEnrollments } from '../services/automationEngine';

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
    } catch (error) {
      console.error('[automationCron] Error processing enrollments:', error);
    } finally {
      isProcessing = false;
    }
  });

  console.log('[automationCron] Scheduled: every 60 seconds');
}
