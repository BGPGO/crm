import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { getDailyLimit } from '../services/dailyLimitService';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Retorna a "chave de data" de hoje em Brasília como Date em meia-noite UTC,
 * exatamente igual ao dailyLimitService.getTodayBrasilia().
 * Ex: se em Brasília é 20/03/2026, retorna new Date("2026-03-20T00:00:00.000Z")
 */
function getTodayUTCKey(offsetDays = 0): Date {
  const target = new Date(Date.now() - offsetDays * 86400000);
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(target);
  return new Date(dateStr + 'T00:00:00.000Z');
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

/** Faixas discretas idênticas ao dailyLimitService.calculateWarmupLimit */
function calculateWarmupLimit(daysSinceStart: number): number {
  // Limites conservadores para evitar ban do WhatsApp
  if (daysSinceStart <= 3) return 10;
  if (daysSinceStart <= 7) return 25;
  if (daysSinceStart <= 14) return 50;
  if (daysSinceStart <= 21) return 80;
  if (daysSinceStart <= 30) return 120;
  if (daysSinceStart <= 45) return 160;
  return -1; // usar limite configurado
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
    // Usa a mesma chave de data que o dailyLimitService grava (YYYY-MM-DDT00:00:00.000Z)
    const todayKey = getTodayUTCKey();

    const todayVolume = await prisma.whatsAppDailyVolume.findFirst({
      where: {
        date: todayKey,
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
      const now = new Date();
      const diffMs = now.getTime() - startDate.getTime();
      // Cálculo idêntico ao dailyLimitService.getDailyLimit()
      warmupCurrentDay = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      if (warmupCurrentDay > 30) {
        warmupCurrentDay = 30;
      }

      const warmupLimit = calculateWarmupLimit(warmupCurrentDay);
      warmupCurrentLimit = warmupLimit === -1 ? config.dailyMessageLimit : warmupLimit;
      warmupPhase = getWarmupPhase(warmupCurrentDay);

      const completionDate = new Date(startDate);
      completionDate.setUTCDate(completionDate.getUTCDate() + 30);
      warmupCompletedAt = completionDate.toISOString();
    }

    // Usa getDailyLimit() do service como fonte da verdade para o limite efetivo
    const effectiveLimit = await getDailyLimit();
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
    // Gera chaves de data com o mesmo padrão do dailyLimitService
    const dayKeys: Date[] = [];
    for (let i = 6; i >= 0; i--) {
      dayKeys.push(getTodayUTCKey(i));
    }

    const volumeRecords = await prisma.whatsAppDailyVolume.findMany({
      where: {
        date: { gte: dayKeys[0] },
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

    for (const dayKey of dayKeys) {
      const dateStr = formatDateBR(dayKey);
      const record = volumeRecords.find(
        (v) => v.date.getTime() === dayKey.getTime()
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
            gte: todayKey,
            lt: new Date(todayKey.getTime() + 86400000),
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
