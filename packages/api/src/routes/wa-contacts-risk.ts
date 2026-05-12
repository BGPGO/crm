/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WA Contacts Risk API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Retorna info de risco de um contato para a UI de chat mostrar warnings
 * antes de enviar templates MARKETING.
 *
 *   GET /api/wa/contacts/:contactId/risk
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// ─── GET /api/wa/contacts/:contactId/risk ────────────────────────────────────
// Info de risco para a UI de chat — hasCapHitTag, lastMarketingAt, hoursSince

router.get('/:contactId/risk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactId } = req.params;

    // 1) Verificar se contato tem a tag wa-cap-hit
    const capHit = await prisma.contactTag.findFirst({
      where: {
        contactId,
        tag: { name: 'wa-cap-hit' },
      },
      select: { id: true },
    });

    // 2) Última mensagem OUTBOUND TEMPLATE MARKETING enviada para este contato
    const conv = await prisma.waConversation.findFirst({
      where: { contactId },
      select: { phone: true },
    });

    let lastMarketingAt: Date | null = null;

    if (conv?.phone) {
      // Carregar nomes de templates MARKETING (V1 simples — sem cache)
      const marketingTemplates = await prisma.cloudWaTemplate.findMany({
        where: { category: 'MARKETING' },
        select: { name: true },
      });
      const marketingNames = marketingTemplates.map((t) => t.name);

      if (marketingNames.length > 0) {
        const lastMsg = await prisma.waMessage.findFirst({
          where: {
            direction: 'OUTBOUND',
            type: 'TEMPLATE',
            templateName: { in: marketingNames },
            conversation: { phone: conv.phone },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        lastMarketingAt = lastMsg?.createdAt ?? null;
      }
    }

    const now = new Date();
    const hoursSinceLastMarketing = lastMarketingAt
      ? Math.floor((now.getTime() - lastMarketingAt.getTime()) / (1000 * 60 * 60))
      : null;

    res.json({
      data: {
        hasCapHitTag: !!capHit,
        lastMarketingAt: lastMarketingAt ? lastMarketingAt.toISOString() : null,
        hoursSinceLastMarketing,
        capHitBlocksMarketing: !!capHit, // atalho para a UI saber se MARKETING vai ser bloqueado
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
