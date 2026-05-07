/**
 * Smoke test — chama getGoogleAdsDaily/getGoogleAdsMTD diretamente.
 * Não toca Prisma. Útil pra validar a integração com a Edge Function
 * sem depender do banco do CRM.
 *
 * Uso:
 *   GOOGLE_ADS_INTERNAL_API_URL=... GOOGLE_ADS_INTERNAL_SECRET=... \
 *     npx tsx src/scripts/testGoogleAdsClient.ts 2026-05-05
 */
import { getGoogleAdsDaily, getGoogleAdsMTD } from '../services/googleAds';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: testGoogleAdsClient.ts YYYY-MM-DD');
    process.exit(1);
  }
  const [y, m, d] = arg.split('-').map(Number);
  const refDate = new Date(Date.UTC(y, m - 1, d));

  const [daily, mtd] = await Promise.all([
    getGoogleAdsDaily(refDate),
    getGoogleAdsMTD(refDate),
  ]);

  console.log('=== getGoogleAdsDaily ===');
  console.log(JSON.stringify(daily, null, 2));
  console.log('\n=== getGoogleAdsMTD ===');
  console.log(JSON.stringify(mtd, null, 2));
}
main().catch((err) => { console.error(err); process.exit(1); });
