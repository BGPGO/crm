/**
 * Google Ads — cliente HTTP que consome a rota interna do finhub.
 *
 * GET {GOOGLE_ADS_INTERNAL_API_URL}?date=YYYY-MM-DD
 * Headers: x-internal-secret: {GOOGLE_ADS_INTERNAL_SECRET}
 *
 * GOOGLE_ADS_INTERNAL_API_URL deve apontar pra Edge Function `google-ads-insights`
 * deployada no Supabase do finhub. Exemplo:
 *   https://pbtheffdoebfryttkyge.supabase.co/functions/v1/google-ads-insights
 *
 * A Edge Function lê uma planilha Google Sheets que é a fonte de verdade
 * (mesma planilha consumida pelo cron `sync-google-ads` do finhub) e devolve
 * agregação diária + MTD no formato esperado pelo relatório.
 *
 * Em caso de env vars ausentes ou erro de rede, retorna DailyAdsSpend zerado
 * com connectionStatus apropriado — o relatório segue funcionando.
 */

import type { DailyAdsSpend, ConnectionStatus } from '../dailyReport/types';

interface FinhubGoogleAdsResponse {
  date: string;
  totalSpend: number;
  totalLeads: number;
  currency: string;
  campaigns: Array<{
    id: string;
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    conversionValue: number;
  }>;
  monthToDate: { spend: number; leads: number };
}

function emptyResponse(date: Date, status: ConnectionStatus = 'ERROR'): DailyAdsSpend {
  return {
    source: 'GOOGLE_ADS',
    date: date.toISOString().slice(0, 10),
    totalSpend: 0,
    totalLeads: 0,
    campaigns: [],
    connectionStatus: status,
  };
}

async function fetchInsights(
  apiUrl: string,
  secret: string,
  dateStr: string,
): Promise<FinhubGoogleAdsResponse | null> {
  const url = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}date=${dateStr}`;
  const res = await fetch(url, {
    headers: {
      'x-internal-secret': secret,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[googleAds] HTTP ${res.status} ao chamar finhub: ${body}`);
    return null;
  }
  return (await res.json()) as FinhubGoogleAdsResponse;
}

/**
 * Retorna gasto Google Ads do dia + breakdown por campanha.
 */
export async function getGoogleAdsDaily(date: Date): Promise<DailyAdsSpend> {
  const apiUrl = process.env.GOOGLE_ADS_INTERNAL_API_URL;
  const secret = process.env.GOOGLE_ADS_INTERNAL_SECRET;

  if (!apiUrl || !secret) {
    console.warn(
      '[googleAds] env vars ausentes (GOOGLE_ADS_INTERNAL_API_URL / GOOGLE_ADS_INTERNAL_SECRET) — retornando vazio',
    );
    return emptyResponse(date, 'NO_CONFIG');
  }

  const dateStr = date.toISOString().slice(0, 10);

  try {
    const data = await fetchInsights(apiUrl, secret, dateStr);
    if (!data) return emptyResponse(date, 'ERROR');

    return {
      source: 'GOOGLE_ADS',
      date: data.date,
      totalSpend: data.totalSpend,
      totalLeads: data.totalLeads,
      campaigns: data.campaigns.map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        spend: c.spend,
        leads: c.leads,
        meetingsScheduled: 0,
        costPerLead: c.leads > 0 ? c.spend / c.leads : null,
        costPerMeeting: null,
      })),
      connectionStatus: 'OK',
    };
  } catch (err) {
    console.error(
      '[googleAds] erro ao buscar dados diários:',
      err instanceof Error ? err.message : err,
    );
    return emptyResponse(date, 'ERROR');
  }
}

/**
 * Retorna gasto Google Ads acumulado do mês (MTD).
 * Reutiliza a mesma chamada do daily — finhub já calcula `monthToDate`.
 */
export async function getGoogleAdsMTD(date: Date): Promise<{ spend: number; leads: number }> {
  const apiUrl = process.env.GOOGLE_ADS_INTERNAL_API_URL;
  const secret = process.env.GOOGLE_ADS_INTERNAL_SECRET;

  if (!apiUrl || !secret) return { spend: 0, leads: 0 };

  const dateStr = date.toISOString().slice(0, 10);

  try {
    const data = await fetchInsights(apiUrl, secret, dateStr);
    if (!data) return { spend: 0, leads: 0 };
    return data.monthToDate;
  } catch (err) {
    console.error(
      '[googleAds] erro ao buscar MTD:',
      err instanceof Error ? err.message : err,
    );
    return { spend: 0, leads: 0 };
  }
}
