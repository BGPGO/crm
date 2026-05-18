/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Template Circuit-Breaker
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bloqueia envios automáticos de templates que estão apresentando taxa de
 * falha elevada nos últimos 7 dias, prevenindo desperdício de quota e
 * possível impacto na qualidade da conta WABA.
 *
 * Threshold: failRate7d > 30% AND sentCount7d >= 5
 *
 * Os campos failRate7d / sentCount7d / healthFlag são sincronizados a cada
 * 1h pelo job wabaTemplateHealthCheck — este módulo apenas consulta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import prisma from '../../lib/prisma';

const DEGRADED_FAIL_THRESHOLD = 0.30;
const DEGRADED_MIN_SAMPLES = 5;

export interface CircuitBreakerResult {
  blocked: boolean;
  reason?: string;
  failRate?: number;
  sentCount?: number;
}

/**
 * Verifica se um template está degradado e deve ter envios bloqueados.
 *
 * @param templateName - Nome do template (ex: "confirmacao_reuniao")
 * @returns CircuitBreakerResult com `blocked=true` se o template não deve ser enviado
 */
export async function checkTemplateCircuitBreaker(
  templateName: string,
): Promise<CircuitBreakerResult> {
  try {
    const t = await prisma.cloudWaTemplate.findFirst({
      where: { name: templateName },
      select: {
        failRate7d: true,
        sentCount7d: true,
        healthFlag: true,
        status: true,
      },
    });

    if (!t) return { blocked: false };

    if (
      t.failRate7d > DEGRADED_FAIL_THRESHOLD &&
      t.sentCount7d >= DEGRADED_MIN_SAMPLES
    ) {
      return {
        blocked: true,
        reason: `TEMPLATE_DEGRADED (failRate=${(t.failRate7d * 100).toFixed(1)}% sent7d=${t.sentCount7d})`,
        failRate: t.failRate7d,
        sentCount: t.sentCount7d,
      };
    }

    return { blocked: false };
  } catch (err) {
    // Em caso de falha na consulta, NÃO bloqueamos — preferimos enviar e arriscar
    // do que travar toda a automação por falha no circuit-breaker
    console.error('[templateCircuitBreaker] Erro ao consultar circuit-breaker:', err);
    return { blocked: false };
  }
}
