/**
 * Google Ads — cliente HTTP que consome a Edge Function `google-ads-insights`
 * do finhub. A Edge Function lê dados direto da Google Sheets que é a fonte
 * de verdade.
 *
 * Env vars necessárias:
 *   GOOGLE_ADS_INTERNAL_API_URL — URL da Edge Function no Supabase finhub
 *   GOOGLE_ADS_INTERNAL_SECRET  — secret compartilhado
 */
export { getGoogleAdsDaily, getGoogleAdsMTD } from './client';
