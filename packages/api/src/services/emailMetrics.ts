import prisma from '../lib/prisma';

export interface CampaignMetrics {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  spam: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface OverallMetrics {
  totalCampaigns: number;
  totalEmailsSent: number;
  averageOpenRate: number;
  averageClickRate: number;
}

export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const sends = await prisma.emailSend.groupBy({
    by: ['status'],
    where: { emailCampaignId: campaignId },
    _count: { status: true },
  });

  const statusCounts: Record<string, number> = {};
  for (const row of sends) {
    statusCounts[row.status] = row._count.status;
  }

  const total = Object.values(statusCounts).reduce((sum, c) => sum + c, 0);
  const sent = statusCounts['SENT'] || 0;
  const delivered = statusCounts['DELIVERED'] || 0;
  const opened = statusCounts['OPENED'] || 0;
  const clicked = statusCounts['CLICKED'] || 0;
  const bounced = statusCounts['BOUNCED'] || 0;
  const spam = statusCounts['SPAM'] || 0;
  const unsubscribed = statusCounts['UNSUBSCRIBED'] || 0;

  const openRate = delivered > 0 ? opened / delivered : 0;
  const clickRate = opened > 0 ? clicked / opened : 0;
  const bounceRate = total > 0 ? bounced / total : 0;

  return {
    total,
    sent,
    delivered,
    opened,
    clicked,
    bounced,
    spam,
    unsubscribed,
    openRate,
    clickRate,
    bounceRate,
  };
}

export async function getOverallMetrics(): Promise<OverallMetrics> {
  const totalCampaigns = await prisma.emailCampaign.count({
    where: { status: { in: ['SENDING', 'SENT'] } },
  });

  const totalEmailsSent = await prisma.emailSend.count();

  // Get all campaigns that have sends to compute averages
  const campaigns = await prisma.emailCampaign.findMany({
    where: { status: { in: ['SENDING', 'SENT'] } },
    select: { id: true },
  });

  let totalOpenRate = 0;
  let totalClickRate = 0;
  let campaignsWithData = 0;

  for (const campaign of campaigns) {
    const metrics = await getCampaignMetrics(campaign.id);
    if (metrics.total > 0) {
      totalOpenRate += metrics.openRate;
      totalClickRate += metrics.clickRate;
      campaignsWithData++;
    }
  }

  const averageOpenRate = campaignsWithData > 0 ? totalOpenRate / campaignsWithData : 0;
  const averageClickRate = campaignsWithData > 0 ? totalClickRate / campaignsWithData : 0;

  return {
    totalCampaigns,
    totalEmailsSent,
    averageOpenRate,
    averageClickRate,
  };
}
