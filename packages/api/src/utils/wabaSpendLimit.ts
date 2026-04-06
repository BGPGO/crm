/**
 * WABA Daily Spend Limit
 *
 * Calcula o gasto do dia com templates WABA e verifica se o limite foi atingido.
 * Meta Brazil pricing (BRL):
 *   - MARKETING:  R$ 0,375 por template
 *   - UTILITY:    R$ 0,0477 por template
 *   - SERVICE:    R$ 0,00 (dentro da janela 24h — BIA não é afetada)
 */

import prisma from '../lib/prisma';

const COST_MARKETING = 0.375;
const COST_UTILITY = 0.0477;

export interface DailySpendInfo {
  // Automações (controladas pelo limite)
  automationMarketingCount: number;
  automationUtilityCount: number;
  automationCost: number;
  // Broadcasts (fora do limite)
  broadcastMarketingCount: number;
  broadcastUtilityCount: number;
  broadcastCost: number;
  // Totais (para referência)
  totalCost: number;
  limitBRL: number;
  exceeded: boolean;
  remaining: number;
  // Legacy compat
  marketingCount: number;
  utilityCount: number;
  marketingCost: number;
  utilityCost: number;
}

/**
 * Retorna o gasto WABA do dia, separando automações (dentro do limite) de broadcasts (fora do limite).
 *
 * Broadcasts são identificados por senderType = 'WA_SYSTEM' com um WaBroadcastContact vinculado.
 * Tudo o resto (cadências, bot, follow-ups) conta como automação e respeita o limite.
 */
export async function getDailySpend(): Promise<DailySpendInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Buscar limite configurado
  const config = await prisma.cloudWaConfig.findFirst({
    select: { dailySpendLimitBRL: true },
  });
  const limitBRL = config?.dailySpendLimitBRL ?? 40;

  // Contar templates enviados hoje por categoria, separando broadcast vs automação
  // Um template é "broadcast" se existe um WaBroadcastContact com waMessageId = wm.waMessageId
  const rows = await prisma.$queryRaw<Array<{ category: string; is_broadcast: boolean; count: number }>>`
    SELECT ct.category,
           (bc.id IS NOT NULL) as is_broadcast,
           COUNT(*)::int as count
    FROM "WaMessage" wm
    JOIN "CloudWaTemplate" ct ON ct.name = wm."templateName"
    LEFT JOIN "WaBroadcastContact" bc ON bc."waMessageId" = wm."waMessageId"
    WHERE wm.direction = 'OUTBOUND'
      AND wm.type = 'TEMPLATE'
      AND wm."createdAt" >= ${today}
    GROUP BY ct.category, (bc.id IS NOT NULL)
  `;

  let automationMarketingCount = 0, automationUtilityCount = 0;
  let broadcastMarketingCount = 0, broadcastUtilityCount = 0;

  for (const r of rows) {
    if (r.is_broadcast) {
      if (r.category === 'MARKETING') broadcastMarketingCount = r.count;
      if (r.category === 'UTILITY') broadcastUtilityCount = r.count;
    } else {
      if (r.category === 'MARKETING') automationMarketingCount = r.count;
      if (r.category === 'UTILITY') automationUtilityCount = r.count;
    }
  }

  const automationCost = Math.round((automationMarketingCount * COST_MARKETING + automationUtilityCount * COST_UTILITY) * 100) / 100;
  const broadcastCost = Math.round((broadcastMarketingCount * COST_MARKETING + broadcastUtilityCount * COST_UTILITY) * 100) / 100;
  const totalCost = Math.round((automationCost + broadcastCost) * 100) / 100;

  // Limite se aplica APENAS a automações
  const exceeded = limitBRL > 0 && automationCost >= limitBRL;
  const remaining = limitBRL > 0 ? Math.max(0, Math.round((limitBRL - automationCost) * 100) / 100) : Infinity;

  const marketingCount = automationMarketingCount + broadcastMarketingCount;
  const utilityCount = automationUtilityCount + broadcastUtilityCount;

  return {
    automationMarketingCount,
    automationUtilityCount,
    automationCost,
    broadcastMarketingCount,
    broadcastUtilityCount,
    broadcastCost,
    totalCost,
    limitBRL,
    exceeded,
    remaining,
    // Legacy compat
    marketingCount,
    utilityCount,
    marketingCost: Math.round(marketingCount * COST_MARKETING * 100) / 100,
    utilityCost: Math.round(utilityCount * COST_UTILITY * 100) / 100,
  };
}

/**
 * Retorna true se o limite diário de AUTOMAÇÕES NÃO foi atingido (pode enviar).
 * Broadcasts NÃO são contabilizados nesse limite.
 */
export async function canSpend(): Promise<boolean> {
  const info = await getDailySpend();
  return !info.exceeded;
}
