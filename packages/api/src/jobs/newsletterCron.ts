import cron from 'node-cron';
import { runNewsletterAutomation } from '../services/newsletterAutomation';

export function startNewsletterCron() {
  // Segunda 5h da manhã, horário de São Paulo (UTC-3 = 08:00 UTC)
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('[newsletter-cron] Montando e enviando a edição semanal...');
      await runNewsletterAutomation();
    } catch (error) {
      console.error('[newsletter-cron] Erro:', error);
    }
  });

  console.log('[newsletter-cron] Agendado: segunda 5h BRT (cron 0 8 * * 1 UTC)');
}
