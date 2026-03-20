import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Start of today in Brasília (UTC-3) */
function todayBrasilia(): Date {
  const now = new Date();
  // Brasília = UTC-3
  const brasiliaOffset = -3 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brasiliaMinutes = utcMinutes + brasiliaOffset;

  const d = new Date(now);
  if (brasiliaMinutes < 0) {
    // Still previous day in Brasília
    d.setUTCDate(d.getUTCDate() - 1);
  }
  d.setUTCHours(3, 0, 0, 0); // midnight Brasília = 03:00 UTC
  return d;
}

function formatDateBR(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function getWarmupPhase(day: number): string {
  if (day <= 3) return 'Fase 1 (1-3 dias) — Aquecimento inicial';
  if (day <= 7) return 'Fase 2 (4-7 dias) — Crescimento lento';
  if (day <= 14) return 'Fase 3 (8-14 dias) — Crescimento moderado';
  if (day <= 21) return 'Fase 4 (15-21 dias) — Crescimento acelerado';
  return 'Fase 5 (22-30 dias) — Estabilização';
}

function getWarmupLimit(day: number, targetLimit: number): number {
  // Linear ramp from ~10% to 100% over 30 days
  const percent = Math.min(day / 30, 1);
  return Math.max(10, Math.round(targetLimit * percent));
}

// ─── GET /api/whatsapp/status ───────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // ── Config ──────────────────────────────────────────────────────────────
    let config = await prisma.whatsAppConfig.findFirst();
    if (!config) {
      config = await prisma.whatsAppConfig.create({ data: {} });
    }

    // ── Instance status ─────────────────────────────────────────────────────
    const instance = {
      status: config.connectionStatus as string,
      phone: config.botPhoneNumber || config.companyPhone || '',
    };

    // ── Today's volume ──────────────────────────────────────────────────────
    const todayStart = todayBrasilia();
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    const todayVolume = await prisma.whatsAppDailyVolume.findFirst({
      where: {
        date: {
          gte: todayStart,
          lt: tomorrowStart,
        },
      },
    });

    // ── Warmup ──────────────────────────────────────────────────────────────
    let warmupCurrentDay: number | null = null;
    let warmupCurrentLimit: number | null = null;
    let warmupPhase: string | null = null;
    let warmupCompletedAt: string | null = null;
    const warmupEnabled = config.warmupEnabled;

    if (warmupEnabled && config.warmupStartDate) {
      const startDate = new Date(config.warmupStartDate);
      const diffMs = todayStart.getTime() - startDate.getTime();
      warmupCurrentDay = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

      if (warmupCurrentDay > 30) {
        warmupCurrentDay = 30;
      }

      warmupCurrentLimit = getWarmupLimit(warmupCurrentDay, config.dailyMessageLimit);
      warmupPhase = getWarmupPhase(warmupCurrentDay);

      const completionDate = new Date(startDate);
      completionDate.setUTCDate(completionDate.getUTCDate() + 30);
      warmupCompletedAt = completionDate.toISOString();
    }

    const effectiveLimit = warmupCurrentLimit ?? config.dailyMessageLimit;
    const used = todayVolume?.total ?? 0;
    const remaining = Math.max(0, effectiveLimit - used);
    const usedPercent = effectiveLimit > 0 ? Math.round((used / effectiveLimit) * 100) : 0;

    const daily = {
      limit: effectiveLimit,
      used,
      remaining,
      usedPercent: Math.min(usedPercent, 100),
      breakdown: {
        campaign: todayVolume?.campaign ?? 0,
        followUp: todayVolume?.followUp ?? 0,
        reminder: todayVolume?.reminder ?? 0,
      },
      resetsAt: '09:00 de amanhã',
    };

    const warmup = {
      enabled: warmupEnabled,
      startDate: config.warmupStartDate?.toISOString() ?? null,
      currentDay: warmupCurrentDay,
      currentLimit: warmupCurrentLimit,
      phase: warmupPhase,
      completedAt: warmupCompletedAt,
    };

    // ── Campaigns ───────────────────────────────────────────────────────────
    const [campaignCounts, last7daysCampaigns] = await Promise.all([
      prisma.whatsAppCampaign.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.whatsAppCampaign.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    const campaignMap: Record<string, number> = {};
    let totalCampaigns = 0;
    for (const c of campaignCounts) {
      campaignMap[c.status] = c._count.id;
      totalCampaigns += c._count.id;
    }

    const campaigns = {
      running: campaignMap['RUNNING'] ?? 0,
      paused: campaignMap['PAUSED'] ?? 0,
      completed: campaignMap['COMPLETED'] ?? 0,
      total: totalCampaigns,
      last7days: last7daysCampaigns,
    };

    // ── Volume history (last 7 days) ────────────────────────────────────────
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const volumeRecords = await prisma.whatsAppDailyVolume.findMany({
      where: {
        date: { gte: sevenDaysAgo },
      },
      orderBy: { date: 'asc' },
    });

    // Build a map of date -> volume for all 7 days
    const volumeHistory: Array<{
      date: string;
      total: number;
      campaign: number;
      followUp: number;
      reminder: number;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = formatDateBR(d);
      const dStart = new Date(d);
      dStart.setUTCHours(3, 0, 0, 0);
      const dEnd = new Date(dStart);
      dEnd.setUTCDate(dEnd.getUTCDate() + 1);

      const record = volumeRecords.find(
        (v) => v.date >= dStart && v.date < dEnd
      );

      volumeHistory.push({
        date: dateStr,
        total: record?.total ?? 0,
        campaign: record?.campaign ?? 0,
        followUp: record?.followUp ?? 0,
        reminder: record?.reminder ?? 0,
      });
    }

    // ── Follow-ups ──────────────────────────────────────────────────────────
    const [pendingFollowUps, sentTodayFollowUps] = await Promise.all([
      prisma.scheduledFollowUp.count({
        where: { status: 'PENDING' },
      }),
      prisma.scheduledFollowUp.count({
        where: {
          status: 'SENT',
          sentAt: {
            gte: todayStart,
            lt: tomorrowStart,
          },
        },
      }),
    ]);

    const followUps = {
      pending: pendingFollowUps,
      sentToday: sentTodayFollowUps,
    };

    // ── Protections ─────────────────────────────────────────────────────────
    const protections = {
      businessHours: true, // Always enforced by the system
      dailyLimit: config.dailyMessageLimit > 0,
      warmupActive: config.warmupEnabled,
      optOutEnabled: true, // Always enforced
      circuitBreaker: true, // Always enforced
      randomDelay: true, // Always enforced
    };

    // ── Response ────────────────────────────────────────────────────────────
    res.json({
      instance,
      daily,
      warmup,
      campaigns,
      volumeHistory,
      followUps,
      protections,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
