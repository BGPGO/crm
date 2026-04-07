import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { checkAndCancelWaitForResponse } from '../services/waitForResponseService';

const router = Router();

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

// HMAC-based unsubscribe tokens (replaces trivial base64)
const UNSUB_SECRET = process.env.AUTENTIQUE_WEBHOOK_SECRET || 'unsub-fallback-secret-change-me';

export function createUnsubToken(sendId: string): string {
  const payload = Buffer.from(sendId, 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', UNSUB_SECRET).update(payload).digest('base64url').slice(0, 16);
  return `${payload}.${sig}`;
}

function verifyUnsubToken(token: string): string | null {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) {
    // Legacy: try plain base64 for old links still in inboxes
    try { return Buffer.from(token, 'base64').toString('utf-8'); } catch { return null; }
  }
  const payload = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  const expected = crypto.createHmac('sha256', UNSUB_SECRET).update(payload).digest('base64url').slice(0, 16);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { return Buffer.from(payload, 'base64url').toString('utf-8'); } catch { return null; }
}

// 1x1 transparent GIF pixel
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const FALLBACK_URL = 'https://crm.bertuzzipatrimonial.com.br';

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

      // Check if contact has automations waiting for response (fire-and-forget)
      checkAndCancelWaitForResponse(send.contactId).catch((err) => {
        console.error('[email-tracking] Erro ao checar WAIT_FOR_RESPONSE no open:', err);
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
  // Verify Resend webhook signature (if secret is configured)
  if (RESEND_WEBHOOK_SECRET) {
    const signature = req.headers['resend-signature'] as string;
    if (!signature) {
      console.warn('[email-tracking] Webhook rejected: missing Resend-Signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }
    // Resend uses svix for webhooks — verify timestamp + signature
    // For simplicity, just check the signature exists. Full svix validation
    // can be added later with the svix package.
  }

  // Basic payload validation
  if (!req.body.type || typeof req.body.type !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "type" field' });
  }
  if (!req.body.data || typeof req.body.data !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid "data" field' });
  }

  try {
    const { type, data } = req.body as { type: string; data: { email_id: string } };

    // Map Resend event types to our status + timestamp field
    const eventHandlers: Record<string, { status?: string; timestampField?: string; suppress?: boolean }> = {
      'email.sent':              { status: 'SENT' },
      'email.delivered':         { status: 'DELIVERED' },
      'email.opened':            { status: 'OPENED', timestampField: 'openedAt' },
      'email.clicked':           { status: 'CLICKED', timestampField: 'clickedAt' },
      'email.bounced':           { status: 'BOUNCED', timestampField: 'bouncedAt', suppress: true },
      'email.complained':        { status: 'SPAM', suppress: true },
      'email.failed':            { status: 'BOUNCED', timestampField: 'bouncedAt', suppress: true },
      'email.suppressed':        { status: 'UNSUBSCRIBED', suppress: true },
      'email.delivery_delayed':  {}, // Log event only, don't change status
      'email.scheduled':         {}, // Log event only
      'email.received':          {}, // Log event only
    };

    const handler = eventHandlers[type];
    if (!handler) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const send = await prisma.emailSend.findFirst({
      where: { messageId: data.email_id },
    });

    if (!send) {
      return res.status(200).json({ received: true });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (handler.status) {
      // Only update status if it's a "progression" (don't downgrade OPENED to DELIVERED)
      const statusPriority: Record<string, number> = {
        'QUEUED': 0, 'SENT': 1, 'DELIVERED': 2, 'OPENED': 3, 'CLICKED': 4,
        'BOUNCED': 10, 'SPAM': 10, 'UNSUBSCRIBED': 10,
      };
      const currentPriority = statusPriority[send.status] ?? 0;
      const newPriority = statusPriority[handler.status] ?? 0;
      if (newPriority > currentPriority) {
        updateData.status = handler.status;
      }
    }
    if (handler.timestampField) {
      updateData[handler.timestampField] = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.emailSend.update({
        where: { id: send.id },
        data: updateData,
      });
    }

    // Auto-suppress: add to UnsubscribeList on bounce or spam complaint
    if (handler.suppress) {
      const contact = await prisma.contact.findFirst({
        where: { id: send.contactId },
        select: { email: true },
      });
      if (contact?.email) {
        await prisma.unsubscribeList.upsert({
          where: { email: contact.email },
          update: {},
          create: {
            email: contact.email,
            contactId: send.contactId,
            reason: handler.status === 'SPAM'
              ? 'Auto-suppressed: spam complaint via Resend'
              : 'Auto-suppressed: hard bounce via Resend',
          },
        }).catch(() => {}); // Non-critical
        console.log(`[email-tracking] Auto-suppressed ${contact.email} (${handler.status})`);
      }
    }

    // Update LeadScore on open/click (same as tracking pixel logic)
    if (type === 'email.opened' || type === 'email.clicked') {
      const scoreData: Record<string, unknown> = {};
      if (type === 'email.opened') scoreData.lastEmailOpenedAt = new Date();
      if (type === 'email.clicked') scoreData.lastEmailClickedAt = new Date();
      await prisma.leadScore.upsert({
        where: { contactId: send.contactId },
        update: scoreData,
        create: { contactId: send.contactId, ...scoreData },
      }).catch(() => {});
    }

    // Create email event
    await prisma.emailEvent.create({
      data: {
        type,
        emailSendId: send.id,
        metadata: data as any,
      },
    });

    console.log(`[email-tracking] Webhook ${type} for send ${send.id}`);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    return res.status(200).json({ received: true });
  }
});

// ─── GET /unsubscribe/email/:emailB64 — Email-based unsubscribe (automations) ─
// IMPORTANT: must be registered BEFORE /unsubscribe/:token to avoid Express matching "email" as :token

router.get('/unsubscribe/email/:emailB64', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const email = Buffer.from(req.params.emailB64, 'base64url').toString('utf-8');
    if (!email || !email.includes('@')) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido.'));
    }
    return res.status(200).send(buildUnsubscribeConfirmEmailHtml(req.params.emailB64));
  } catch (error) {
    console.error('Error loading email unsubscribe page:', error);
    return res.status(500).send(buildUnsubscribeHtml(false, 'Erro interno. Tente novamente.'));
  }
});

router.post('/unsubscribe/email/:emailB64', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const email = Buffer.from(req.params.emailB64, 'base64url').toString('utf-8');
    if (!email || !email.includes('@')) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido.'));
    }

    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    await prisma.unsubscribeList.upsert({
      where: { email },
      update: {},
      create: {
        email,
        contactId: contact?.id ?? undefined,
        reason: 'Unsubscribed via automation email link',
      },
    });

    return res.status(200).send(buildUnsubscribeHtml(true));
  } catch (error) {
    console.error('Error processing email unsubscribe:', error);
    return res.status(500).send(buildUnsubscribeHtml(false, 'Erro interno. Tente novamente.'));
  }
});

// ─── GET /unsubscribe/:token — Show confirmation page ───────────────────────

router.get('/unsubscribe/:token', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { token } = req.params;

    const sendId = verifyUnsubToken(token);
    if (!sendId) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido ou expirado.'));
    }

    const send = await prisma.emailSend.findUnique({
      where: { id: sendId },
      include: { contact: true },
    });

    if (!send) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido ou expirado.'));
    }

    // Show confirmation page — do NOT unsubscribe on GET (bots/link previewers would trigger it)
    return res.status(200).send(buildUnsubscribeConfirmHtml(token));
  } catch (error) {
    console.error('Error loading unsubscribe page:', error);
    return res.status(500).send(buildUnsubscribeHtml(false, 'Erro interno. Tente novamente.'));
  }
});

// ─── POST /unsubscribe/:token — Actually perform the unsubscribe ────────────

router.post('/unsubscribe/:token', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const { token } = req.params;

    const sendId = verifyUnsubToken(token);
    if (!sendId) {
      return res.status(404).send(buildUnsubscribeHtml(false, 'Link inválido ou expirado.'));
    }

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildUnsubscribeConfirmHtml(token: string): string {
  const safeToken = escapeHtml(token);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmar descadastro</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.5; }
    button { margin-top: 1rem; padding: 0.75rem 1.5rem; background: #e53e3e; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #c53030; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Deseja se descadastrar?</h1>
    <p>Ao confirmar, você não receberá mais nossos emails.</p>
    <form method="POST" action="/api/unsubscribe/${safeToken}">
      <button type="submit">Confirmar descadastro</button>
    </form>
  </div>
</body>
</html>`;
}

function buildUnsubscribeConfirmEmailHtml(emailB64: string): string {
  const safeEmailB64 = escapeHtml(emailB64);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmar descadastro</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; color: #333; }
    .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; line-height: 1.5; }
    button { margin-top: 1rem; padding: 0.75rem 1.5rem; background: #e53e3e; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
    button:hover { background: #c53030; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Deseja se descadastrar?</h1>
    <p>Ao confirmar, você não receberá mais nossos emails.</p>
    <form method="POST" action="/api/unsubscribe/email/${safeEmailB64}">
      <button type="submit">Confirmar descadastro</button>
    </form>
  </div>
</body>
</html>`;
}

function buildUnsubscribeHtml(success: boolean, errorMessage?: string): string {
  const title = success ? 'Descadastrado com sucesso' : 'Erro';
  const safeError = escapeHtml(errorMessage || 'Ocorreu um erro.');
  const body = success
    ? '<h1>Descadastrado com sucesso</h1><p>Você não receberá mais nossos emails. Se isso foi um engano, entre em contato conosco.</p>'
    : `<h1>Ops!</h1><p>${safeError}</p>`;

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

// ─── Email validation ─────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

export default router;
