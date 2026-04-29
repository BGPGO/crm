/**
 * Meta Ads — cliente HTTP que consome a rota interna do ContIA.
 *
 * GET {META_ADS_INTERNAL_API_URL}/api/internal/meta-ads/insights
 * Headers: x-internal-secret: {META_ADS_INTERNAL_SECRET}
 * Query:   date=YYYY-MM-DD & empresa_id={META_ADS_EMPRESA_ID}
 *
 * Env vars necessárias:
 *   META_ADS_INTERNAL_API_URL — URL base do ContIA (ex: https://contia.bertuzzipatrimonial.com.br)
 *   META_ADS_INTERNAL_SECRET  — secret compartilhado
 *   META_ADS_EMPRESA_ID       — UUID da empresa no ContIA
 */

import type { DailyAdsSpend, AdsCampaignSpend, ConnectionStatus } from '../dailyReport/types';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ContiaMetaAdsResponse {
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

// ── Helper: resposta vazia ────────────────────────────────────────────────────

function emptyResponse(date: Date, status: ConnectionStatus = 'ERROR'): DailyAdsSpend {
  return {
    source: 'META_ADS',
    date: date.toISOString().slice(0, 10),
    totalSpend: 0,
    totalLeads: 0,
    campaigns: [],
    connectionStatus: status,
  };
}

// ── Helper: montar URL ────────────────────────────────────────────────────────

function buildUrl(apiUrl: string, empresaId: string, dateStr: string): string {
  return `${apiUrl}/api/internal/meta-ads/insights?date=${dateStr}&empresa_id=${empresaId}`;
}

function buildLiveUrl(apiUrl: string, empresaId: string, dateStr: string): string {
  return `${apiUrl}/api/internal/meta-ads/live?date=${dateStr}&empresa_id=${empresaId}`;
}

// ── Helper: fetch com timeout ─────────────────────────────────────────────────

async function fetchInsights(
  url: string,
  secret: string
): Promise<ContiaMetaAdsResponse | null> {
  const res = await fetch(url, {
    headers: {
      'x-internal-secret': secret,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[metaAds] HTTP ${res.status} ao chamar ContIA: ${body}`);
    return null;
  }

  return res.json() as Promise<ContiaMetaAdsResponse>;
}

// ── Exports públicos ──────────────────────────────────────────────────────────

/**
 * Retorna gasto do dia + breakdown por campanha.
 * Em caso de env vars ausentes ou erro de rede, retorna DailyAdsSpend zerado.
 */
export async function getMetaAdsDaily(date: Date): Promise<DailyAdsSpend> {
  const apiUrl = process.env.META_ADS_INTERNAL_API_URL;
  const secret = process.env.META_ADS_INTERNAL_SECRET;
  const empresaId = process.env.META_ADS_EMPRESA_ID;

  if (!apiUrl || !secret || !empresaId) {
    console.warn('[metaAds] env vars não configuradas (META_ADS_INTERNAL_API_URL / META_ADS_INTERNAL_SECRET / META_ADS_EMPRESA_ID) — retornando vazio');
    return emptyResponse(date, 'NO_CONFIG');
  }

  const dateStr = date.toISOString().slice(0, 10);

  // 1ª tentativa: endpoint LIVE (fetch direto Meta API). Funciona pra "ontem"
  // mesmo quando o snapshot do dia ainda não foi consolidado pelo cron das 4h.
  try {
    const liveData = await fetchInsights(buildLiveUrl(apiUrl, empresaId, dateStr), secret);
    if (liveData && (liveData.totalSpend > 0 || liveData.totalLeads > 0 || (liveData.campaigns?.length ?? 0) > 0)) {
      const campaigns: AdsCampaignSpend[] = liveData.campaigns.map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        spend: c.spend,
        leads: c.leads,
        meetingsScheduled: 0,
        costPerLead: c.leads > 0 ? c.spend / c.leads : null,
        costPerMeeting: null,
      }));
      return {
        source: 'META_ADS',
        date: liveData.date,
        totalSpend: liveData.totalSpend,
        totalLeads: liveData.totalLeads,
        campaigns,
        connectionStatus: 'OK',
      };
    }
    // Live retornou vazio — pode ser que Meta realmente tem 0 OU live falhou silenciosamente.
    // Fallback pro snapshot abaixo (que pode ter dados pré-consolidados de cron passado).
    console.warn('[metaAds] live retornou vazio — caindo pro snapshot');
  } catch (err) {
    console.warn('[metaAds] live falhou — caindo pro snapshot:', err instanceof Error ? err.message : err);
  }

  // 2ª tentativa: snapshot do banco (cache atualizado pelo cron 04h BRT do ContIA)
  const url = buildUrl(apiUrl, empresaId, dateStr);
  try {
    const data = await fetchInsights(url, secret);
    if (!data) return emptyResponse(date, 'ERROR');

    const campaigns: AdsCampaignSpend[] = data.campaigns.map((c) => ({
      campaignId: c.id,
      campaignName: c.name,
      spend: c.spend,
      leads: c.leads,
      meetingsScheduled: 0,
      costPerLead: c.leads > 0 ? c.spend / c.leads : null,
      costPerMeeting: null,
    }));

    return {
      source: 'META_ADS',
      date: data.date,
      totalSpend: data.totalSpend,
      totalLeads: data.totalLeads,
      campaigns,
      connectionStatus: 'OK',
    };
  } catch (err) {
    console.error('[metaAds] Erro ao chamar ContIA:', err instanceof Error ? err.message : err);
    return emptyResponse(date, 'ERROR');
  }
}

/**
 * Retorna gasto Month-to-Date (mês até a data).
 * Reutiliza a mesma rota do ContIA — endpoint já calcula monthToDate.
 */
export async function getMetaAdsMTD(date: Date): Promise<{ spend: number; leads: number }> {
  const apiUrl = process.env.META_ADS_INTERNAL_API_URL;
  const secret = process.env.META_ADS_INTERNAL_SECRET;
  const empresaId = process.env.META_ADS_EMPRESA_ID;

  if (!apiUrl || !secret || !empresaId) {
    console.warn('[metaAds] env vars não configuradas — retornando MTD zerado');
    return { spend: 0, leads: 0 };
  }

  const dateStr = date.toISOString().slice(0, 10);
  const url = buildUrl(apiUrl, empresaId, dateStr);

  try {
    const data = await fetchInsights(url, secret);
    if (!data) return { spend: 0, leads: 0 };
    return data.monthToDate;
  } catch (err) {
    console.error('[metaAds] Erro ao buscar MTD do ContIA:', err instanceof Error ? err.message : err);
    return { spend: 0, leads: 0 };
  }
}
