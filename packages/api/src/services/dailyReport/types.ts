/**
 * Tipos compartilhados do redesign do relatório diário das 7h.
 *
 * Quem usa:
 * - Squad Beta  (metaAds/client.ts)         — implementa AdsDriver pra Meta
 * - Squad Gamma (googleAds/client.ts)       — implementa AdsDriver pra Google + CSV
 * - Squad Delta (bgpmassa/client.ts)        — produz BgpMessengerStats
 * - Squad Epsilon (sections/funnelSection)  — implementa ReportSection
 *
 * Convenções:
 * - Datas em string usam YYYY-MM-DD (timezone-aware: BRT por padrão).
 * - Decimais financeiros chegam aqui como `number` (R$). A camada de persistência
 *   converte de/para Prisma.Decimal.
 * - Falhas em render() NUNCA devem lançar — devolvem HTML de fallback.
 */

// ─── Render seções ──────────────────────────────────────────────────────────

export interface ReportSection {
  /**
   * Renderiza HTML da seção (string).
   * Falhas devem retornar HTML de fallback, NUNCA throw.
   */
  render(): Promise<string>;
}

// ─── Drivers de tráfego pago (Meta Ads / Google Ads) ────────────────────────

export type AdSourceLiteral = 'META_ADS' | 'GOOGLE_ADS';

export interface AdsDriver {
  source: AdSourceLiteral;
  /** Retorna gasto agregado do dia + breakdown por campanha. */
  getDailySpend(date: Date): Promise<DailyAdsSpend>;
  /** Total gasto MTD (mês até a data). */
  getMTDSpend(date: Date): Promise<{ spend: number; leads: number }>;
}

/**
 * Status da conexão com a fonte de dados.
 * - OK: dado veio da API (mesmo que zerado — zero genuíno)
 * - NO_CONFIG: env vars ausentes, integração não configurada
 * - ERROR: falha técnica (timeout, HTTP 4xx/5xx, parsing)
 * - STALE: live e snapshot ambos retornaram 0 — provável falha invisível upstream
 *
 * Sections devem mostrar badge "sem conexão" quando status != 'OK'.
 */
export type ConnectionStatus = 'OK' | 'NO_CONFIG' | 'ERROR' | 'STALE';

export interface DailyAdsSpend {
  source: AdSourceLiteral;
  date: string; // YYYY-MM-DD
  totalSpend: number;
  totalLeads: number;
  campaigns: AdsCampaignSpend[];
  connectionStatus?: ConnectionStatus;
}

export interface AdsCampaignSpend {
  campaignId: string;
  campaignName: string;
  spend: number;
  leads: number;
  meetingsScheduled: number;
  costPerLead: number | null;
  costPerMeeting: number | null;
}

// ─── Canais Digitais — bgpmassa (Messenger) ─────────────────────────────────

export interface BgpMessengerStats {
  date: string; // YYYY-MM-DD
  inbound: number;
  outbound: number;
  total: number;
  connectionStatus?: ConnectionStatus;
}
