export type {
  ReportSection, AdsDriver, DailyAdsSpend, AdsCampaignSpend, BgpMessengerStats
} from './types';
export { FunnelSection } from './sections/funnelSection';
export { PaidTrafficSection } from './sections/paidTrafficSection';
export { DigitalChannelsSection } from './sections/digitalChannelsSection';

import { FunnelSection } from './sections/funnelSection';
import { PaidTrafficSection } from './sections/paidTrafficSection';
import { DigitalChannelsSection } from './sections/digitalChannelsSection';

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function getYesterdayBRT(): Date {
  const now = new Date();
  const brtNow = new Date(now.getTime() + BRT_OFFSET_MS);
  const yesterday = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate() - 1));
  return new Date(yesterday.getTime() - BRT_OFFSET_MS); // 00:00 BRT yesterday em UTC
}

/**
 * Compõe o relatório diário completo (3 seções).
 * Cada section é independente — falha de uma não derruba o relatório inteiro.
 */
export async function buildDailyReportHtml(referenceDate?: Date): Promise<string> {
  const refDate = referenceDate || getYesterdayBRT();

  const sections = [
    new FunnelSection(refDate),
    new PaidTrafficSection(refDate),
    new DigitalChannelsSection(refDate),
  ];

  // Render todas em paralelo, com timeout individual
  const htmlBlocks = await Promise.all(
    sections.map(s => withTimeout(s.render(), 30000, '<div style="padding:20px;color:#991b1b;">Seção indisponível (timeout)</div>'))
  );

  // Wrapper externo
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Diário do Funil</title>
</head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,sans-serif;">
  ${htmlBlocks.map(html => `<div style="margin-bottom:24px;">${html}</div>`).join('\n')}
</body>
</html>`;
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }).catch(err => {
      clearTimeout(timer);
      console.error('[buildDailyReportHtml] section error:', err);
      resolve(fallback);
    });
  });
}
