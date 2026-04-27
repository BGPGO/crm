/**
 * Rotas Google Ads — fase 1 (importação manual via JSON).
 *
 * POST /api/google-ads/upload
 *   Body: { rows: [{ date, campaignId?, campaignName, spend, leads? }] }
 *   Auth: requireAuth + role ADMIN ou MANAGER
 *   Resposta: { imported: number, total: number }
 *
 * Após aprovação do Google Ads Developer Token (≈4 semanas), esta rota
 * pode ser substituída por integração direta com a API oficial.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Todas as rotas abaixo exigem autenticação
router.use(requireAuth);

/**
 * POST /api/google-ads/upload
 *
 * Importa dados de gasto de campanhas Google Ads manualmente.
 * Aceita array de linhas no body; faz upsert em ad_spend por (date, source, campaignId).
 *
 * Exemplo de body:
 * {
 *   "rows": [
 *     { "date": "2026-04-26", "campaignName": "Captação Controladoria", "spend": 150.50, "leads": 3 },
 *     { "date": "2026-04-26", "campaignId": "gads:123456", "campaignName": "BI Empresarial", "spend": 80.00, "leads": 1 }
 *   ]
 * }
 */
router.post(
  '/upload',
  requireRole('ADMIN', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = (await import('../lib/prisma')).default;

      // Verificar se tabela ad_spend já existe (migration pode não ter rodado em prod)
      if (!(prisma as any).adSpend) {
        return res.status(503).json({
          error: 'Tabela ad_spend ainda não existe. Execute a migration 001_ad_spend.sql no Supabase antes de importar.',
        });
      }

      const rows = req.body?.rows;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ error: 'Body deve conter campo "rows" com um array de registros.' });
      }

      if (rows.length === 0) {
        return res.json({ imported: 0, total: 0, message: 'Nenhuma linha para importar.' });
      }

      let imported = 0;
      const erros: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Validações básicas
        if (!row.date) {
          erros.push(`Linha ${i + 1}: campo "date" obrigatório.`);
          continue;
        }
        if (!row.campaignName) {
          erros.push(`Linha ${i + 1}: campo "campaignName" obrigatório.`);
          continue;
        }
        if (row.spend == null || isNaN(Number(row.spend))) {
          erros.push(`Linha ${i + 1}: campo "spend" inválido ou ausente.`);
          continue;
        }

        const date = new Date(row.date);
        if (isNaN(date.getTime())) {
          erros.push(`Linha ${i + 1}: data inválida "${row.date}". Use formato YYYY-MM-DD.`);
          continue;
        }

        // Normaliza a data para meia-noite UTC (compatível com DATE do Postgres)
        const dateOnly = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

        const campaignId: string = row.campaignId
          ? String(row.campaignId)
          : `manual:${String(row.campaignName).toLowerCase().replace(/\s+/g, '-')}`;

        const spend = Number(row.spend);
        const leads = Number(row.leads ?? 0);

        await (prisma as any).adSpend.upsert({
          where: {
            date_source_campaignId: {
              date: dateOnly,
              source: 'GOOGLE_ADS',
              campaignId,
            },
          },
          update: {
            campaignName: String(row.campaignName),
            spend,
            leads,
            syncedAt: new Date(),
          },
          create: {
            // id gerado pelo Prisma (cuid) se não passado
            date: dateOnly,
            source: 'GOOGLE_ADS',
            campaignId,
            campaignName: String(row.campaignName),
            spend,
            leads,
          },
        });

        imported++;
      }

      const response: Record<string, unknown> = { imported, total: rows.length };
      if (erros.length > 0) {
        response.avisos = erros;
      }

      return res.json(response);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/google-ads/status
 *
 * Retorna se a tabela ad_spend está disponível e quantos registros existem.
 * Útil para o frontend verificar se a migration já foi aplicada.
 */
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = (await import('../lib/prisma')).default;

    if (!(prisma as any).adSpend) {
      return res.json({
        ready: false,
        message: 'Tabela ad_spend não encontrada. Execute a migration 001_ad_spend.sql.',
      });
    }

    const count = await (prisma as any).adSpend.count({
      where: { source: 'GOOGLE_ADS' },
    });

    return res.json({ ready: true, registros: count });
  } catch (err) {
    next(err);
  }
});

export default router;
