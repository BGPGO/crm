import cron from 'node-cron';
import prisma from '../lib/prisma';
import { getDailyLimit } from '../services/dailyLimitService';

export function startWarmupJob() {
  // Roda todo dia às 00:05 horário de Brasília
  cron.schedule('5 0 * * *', async () => {
    try {
      const config = await prisma.whatsAppConfig.findFirst();

      if (!config || !config.warmupEnabled || !config.warmupStartDate) {
        console.log('[warmup] Warmup desativado ou não configurado');
        return;
      }

      const now = new Date();
      const diffMs = now.getTime() - config.warmupStartDate.getTime();
      const daysSinceStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const limit = await getDailyLimit();

      console.log(`[warmup] Dia ${daysSinceStart} — limite diário: ${limit} mensagens`);
    } catch (error) {
      console.error('[warmup] Erro ao verificar warmup:', error);
    }
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[warmupJob] Scheduled: daily at 00:05');
}
