import type { BgpMessengerStats, ConnectionStatus } from '../dailyReport/types';

function empty(dateStr: string, status: ConnectionStatus): BgpMessengerStats {
  return { date: dateStr, inbound: 0, outbound: 0, total: 0, connectionStatus: status };
}

export async function getBgpMessengerDailyStats(date: Date): Promise<BgpMessengerStats> {
  const apiUrl = process.env.BGPMASSA_API_URL || 'https://messenger.bertuzzipatrimonial.com.br';
  const dateStr = date.toISOString().slice(0, 10);
  const url = `${apiUrl}/api/messages/daily-count?date=${dateStr}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn('[bgpmassa] HTTP', res.status, await res.text());
      return empty(dateStr, 'ERROR');
    }
    const data = await res.json() as BgpMessengerStats;
    return { ...data, connectionStatus: 'OK' };
  } catch (err) {
    console.error('[bgpmassa] erro ao buscar stats diários:', err);
    return empty(dateStr, 'ERROR');
  }
}
