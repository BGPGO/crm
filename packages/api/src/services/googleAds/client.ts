import type { DailyAdsSpend, ConnectionStatus } from '../dailyReport/types';

/**
 * Retorna gasto Google Ads do dia.
 * Lê da tabela ad_spend (populada via upload manual em POST /api/google-ads/upload).
 * Se a tabela não existir (migration pendente) ou nada for encontrado,
 * retorna objeto vazio — o relatório segue funcionando sem Google Ads.
 */
export async function getGoogleAdsDaily(date: Date): Promise<DailyAdsSpend> {
  try {
    const prisma = (await import('../../lib/prisma')).default;

    // @ts-ignore — prisma.adSpend só existe após migration + prisma generate
    if (!(prisma as any).adSpend) {
      return emptyResponse(date, 'NO_CONFIG');
    }

    const dateStart = startOfDay(date);
    const dateEnd = new Date(dateStart.getTime() + 86_400_000);

    const rows = await (prisma as any).adSpend.findMany({
      where: {
        source: 'GOOGLE_ADS',
        date: { gte: dateStart, lt: dateEnd },
      },
    });

    const totalSpend = rows.reduce((s: number, r: any) => s + Number(r.spend), 0);
    const totalLeads = rows.reduce((s: number, r: any) => s + r.leads, 0);

    return {
      source: 'GOOGLE_ADS',
      date: date.toISOString().slice(0, 10),
      totalSpend,
      totalLeads,
      campaigns: rows.map((r: any) => ({
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        spend: Number(r.spend),
        leads: r.leads,
        meetingsScheduled: 0,
        costPerLead: r.leads > 0 ? Number(r.spend) / r.leads : null,
        costPerMeeting: null,
      })),
      connectionStatus: 'OK',
    };
  } catch (err) {
    console.error('[googleAds] erro ao buscar dados diários:', err);
    return emptyResponse(date, 'ERROR');
  }
}

/**
 * Retorna gasto Google Ads acumulado do mês (MTD).
 * Lê da tabela ad_spend — gracioso se tabela ainda não existir.
 */
export async function getGoogleAdsMTD(date: Date): Promise<{ spend: number; leads: number }> {
  try {
    const prisma = (await import('../../lib/prisma')).default;

    // @ts-ignore
    if (!(prisma as any).adSpend) return { spend: 0, leads: 0 };

    const monthStart = startOfMonth(date);
    const dayEnd = endOfDay(date);

    const rows = await (prisma as any).adSpend.findMany({
      where: {
        source: 'GOOGLE_ADS',
        date: { gte: monthStart, lte: dayEnd },
      },
    });

    return {
      spend: rows.reduce((s: number, r: any) => s + Number(r.spend), 0),
      leads: rows.reduce((s: number, r: any) => s + r.leads, 0),
    };
  } catch (err) {
    console.error('[googleAds] erro ao buscar MTD:', err);
    return { spend: 0, leads: 0 };
  }
}

// ─── Helpers de data ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
