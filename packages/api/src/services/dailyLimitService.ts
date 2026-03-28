// dailyLimitService.ts
// Controla volume diário de TODAS as mensagens WhatsApp enviadas.
// Após 2 bans, toda mensagem conta — incluindo respostas do bot.

import prisma from '../lib/prisma';

type SendSource = 'campaign' | 'followUp' | 'reminder' | 'botResponse' | 'sdrFirstContact';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTodayBrasilia(): Date {
  const now = new Date();
  const brasiliaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  return new Date(brasiliaDate + 'T00:00:00.000Z');
}

async function getOrCreateTodayVolume() {
  const today = getTodayBrasilia();
  return prisma.whatsAppDailyVolume.upsert({
    where: { date: today },
    create: { date: today },
    update: {},
  });
}

async function getConfig() {
  return prisma.whatsAppConfig.findFirst();
}

// ─── Warmup Logic (POST-BAN: muito conservador) ─────────────────────────────

// Conta foi banida 2x. WhatsApp coloca em watchlist.
// Warmup precisa ser MUITO mais lento que uma conta nova.
function calculateWarmupLimit(daysSinceStart: number): number {
  if (daysSinceStart <= 2) return 5;    // Primeiros 2 dias: quase nada
  if (daysSinceStart <= 5) return 10;   // Dias 3-5: mínimo
  if (daysSinceStart <= 10) return 15;  // Dias 6-10: cauteloso
  if (daysSinceStart <= 15) return 25;  // Dias 11-15: subindo devagar
  if (daysSinceStart <= 21) return 40;  // Dias 16-21: moderado
  if (daysSinceStart <= 30) return 60;  // Dias 22-30: normal baixo
  return -1; // usa limite configurado
}

// Limite SEPARADO para first-contact (cold outreach) — o maior trigger de ban
function calculateFirstContactLimit(daysSinceStart: number): number {
  if (daysSinceStart <= 5) return 2;    // Quase zero cold outreach
  if (daysSinceStart <= 10) return 3;
  if (daysSinceStart <= 15) return 5;
  if (daysSinceStart <= 21) return 8;
  if (daysSinceStart <= 30) return 10;
  return 15; // max 15 first-contacts/dia mesmo em cruzeiro
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getDailyLimit(): Promise<number> {
  const config = await getConfig();
  if (!config) return 5; // fallback ultra-conservador

  if (!config.warmupEnabled || !config.warmupStartDate) {
    return config.dailyMessageLimit;
  }

  const now = new Date();
  const diffMs = now.getTime() - config.warmupStartDate.getTime();
  const daysSinceStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysSinceStart < 1) return 3; // mesmo dia do start

  const warmupLimit = calculateWarmupLimit(daysSinceStart);
  if (warmupLimit === -1) return config.dailyMessageLimit;
  return warmupLimit;
}

export async function getFirstContactLimit(): Promise<number> {
  const config = await getConfig();
  if (!config) return 2;

  if (!config.warmupEnabled || !config.warmupStartDate) {
    return 15; // sem warmup, limita a 15
  }

  const now = new Date();
  const diffMs = now.getTime() - config.warmupStartDate.getTime();
  const daysSinceStart = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return calculateFirstContactLimit(daysSinceStart);
}

/**
 * Verifica se ainda pode enviar hoje.
 * Para first-contact (SDR IA, cadência first msg), checa limite separado.
 */
export async function canSend(source?: SendSource): Promise<boolean> {
  const volume = await getOrCreateTodayVolume();
  const limit = await getDailyLimit();

  if (volume.total >= limit) return false;

  // First-contact tem limite próprio, muito mais restritivo
  if (source === 'sdrFirstContact') {
    const firstContactLimit = await getFirstContactLimit();
    // Count first-contacts from today's activities
    const today = getTodayBrasilia();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const firstContactCount = await prisma.activity.count({
      where: {
        type: 'NOTE',
        content: { contains: 'SDR IA ativada' },
        createdAt: { gte: today, lt: tomorrow },
      },
    });
    if (firstContactCount >= firstContactLimit) {
      console.log(`[DailyLimit] Limite de first-contact atingido: ${firstContactCount}/${firstContactLimit}`);
      return false;
    }
  }

  return true;
}

/**
 * Registra uma mensagem enviada.
 */
export async function registerSent(source: SendSource): Promise<void> {
  const today = getTodayBrasilia();
  await getOrCreateTodayVolume();

  // Map all sources to DB fields (botResponse and sdrFirstContact count as followUp)
  const fieldMap: Record<SendSource, 'campaign' | 'followUp' | 'reminder'> = {
    campaign: 'campaign',
    followUp: 'followUp',
    reminder: 'reminder',
    botResponse: 'followUp',
    sdrFirstContact: 'followUp',
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

export async function getRemainingToday(): Promise<number> {
  const volume = await getOrCreateTodayVolume();
  const limit = await getDailyLimit();
  return Math.max(0, limit - volume.total);
}
