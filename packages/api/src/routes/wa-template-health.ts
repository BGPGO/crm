/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WABA Template Health — REST API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Expõe métricas de saúde dos templates WABA calculadas pelo job de health
 * check (wabaTemplateHealthCheck.ts) que roda a cada 1h.
 *
 *   GET  /api/wa/templates/health      — Dashboard de saúde (summary + lista)
 *   POST /api/wa/templates/health/run  — Execução manual on-demand do job
 *
 * Autenticação: herdada do middleware requireAuth em routes/index.ts
 *               (todas as rotas abaixo de router.use(requireAuth) são protegidas)
 *
 * Query params (GET):
 *   ?flag=CRITICAL|WARNING|HEALTHY|UNKNOWN  — filtrar por flag
 *   ?category=MARKETING|UTILITY|AUTHENTICATION — filtrar por categoria
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { runWabaTemplateHealthCheck } from '../jobs/wabaTemplateHealthCheck';

const router = Router();

// ─── GET /api/wa/templates/health ────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { flag, category } = req.query;

    const where: Record<string, any> = {};
    if (flag) {
      const validFlags = ['HEALTHY', 'WARNING', 'CRITICAL', 'UNKNOWN'];
      if (!validFlags.includes(flag as string)) {
        return next(
          createError(
            `Flag inválida: "${flag}". Use: ${validFlags.join(', ')}`,
            400,
          ),
        );
      }
      where.healthFlag = flag as string;
    }
    if (category) {
      where.category = category as string;
    }

    // Buscar templates ordenados por failRate7d DESC (mais críticos primeiro)
    const templates = await prisma.cloudWaTemplate.findMany({
      where,
      select: {
        name: true,
        category: true,
        status: true,
        healthFlag: true,
        failRate7d: true,
        sentCount7d: true,
        qualityScore: true,
        rejectedReason: true,
        lastHealthCheckAt: true,
      },
      orderBy: { failRate7d: 'desc' },
    });

    // Calcular summary com todos os templates (sem filtro de flag/category)
    const summary = await prisma.cloudWaTemplate.groupBy({
      by: ['healthFlag'],
      _count: { id: true },
    });

    const total = await prisma.cloudWaTemplate.count();

    const summaryMap: Record<string, number> = {
      critical: 0,
      warning: 0,
      healthy: 0,
      unknown: 0,
    };
    for (const row of summary) {
      const key = (row.healthFlag ?? 'unknown').toLowerCase();
      if (key in summaryMap) {
        summaryMap[key] = row._count.id;
      }
    }

    return res.json({
      summary: {
        total,
        critical: summaryMap.critical,
        warning: summaryMap.warning,
        healthy: summaryMap.healthy,
        unknown: summaryMap.unknown,
      },
      templates,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/wa/templates/health/run ───────────────────────────────────────

router.post('/run', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[wa-template-health] Execução manual solicitada via API');
    const result = await runWabaTemplateHealthCheck();
    return res.json({
      ok: true,
      result,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
