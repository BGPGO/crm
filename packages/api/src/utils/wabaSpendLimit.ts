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
  marketingCount: number;
  utilityCount: number;
  marketingCost: number;
  utilityCost: number;
  totalCost: number;
  limitBRL: number;
  exceeded: boolean;
  remaining: number;
}

/**
 * Retorna o gasto WABA do dia atual e se o limite foi atingido.
 */
export async function getDailySpend(): Promise<DailySpendInfo> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Buscar limite configurado
  const config = await prisma.cloudWaConfig.findFirst({
    select: { dailySpendLimitBRL: true },
  });
  const limitBRL = config?.dailySpendLimitBRL ?? 40;

  // Contar templates enviados hoje por categoria
  const rows = await prisma.$queryRaw<Array<{ category: string; count: number }>>`
    SELECT ct.category, COUNT(*)::int as count
    FROM "WaMessage" wm
    JOIN "CloudWaTemplate" ct ON ct.name = wm."templateName"
    WHERE wm.direction = 'OUTBOUND'
      AND wm.type = 'TEMPLATE'
      AND wm."createdAt" >= ${today}
    GROUP BY ct.category
  `;

  const marketingCount = rows.find(r => r.category === 'MARKETING')?.count ?? 0;
  const utilityCount = rows.find(r => r.category === 'UTILITY')?.count ?? 0;

  const marketingCost = marketingCount * COST_MARKETING;
  const utilityCost = utilityCount * COST_UTILITY;
  const totalCost = Math.round((marketingCost + utilityCost) * 100) / 100;

  const exceeded = limitBRL > 0 && totalCost >= limitBRL;
  const remaining = limitBRL > 0 ? Math.max(0, Math.round((limitBRL - totalCost) * 100) / 100) : Infinity;

  return {
    marketingCount,
    utilityCount,
    marketingCost: Math.round(marketingCost * 100) / 100,
    utilityCost: Math.round(utilityCost * 100) / 100,
    totalCost,
    limitBRL,
    exceeded,
    remaining,
  };
}

/**
 * Retorna true se o limite diário NÃO foi atingido (pode enviar).
 */
export async function canSpend(): Promise<boolean> {
  const info = await getDailySpend();
  return !info.exceeded;
}
