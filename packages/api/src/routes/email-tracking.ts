import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// 1x1 transparent GIF pixel
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const FALLBACK_URL = 'https://bertuzzipatrimonial.app.br';

// ─── GET /t/open/:sendId — Track email open ────────────────────────────────

router.get('/t/open/:sendId', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { sendId } = req.params;

    const send = await prisma.emailSend.findUnique({
      where: { id: sendId },
      include: { contact: true },
    });

    if (send) {
      // Update open timestamp (only if not already opened)
      const updateData: Record<string, unknown> = {};
      if (!send.openedAt) {
        updateData.openedAt = new Date();
      }
      if (send.status === 'SENT' || send.status === 'DELIVERED') {
        updateData.status = 'OPENED';
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.emailSend.update({
          where: { id: sendId },
          data: updateData,
        });
      }

      // Create email event
      await prisma.emailEvent.create({
        data: {
          type: 'opened',
          emailSendId: sendId,
        },
      });

      // Update LeadScore lastEmailOpenedAt
      await prisma.leadScore.upsert({
        where: { contactId: send.contactId },
        update: { lastEmailOpenedAt: new Date() },
        create: {
          contactId: send.contactId,
          lastEmailOpenedAt: new Date(),
        },
      });
    }
  } catch (error) {
    console.error('Error tracking email open:', error);
  }

  // Always return the tracking pixel, even on error
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(TRANSPARENT_GIF);
});

// ─── GET /t/click/:trackingId — Track link click ───────────────────────────

router.get('/t/click/:trackingId', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { trackingId } = req.params;

    const link = await prisma.emailLink.findUnique({
      where: { trackingId },
    });

    if (!link) {
      return res.redirect(302, FALLBACK_URL);
    }

    // Increment click count on the link itself.
    // Note: we cannot attribute the click to a specific EmailSend because
    // the tracking URL only contains the link trackingId, not the sendId.
    // Per-send click attribution would require embedding sendId in the URL.
    await prisma.emailLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 } },
    });

    return res.redirect(302, link.originalUrl);
  } catch (error) {
    console.error('Error tracking link click:', error);
    return res.redirect(302, FALLBACK_URL);
  }
});

// ─── POST /t/webhook — Resend webhook handler ──────────────────────────────

router.post('/t/webhook', async (req: Request, res: Response, _next: NextFunction) => {
  // Basic payload validation
  if (!req.body.type || typeof req.body.type !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "type" field' });
  }
  if (!req.body.data || typeof req.body.data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid "data" field' });
  }

  try {
    const { type, data } = req.body as { type: string; data: { email_id: string } };

    // Map Resend event types to our status
    const statusMap: Record<string, string> = {
      'email.delivered': 'DELIVERED',
      'email.bounced': 'BOUNCED',
      'email.complained': 'SPAM',
    };

    const newStatus = statusMap[type];
    if (!newStatus) {
      // Unknown event type — acknowledge but ignore
      return res.status(200).json({ received: true });
    }

    const send = await prisma.emailSend.findFirst({
      where: { messageId: data.email_id },
    });

    if (!send) {
      return res.status(200).json({ received: true });
    }

    // Build update data with relevant timestamp
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'BOUNCED') {
      updateData.bouncedAt = new Date();
    }

    await prisma.emailSend.update({
      where: { id: send.id },
      data: updateData,
    });

    // Create email event
    await prisma.emailEvent.create({
      data: {
        type,
        emailSendId: send.id,
        metadata: data as any,
      },
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    return res.status(200).json({ received: true });
  }
});

// ─── GET /unsubscribe/:token — Unsubscribe page ────────────────────────────

router.get('/unsubscribe/:token', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { token } = req.params;

    // Decode token (base64-encoded EmailSend ID)
    const sendId = Buffer.from(token, 'base64').toString('utf-8');

    const send = await prisma.emailSend.findUnique({
      where: { id: sendId },
      include: { contact: true },
    });

    if (!send) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido ou expirado.'));
    }

    // Add to unsubscribe list
    await prisma.unsubscribeList.upsert({
      where: { email: send.contact.email || '' },
      update: {},
      create: {
        email: send.contact.email || '',
        contactId: send.contactId ?? undefined,
        reason: 'Unsubscribed via email link',
      },
    });

    // Update the EmailSend record
    await prisma.emailSend.update({
      where: { id: send.id },
      data: {
        unsubscribedAt: new Date(),
        status: 'UNSUBSCRIBED',
      },
    });

    return res.status(200).send(buildUnsubscribeHtml(true));
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    return res.status(500).send(buildUnsubscribeHtml(false, 'Erro interno. Tente novamente.'));
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildUnsubscribeHtml(success: boolean, errorMessage?: string): string {
  const title = success ? 'Descadastrado com sucesso' : 'Erro';
  const body = success
    ? '<h1>Descadastrado com sucesso</h1><p>Você não receberá mais nossos emails. Se isso foi um engano, entre em contato conosco.</p>'
    : `<h1>Ops!</h1><p>${errorMessage || 'Ocorreu um erro.'}</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

export default router;
