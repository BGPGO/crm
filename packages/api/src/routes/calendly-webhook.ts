import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';

const router = Router();

/**
 * Verify Calendly webhook signature (if webhookSecret is configured).
 * Calendly signs payloads with HMAC-SHA256 in the header
 * "Calendly-Webhook-Signature".
 * Format: "t=<timestamp>,v1=<signature>"
 */
function verifySignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  }

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const data = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// POST /api/calendly/webhook — Receive Calendly webhook events (PUBLIC)
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const event = body?.event;

    // Load config to check secret
    const config = await prisma.calendlyConfig.findFirst();

    // If webhookSecret is configured, validate signature
    if (config?.webhookSecret) {
      const signatureHeader = req.headers['calendly-webhook-signature'] as string | undefined;
      const rawBody = JSON.stringify(body);
      if (!verifySignature(rawBody, signatureHeader, config.webhookSecret)) {
        console.warn('[calendly-webhook] Invalid signature — ignoring');
        return res.status(200).json({ received: true, error: 'invalid_signature' });
      }
    }

    if (event === 'invitee.created') {
      const payload = body.payload;
      if (!payload) {
        return res.status(200).json({ received: true });
      }

      const inviteeEmail = payload.email?.toLowerCase() || '';
      const inviteeName = payload.name || null;
      const calendlyEventId = payload.uri || payload.event || '';
      const eventType = payload.event_type?.name || payload.event_type || 'Meeting';
      const startTime = payload.scheduled_event?.start_time || payload.event?.start_time;
      const endTime = payload.scheduled_event?.end_time || payload.event?.end_time;

      // Host info (the closer)
      const eventMemberships = payload.scheduled_event?.event_memberships || [];
      const hostEmail = eventMemberships[0]?.user_email?.toLowerCase() || null;
      const hostName = eventMemberships[0]?.user_name || null;

      // 1. Save CalendlyEvent
      const calendlyEvent = await prisma.calendlyEvent.upsert({
        where: { calendlyEventId },
        update: {
          status: 'active',
          inviteeEmail,
          inviteeName,
          hostEmail,
          hostName,
          eventType: String(eventType),
          startTime: startTime ? new Date(startTime) : new Date(),
          endTime: endTime ? new Date(endTime) : new Date(),
        },
        create: {
          calendlyEventId,
          eventType: String(eventType),
          inviteeEmail,
          inviteeName,
          hostEmail,
          hostName,
          startTime: startTime ? new Date(startTime) : new Date(),
          endTime: endTime ? new Date(endTime) : new Date(),
          status: 'active',
        },
      });

      // 2. Find Contact by email
      let contact = inviteeEmail
        ? await prisma.contact.findFirst({ where: { email: inviteeEmail } })
        : null;

      if (contact) {
        // Link event to contact
        await prisma.calendlyEvent.update({
          where: { id: calendlyEvent.id },
          data: { contactId: contact.id },
        });

        // 3. Find OPEN deal associated to this contact
        const deal = await prisma.deal.findFirst({
          where: {
            contactId: contact.id,
            status: 'OPEN',
          },
          include: { stage: true },
          orderBy: { createdAt: 'desc' },
        });

        if (deal) {
          // 4. Find "Reunião Marcada" stage in the same pipeline
          const reuniaoStage = await prisma.pipelineStage.findFirst({
            where: {
              pipelineId: deal.pipelineId,
              name: 'Reunião Marcada',
            },
          });

          const updateData: Record<string, unknown> = {};

          if (reuniaoStage) {
            updateData.stageId = reuniaoStage.id;
          }

          // 5. Map host email to CRM user (closer)
          if (hostEmail) {
            const closerUser = await prisma.user.findFirst({
              where: { email: hostEmail, isActive: true },
            });
            if (closerUser) {
              updateData.userId = closerUser.id;
            }
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.deal.update({
              where: { id: deal.id },
              data: updateData,
            });
          }

          // Link event to deal
          await prisma.calendlyEvent.update({
            where: { id: calendlyEvent.id },
            data: { dealId: deal.id },
          });

          // 6. Create Activity on deal
          // Find a system user for the activity (prefer closer, fallback to deal owner)
          const activityUserId = (updateData.userId as string) || deal.userId;

          await prisma.activity.create({
            data: {
              type: 'MEETING',
              content: `Reunião agendada via Calendly: ${eventType}. Invitado: ${inviteeName || inviteeEmail}. Host: ${hostName || hostEmail || 'N/A'}. Data: ${startTime || 'N/A'}`,
              metadata: {
                source: 'calendly',
                calendlyEventId,
                inviteeEmail,
                hostEmail,
                startTime,
                endTime,
              },
              userId: activityUserId,
              dealId: deal.id,
              contactId: contact.id,
            },
          });

          console.log(`[calendly-webhook] Processed invitee.created: contact=${contact.id}, deal=${deal.id}, stage=${reuniaoStage?.name || 'unchanged'}`);
        } else {
          console.log(`[calendly-webhook] Contact found (${contact.id}) but no OPEN deal`);
        }
      } else {
        console.log(`[calendly-webhook] No contact found for email: ${inviteeEmail}`);
      }
    } else if (event === 'invitee.canceled') {
      const payload = body.payload;
      const calendlyEventId = payload?.uri || payload?.event || '';

      if (calendlyEventId) {
        await prisma.calendlyEvent.updateMany({
          where: { calendlyEventId },
          data: { status: 'canceled' },
        });
        console.log(`[calendly-webhook] Canceled event: ${calendlyEventId}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[calendly-webhook] Unexpected error:', err);
    // Always return 200 so Calendly doesn't retry
    res.status(200).json({ received: true, error: 'internal' });
  }
});

export default router;
