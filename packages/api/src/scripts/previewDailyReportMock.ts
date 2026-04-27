/**
 * Preview do relatório diário com dados mockados — não toca em Prisma nem APIs externas.
 *
 * Útil para validar a renderização visual sem precisar de DATABASE_URL ou de
 * conectividade com ContIA/bgpmassa. Os números seguem o PDF modelo
 * (crm/relatorio-modelo.pdf) sempre que aplicável.
 *
 * Uso: npx tsx src/scripts/previewDailyReportMock.ts
 */

import * as fs from 'fs';
import type {
  ReportSection,
  DailyAdsSpend,
  AdsCampaignSpend,
  BgpMessengerStats,
} from '../services/dailyReport/types';

// Mock dos drivers externos antes de importar as sections
import * as metaAdsModule from '../services/metaAds';
import * as googleAdsModule from '../services/googleAds';
import * as bgpmassaModule from '../services/bgpmassa';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockMetaDaily: DailyAdsSpend = {
  source: 'META_ADS',
  date: '2026-04-25',
  totalSpend: 377.77,
  totalLeads: 6,
  campaigns: [
    {
      campaignId: 'meta:1',
      campaignName: 'Captação Controladoria — Vídeo 1',
      spend: 220.5,
      leads: 4,
      meetingsScheduled: 0,
      costPerLead: 55.13,
      costPerMeeting: null,
    },
    {
      campaignId: 'meta:2',
      campaignName: 'Remarketing — BI',
      spend: 157.27,
      leads: 2,
      meetingsScheduled: 0,
      costPerLead: 78.64,
      costPerMeeting: null,
    },
  ] as AdsCampaignSpend[],
};

const mockGoogleDaily: DailyAdsSpend = {
  source: 'GOOGLE_ADS',
  date: '2026-04-25',
  totalSpend: 0,
  totalLeads: 0,
  campaigns: [],
};

const mockMetaMTD = { spend: 8120.5, leads: 142 };
const mockGoogleMTD = { spend: 0, leads: 0 };

const mockMessenger: BgpMessengerStats = {
  date: '2026-04-25',
  inbound: 412,
  outbound: 216,
  total: 628,
};

// Stub-injection
(metaAdsModule as any).getMetaAdsDaily = async () => mockMetaDaily;
(metaAdsModule as any).getMetaAdsMTD = async () => mockMetaMTD;
(googleAdsModule as any).getGoogleAdsDaily = async () => mockGoogleDaily;
(googleAdsModule as any).getGoogleAdsMTD = async () => mockGoogleMTD;
(bgpmassaModule as any).getBgpMessengerDailyStats = async () => mockMessenger;

// Mock prisma — substitui antes das sections importarem
import prisma from '../lib/prisma';

const fakeDeals = [
  { value: 5000 }, { value: 8500 }, { value: 12000 }, { value: 6500 },
];
const fakeWonOntem = [{ value: 25000 }];
const fakeWonMes = [
  { value: 25000 }, { value: 18500 }, { value: 12000 }, { value: 32000 },
];

const dealCount = async (_: any) => 11;
const dealFindMany = async (args: any) => {
  const status = args?.where?.status;
  if (status === 'WON') {
    const closedAt = args?.where?.closedAt;
    if (closedAt?.gte && (Date.now() - closedAt.gte.getTime()) > 86_400_000 * 2) {
      return fakeWonMes;
    }
    return fakeWonOntem;
  }
  return fakeDeals;
};
const activityCount = async (args: any) => {
  const meta = args?.where?.metadata?.string_contains;
  if (meta === 'Reunião agendada') return 2;
  if (meta === 'Proposta enviada') return 3;
  if (meta === 'Aguardando dados') return 1;
  if (meta === 'Aguardando assinatura') return 1;
  if (meta === 'Contato feito') return 4;
  return 0;
};
const calendlyFindMany = async () => [
  { inviteeName: 'Carlos Silva', inviteeEmail: 'carlos@ex.com' },
  { inviteeName: 'Juliana Souza', inviteeEmail: 'ju@ex.com' },
];
const calendlyCount = async () => 2;
const waMessageCount = async () => 184;
const waConversationCount = async (args: any) => {
  if (args?.where?.meetingBooked) return 5;
  return 38;
};
const emailFindFirst = async () => ({
  id: 'campaign:1',
  subject: 'Como reduzir custo tributário em 2026',
  totalRecipients: 4500,
  sentAt: new Date('2026-04-25T20:00:00Z'),
});
const calendlyEventCount = async () => 4;

(prisma as any).deal = { count: dealCount, findMany: dealFindMany };
(prisma as any).activity = { count: activityCount };
(prisma as any).calendlyEvent = { findMany: calendlyFindMany, count: calendlyCount };
(prisma as any).waMessage = { count: waMessageCount };
(prisma as any).waConversation = { count: waConversationCount };
(prisma as any).emailCampaign = { findFirst: emailFindFirst };

// Mock emailMetrics
import * as emailMetricsModule from '../services/emailMetrics';
(emailMetricsModule as any).getCampaignMetrics = async () => ({
  total: 4500,
  opened: 540,
  clicked: 18,
  bounced: 22,
});

// ─── Importa sections DEPOIS dos mocks ───────────────────────────────────────

import {
  FunnelSection,
  PaidTrafficSection,
  DigitalChannelsSection,
} from '../services/dailyReport';

async function main() {
  const referenceDate = new Date('2026-04-25T03:00:00Z'); // 00:00 BRT 25/04

  const sections: ReportSection[] = [
    new FunnelSection(referenceDate),
    new PaidTrafficSection(referenceDate),
    new DigitalChannelsSection(referenceDate),
  ];

  const blocks = await Promise.all(sections.map((s) => s.render()));

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório Diário do Funil — Mock</title>
</head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,sans-serif;">
  ${blocks.map((b) => `<div style="margin-bottom:24px;">${b}</div>`).join('\n')}
</body>
</html>`;

  const path = process.platform === 'win32' ? 'C:/tmp/preview-relatorio-mock.html' : '/tmp/preview-relatorio-mock.html';
  fs.writeFileSync(path, html);
  console.log('Mock preview salvo em', path);
}

main().catch((err) => {
  console.error('Erro ao gerar mock preview:', err);
  process.exit(1);
});
