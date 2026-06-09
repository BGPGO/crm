import cron from 'node-cron';
import { runFinhubActiveClientsSync } from '../services/finhubActiveClients';

// Sincroniza o segmento "Clientes Ativos" com o FinHub uma vez por dia (3h BRT).
export function startFinhubActiveClientsSync() {
  cron.schedule('0 6 * * *', async () => {
    console.log('[finhubActiveClients] Iniciando sync diário...');
    try {
      await runFinhubActiveClientsSync();
    } catch (err) {
      console.error('[finhubActiveClients] Erro no sync:', err);
    }
  });
  console.log('[finhubActiveClients] Agendado: diário às 06:00 UTC (03:00 BRT)');
}
