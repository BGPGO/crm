import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { NewsletterLinksMap } from '../services/newsletterService';

const router = Router();

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const FALLBACK_URL = 'https://www.bertuzzipatrimonial.com.br';

function decodeEmail(emailB64: string): string | null {
  try {
    const email = Buffer.from(emailB64, 'base64url').toString('utf-8');
    return email.includes('@') && email.length <= 254 ? email : null;
  } catch {
    return null;
  }
}

// ─── GET /nl/o/:editionId/:emailB64 — pixel de abertura ─────────────────────

router.get('/o/:editionId/:emailB64', async (req: Request, res: Response) => {
  try {
    const { editionId, emailB64 } = req.params;
    const email = decodeEmail(emailB64);

    const edition = await prisma.newsletterEdition.findUnique({
      where: { id: editionId },
      select: { id: true },
    });

    if (edition) {
      await prisma.newsletterEvent.create({
        data: {
          editionId,
          type: 'OPEN',
          email,
          userAgent: (req.headers['user-agent'] || '').slice(0, 255) || null,
        },
      });
    }
  } catch (error) {
    console.error('[newsletter-tracking] Erro no open:', error);
  }

  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(TRANSPARENT_GIF);
});

// ─── GET /nl/c/:editionId/:slot/:emailB64 — clique por botão ─────────────────
// O destino NUNCA vem da URL (sem open redirect): é lido do mapa de links
// armazenado na edição, chaveado pelo slot.

router.get('/c/:editionId/:slot/:emailB64', async (req: Request, res: Response) => {
  try {
    const { editionId, slot, emailB64 } = req.params;
    const email = decodeEmail(emailB64);

    const edition = await prisma.newsletterEdition.findUnique({
      where: { id: editionId },
      select: { links: true },
    });

    if (!edition) {
      return res.redirect(302, FALLBACK_URL);
    }

    await prisma.newsletterEvent.create({
      data: {
        editionId,
        type: 'CLICK',
        slot: slot.slice(0, 60),
        email,
        userAgent: (req.headers['user-agent'] || '').slice(0, 255) || null,
      },
    });

    // Descadastrar: redireciona pra página de unsubscribe do CRM já
    // personalizada com o email do destinatário (infra existente do
    // email marketing — GET confirma, POST grava na UnsubscribeList).
    if (slot === 'footer-descadastrar' && email) {
      const base = process.env.API_URL || '/api';
      return res.redirect(302, `${base}/unsubscribe/email/${emailB64}`);
    }

    const links = (edition.links as unknown as NewsletterLinksMap | null) || {};
    const target = links[slot]?.url;
    return res.redirect(302, target || FALLBACK_URL);
  } catch (error) {
    console.error('[newsletter-tracking] Erro no click:', error);
    return res.redirect(302, FALLBACK_URL);
  }
});

export default router;
