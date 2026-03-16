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
        console.log('[calendly-webhook] No payload in body, ignoring');
        return res.status(200).json({ received: true });
      }

      console.log('[calendly-webhook] Received invitee.created payload:', JSON.stringify(payload, null, 2));

      const inviteeEmail = payload.email?.toLowerCase()?.trim() || '';
      const inviteeName = payload.name?.trim() || null;
      // payload.uri is the invitee URI; scheduled_event.uri is the event URI
      const scheduledEvent = payload.scheduled_event || {};
      const calendlyEventId = payload.uri || scheduledEvent.uri || '';
      const eventType = scheduledEvent.name || payload.event_type?.name || payload.event_type || 'Meeting';
      const startTime = scheduledEvent.start_time;
      const endTime = scheduledEvent.end_time;

      // Host info (the closer)
      const eventMemberships = scheduledEvent.event_memberships || [];
      const hostEmail = eventMemberships[0]?.user_email?.toLowerCase() || null;
      const hostName = eventMemberships[0]?.user_name || null;

      console.log(`[calendly-webhook] Parsed: email=${inviteeEmail}, name=${inviteeName}, eventId=${calendlyEventId}, type=${eventType}, start=${startTime}, host=${hostEmail}`);

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

      console.log(`[calendly-webhook] Saved CalendlyEvent: ${calendlyEvent.id}`);

      // 2. Find Contact by email (case-insensitive)
      let contact = inviteeEmail
        ? await prisma.contact.findFirst({
            where: {
              email: { equals: inviteeEmail, mode: 'insensitive' },
            },
          })
        : null;

      // Fallback: try matching by name if email didn't match
      if (!contact && inviteeName) {
        console.log(`[calendly-webhook] Email match failed, trying name match: "${inviteeName}"`);
        contact = await prisma.contact.findFirst({
          where: {
            name: { equals: inviteeName, mode: 'insensitive' },
          },
        });
        if (contact) {
          console.log(`[calendly-webhook] Found contact by name: ${contact.id} (${contact.name})`);
        }
      }

      if (contact) {
        console.log(`[calendly-webhook] Found contact: id=${contact.id}, name=${contact.name}, email=${contact.email}`);

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
          console.log(`[calendly-webhook] Found deal: id=${deal.id}, currentStage=${deal.stage?.name}, pipelineId=${deal.pipelineId}`);

          // 4. Find "Reunião Marcada" stage in the same pipeline
          // Log all stages for debugging
          const allStages = await prisma.pipelineStage.findMany({
            where: { pipelineId: deal.pipelineId },
            orderBy: { order: 'asc' },
          });
          console.log(`[calendly-webhook] Pipeline stages:`, allStages.map(s => `${s.name} (${s.id})`).join(', '));

          // Try exact match first, then case-insensitive contains
          let reuniaoStage = allStages.find(s => s.name === 'Reunião Marcada') || null;
          if (!reuniaoStage) {
            reuniaoStage = allStages.find(s => s.name.toLowerCase().includes('reuni')) || null;
          }

          const updateData: Record<string, unknown> = {};

          if (reuniaoStage) {
            updateData.stageId = reuniaoStage.id;
            console.log(`[calendly-webhook] Moving deal to stage: ${reuniaoStage.name} (${reuniaoStage.id})`);
          } else {
            console.warn(`[calendly-webhook] Stage "Reunião Marcada" not found in pipeline ${deal.pipelineId}`);
          }

          // 5. Map host email to CRM user (closer)
          if (hostEmail) {
            const closerUser = await prisma.user.findFirst({
              where: { email: { equals: hostEmail, mode: 'insensitive' }, isActive: true },
            });
            if (closerUser) {
              updateData.userId = closerUser.id;
              console.log(`[calendly-webhook] Assigning deal to closer: ${closerUser.name} (${closerUser.id})`);
            }
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.deal.update({
              where: { id: deal.id },
              data: updateData,
            });
            console.log(`[calendly-webhook] Deal updated with:`, updateData);
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
        console.log(`[calendly-webhook] No contact found for email="${inviteeEmail}" or name="${inviteeName}"`);
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
