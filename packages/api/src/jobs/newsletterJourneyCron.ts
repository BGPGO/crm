import cron from 'node-cron';
import { processWelcomeDue, runJourneyCheckpoints } from '../services/newsletterJourney';

export function startNewsletterJourneyCron() {
  // Welcome do assinante: fluxograma pede disparo 5min após o cadastro — o
  // tick de 5min dá uma folga máxima de ~10min, aceitável.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processWelcomeDue();
    } catch (error) {
      console.error('[newsletter-journey-cron] welcome:', error);
    }
  });

  // Régua de pontos + checkpoint + CTA do radar CS. De hora em hora: a edição
  // sai segunda 5h BRT, mas abertura/clique (e o CTA) acontecem a semana toda.
  cron.schedule('30 * * * *', async () => {
    try {
      const r = await runJourneyCheckpoints();
      if (r.qualificados > 0) {
        console.log(
          `[newsletter-journey-cron] checkpoint: ${r.avaliados} avaliados, ${r.qualificados} qualificados`
        );
      }
    } catch (error) {
      console.error('[newsletter-journey-cron] checkpoint:', error);
    }
  });

  console.log('[newsletter-journey-cron] Agendado: welcome */5min, checkpoint de hora em hora');
}
