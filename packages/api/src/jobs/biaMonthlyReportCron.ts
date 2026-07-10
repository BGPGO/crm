import cron from 'node-cron';
import { runBiaMonthlyReport } from '../services/biaMonthlyReport';

/**
 * Relatório mensal da BIA — dia 7 de cada mês às 8h BRT (11:00 UTC).
 * Janela canônica [dia 7 do mês anterior → dia 7 do atual), definida em
 * services/biaMonthlyReport/metrics.ts.
 */
export function startBiaMonthlyReportCron() {
  cron.schedule('0 11 7 * *', async () => {
    console.log('[bia-monthly-report-cron] Iniciando relatório mensal da BIA...');
    try {
      const result = await runBiaMonthlyReport();
      console.log(
        `[bia-monthly-report-cron] Concluído — email ${result.emailId}, demanda FinHub ${result.finhubDemandId}`,
      );
    } catch (error) {
      console.error('[bia-monthly-report-cron] Erro:', error);
    }
  });
  console.log('[bia-monthly-report-cron] Agendado: dia 7 de cada mês às 8h BRT (cron 0 11 7 * *)');
}
