// dailyLimitService.ts
// Controla volume diário de mensagens proativas (campanhas + follow-ups + lembretes)
// NÃO conta mensagens da Bia respondendo usuários (Caminho A)

import prisma from '../lib/prisma';

type ProactiveSource = 'campaign' | 'followUp' | 'reminder';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrCreateTodayVolume() {
  const today = startOfDay();

  const existing = await prisma.whatsAppDailyVolume.findUnique({
    where: { date: today },
  });

  if (existing) return existing;

  return prisma.whatsAppDailyVolume.create({
    data: { date: today },
  });
}

async function getConfig() {
  const config = await prisma.whatsAppConfig.findFirst();
  return config;
}

// ─── Warmup Logic ────────────────────────────────────────────────────────────

function calculateWarmupLimit(daysSinceStart: number): number {
  if (daysSinceStart <= 3) return 20;
  if (daysSinceStart <= 7) return 50;
  if (daysSinceStart <= 14) return 100;
  if (daysSinceStart <= 21) return 200;
  if (daysSinceStart <= 30) return 400;
  return -1; // signal to use configured limit
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Retorna o limite diário atual, levando em conta warmup progressivo.
 */
export async function getDailyLimit(): Promise<number> {
  const config = await getConfig();
  if (!config) return 200; // fallback

  if (!config.warmupEnabled || !config.warmupStartDate) {
    return config.dailyMessageLimit;
  }

  const now = new Date();
  const diffMs = now.getTime() - config.warmupStartDate.getTime();
  const daysSinceStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysSinceStart < 1) return 20; // same day as start

  const warmupLimit = calculateWarmupLimit(daysSinceStart);

  // Dias 31+ → usa o limite configurado pelo admin
  if (warmupLimit === -1) {
    return config.dailyMessageLimit;
  }

  return warmupLimit;
}

/**
 * Verifica se ainda há cota para enviar mensagens hoje.
 */
export async function canSend(): Promise<boolean> {
  const volume = await getOrCreateTodayVolume();
  const limit = await getDailyLimit();
  return volume.total < limit;
}

/**
 * Registra uma mensagem proativa enviada (campanha, follow-up ou lembrete).
 */
export async function registerSent(source: ProactiveSource): Promise<void> {
  const today = startOfDay();

  // Garante que o registro do dia existe
  await getOrCreateTodayVolume();

  const fieldMap: Record<ProactiveSource, 'campaign' | 'followUp' | 'reminder'> = {
    campaign: 'campaign',
    followUp: 'followUp',
    reminder: 'reminder',
  };

  const field = fieldMap[source];

  await prisma.whatsAppDailyVolume.update({
    where: { date: today },
    data: {
      [field]: { increment: 1 },
      total: { increment: 1 },
    },
  });
}

/**
 * Retorna quantas mensagens ainda podem ser enviadas hoje.
 */
export async function getRemainingToday(): Promise<number> {
  const volume = await getOrCreateTodayVolume();
  const limit = await getDailyLimit();
  return Math.max(0, limit - volume.total);
}
