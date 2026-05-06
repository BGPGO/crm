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

  function toDailyAdsSpend(d: ContiaMetaAdsResponse, status: ConnectionStatus): DailyAdsSpend {
    return {
      source: 'META_ADS',
      date: d.date,
      totalSpend: d.totalSpend,
      totalLeads: d.totalLeads,
      campaigns: d.campaigns.map((c) => ({
        campaignId: c.id,
        campaignName: c.name,
        spend: c.spend,
        leads: c.leads,
        meetingsScheduled: 0,
        costPerLead: c.leads > 0 ? c.spend / c.leads : null,
        costPerMeeting: null,
      })),
      connectionStatus: status,
    };
  }

  function hasData(d: ContiaMetaAdsResponse | null): boolean {
    return !!d && (d.totalSpend > 0 || d.totalLeads > 0 || (d.campaigns?.length ?? 0) > 0);
  }

  // 1ª tentativa: endpoint LIVE (fetch direto Meta API). Funciona pra "ontem"
  // mesmo quando o snapshot do dia ainda não foi consolidado pelo cron das 4h.
  let liveResult: ContiaMetaAdsResponse | null = null;
  try {
    liveResult = await fetchInsights(buildLiveUrl(apiUrl, empresaId, dateStr), secret);
    if (hasData(liveResult)) return toDailyAdsSpend(liveResult!, 'OK');
    console.warn('[metaAds] live retornou vazio — tentando retry após 3s');
  } catch (err) {
    console.warn('[metaAds] live falhou — tentando retry após 3s:', err instanceof Error ? err.message : err);
  }

  // Retry do /live após 3s — Meta API às vezes consolida com lag de minutos
  // após meia-noite. Esse retry pega janelas onde a 1ª chamada veio vazia
  // mas a Meta já tem os dados disponíveis.
  await new Promise((r) => setTimeout(r, 3000));
  try {
    const liveRetry = await fetchInsights(buildLiveUrl(apiUrl, empresaId, dateStr), secret);
    if (hasData(liveRetry)) {
      console.log('[metaAds] retry do live trouxe dados — usando');
      return toDailyAdsSpend(liveRetry!, 'OK');
    }
  } catch (err) {
    console.warn('[metaAds] retry do live falhou:', err instanceof Error ? err.message : err);
  }

  // 2ª tentativa: snapshot do banco (cache atualizado pelo cron 04h BRT do ContIA)
  const url = buildUrl(apiUrl, empresaId, dateStr);
  let snapshotResult: ContiaMetaAdsResponse | null = null;
  try {
    snapshotResult = await fetchInsights(url, secret);
    if (hasData(snapshotResult)) return toDailyAdsSpend(snapshotResult!, 'OK');
  } catch (err) {
    console.error('[metaAds] Erro ao chamar /insights:', err instanceof Error ? err.message : err);
  }

  // 3ª camada: ambos zeraram. Provável falha invisível (token expirou, Meta API
  // bug, snapshot furado). Retorna o melhor que temos com status STALE pra que
  // o relatório mostre banner de alerta em vez de "Sem investimento ontem".
  console.error(
    `[metaAds] STALE: live e snapshot ambos retornaram vazio para ${dateStr}. ` +
    `Possíveis causas: token Meta expirado, Meta API instável, ou cron noturno furado.`,
  );
  const fallback = snapshotResult ?? liveResult;
  if (fallback) return toDailyAdsSpend(fallback, 'STALE');
  return emptyResponse(date, 'STALE');
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
