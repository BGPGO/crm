import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { scheduleMeetingReminders, cancelMeetingReminders } from '../services/meetingReminderScheduler';

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

  // timingSafeEqual requires same-length buffers
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Extract phone number from Calendly questions_and_answers if available.
 */
function extractPhoneFromQA(questionsAndAnswers: Array<{ question: string; answer: string }> | undefined): string | null {
  if (!Array.isArray(questionsAndAnswers)) return null;
  const phoneQA = questionsAndAnswers.find(
    (qa) =>
      qa.question?.toLowerCase().includes('telefone') ||
      qa.question?.toLowerCase().includes('phone') ||
      qa.question?.toLowerCase().includes('whatsapp') ||
      qa.question?.toLowerCase().includes('celular')
  );
  return phoneQA?.answer?.trim() || null;
}

// POST /api/calendly/webhook — Receive Calendly webhook events (PUBLIC)
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const event = body?.event;

    // Load config to check secret
    const config = await prisma.calendlyConfig.findFirst();

    // If webhookSecret is configured, validate signature
    // NOTE: For proper signature verification, the raw body should be captured
    // via express.raw() middleware. Using JSON.stringify(body) as a fallback
    // may differ from the original payload. If signature issues occur,
    // configure a raw body capture middleware.
    if (config?.webhookSecret) {
      const signatureHeader = req.headers['calendly-webhook-signature'] as string | undefined;
      // Use raw body if available (set by middleware), else fall back to stringify
      const rawBody = (req as unknown as Record<string, string>).rawBody || JSON.stringify(body);
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
      const timezone = payload.timezone || null;
      const cancelUrl = payload.cancel_url || null;
      const rescheduleUrl = payload.reschedule_url || null;
      const questionsAndAnswers = payload.questions_and_answers;
      const inviteePhone = extractPhoneFromQA(questionsAndAnswers);

      // The invitee URI uniquely identifies this invitee record
      const inviteeUri = payload.uri || '';

      // scheduled_event contains the actual event details
      const scheduledEvent = payload.scheduled_event || {};
      const scheduledEventUri = scheduledEvent.uri || '';

      // Use invitee URI as the unique key (each invitee is unique per event)
      const calendlyEventId = inviteeUri || scheduledEventUri;

      // Event type name comes from scheduled_event.name (human-readable)
      // payload.event_type is a URL string, NOT an object — do not use .name on it
      const eventType = scheduledEvent.name || 'Meeting';
      const startTime = scheduledEvent.start_time;
      const endTime = scheduledEvent.end_time;

      // Host info (the closer) — from event_memberships
      const eventMemberships = scheduledEvent.event_memberships || [];
      const hostEmail = eventMemberships[0]?.user_email?.toLowerCase() || null;
      const hostName = eventMemberships[0]?.user_name || null;

      console.log(`[calendly-webhook] Parsed: email=${inviteeEmail}, name=${inviteeName}, phone=${inviteePhone}, eventId=${calendlyEventId}, type=${eventType}, start=${startTime}, host=${hostEmail}`);

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

      // Schedule event-driven meeting reminders
      scheduleMeetingReminders(calendlyEvent.id).catch(console.error);

      // 2. Find Contact — PRIORITY: email > phone > exact unique name
      // NEVER use fuzzy/partial name matching — leads with similar names get mixed up.
      // See: bug where two "Flávio" leads 15min apart had their deals swapped.
      let contact = null;
      let matchMethod = 'none';

      // 2a. Primary: match by email (case-insensitive) — most reliable
      if (inviteeEmail) {
        contact = await prisma.contact.findFirst({
          where: {
            email: { equals: inviteeEmail, mode: 'insensitive' },
          },
        });
        if (contact) {
          matchMethod = 'email';
          console.log(`[calendly-webhook] MATCH by email: contact=${contact.id} (${contact.name}), email=${contact.email}`);
        } else {
          console.log(`[calendly-webhook] No contact found with email="${inviteeEmail}"`);
        }
      }

      // 2b. Fallback: match by phone (last 9 digits) — only if email didn't match
      if (!contact && inviteePhone) {
        const phoneSuffix = inviteePhone.replace(/\D/g, '').slice(-9);
        console.log(`[calendly-webhook] Trying phone match: raw="${inviteePhone}", suffix="${phoneSuffix}"`);
        contact = await prisma.contact.findFirst({
          where: {
            phone: { contains: phoneSuffix },
          },
        });
        if (contact) {
          matchMethod = 'phone';
          console.log(`[calendly-webhook] MATCH by phone: contact=${contact.id} (${contact.name}), phone=${contact.phone}`);
        } else {
          console.log(`[calendly-webhook] No contact found with phone containing "${phoneSuffix}"`);
        }
      }

      // 2c. Fallback: match by EXACT full name — only if result is unique (1 match)
      // If multiple contacts share the same name, skip to avoid mixing them up.
      if (!contact && inviteeName) {
        console.log(`[calendly-webhook] Trying exact unique name match: "${inviteeName}"`);
        const nameMatches = await prisma.contact.findMany({
          where: {
            name: { equals: inviteeName, mode: 'insensitive' },
          },
          take: 2, // only need to know if there's more than 1
        });
        if (nameMatches.length === 1) {
          contact = nameMatches[0];
          matchMethod = 'exact_unique_name';
          console.log(`[calendly-webhook] MATCH by exact unique name: contact=${contact.id} (${contact.name}), email=${contact.email}`);
        } else if (nameMatches.length > 1) {
          console.warn(`[calendly-webhook] SKIPPED name match: ${nameMatches.length} contacts named "${inviteeName}" — ambiguous, refusing to guess. IDs: ${nameMatches.map(c => c.id).join(', ')}`);
        } else {
          console.log(`[calendly-webhook] No contact found with exact name="${inviteeName}"`);
        }
      }

      // Log final matching result for debugging
      if (!contact) {
        console.log(`[calendly-webhook] NO MATCH found. Input: email="${inviteeEmail}", phone="${inviteePhone}", name="${inviteeName}". Will auto-create if email is available.`);
      } else {
        console.log(`[calendly-webhook] FINAL MATCH: method=${matchMethod}, contact=${contact.id}, name="${contact.name}", email="${contact.email}", phone="${contact.phone}"`);
      }

      // 2b. Auto-create Contact if none found and we have an email
      if (!contact && inviteeEmail) {
        console.log(`[calendly-webhook] No contact found after all attempts, auto-creating for email=${inviteeEmail}`);
        contact = await prisma.contact.create({
          data: {
            name: inviteeName || inviteeEmail.split('@')[0],
            email: inviteeEmail,
            phone: inviteePhone,
          },
        });
        console.log(`[calendly-webhook] Auto-created contact: ${contact.id}`);
      }

      if (contact) {
        console.log(`[calendly-webhook] Using contact: id=${contact.id}, name=${contact.name}, email=${contact.email}`);

        // Update contact phone if we got one from Calendly and contact doesn't have one
        if (inviteePhone && !contact.phone) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { phone: inviteePhone },
          });
        }

        // Link event to contact
        await prisma.calendlyEvent.update({
          where: { id: calendlyEvent.id },
          data: { contactId: contact.id },
        });

        // 3. Find OPEN deal associated to this contact
        let deal = await prisma.deal.findFirst({
          where: {
            contactId: contact.id,
            status: 'OPEN',
          },
          include: { stage: true },
          orderBy: { createdAt: 'desc' },
        });

        // 3b. Auto-create deal if none exists
        if (!deal) {
          console.log(`[calendly-webhook] No OPEN deal found, auto-creating for contact=${contact.id}`);

          // Find default pipeline
          const defaultPipeline = await prisma.pipeline.findFirst({
            where: { isDefault: true },
            include: { stages: { orderBy: { order: 'asc' } } },
          });

          if (defaultPipeline && defaultPipeline.stages.length > 0) {
            // Find "Reunião agendada" stage — prefer exact match, then "agendada", then highest-order "reuni" stage
            const reuniaoStageForNew = defaultPipeline.stages.find(
              (s) => s.name.toLowerCase() === 'reunião agendada'
            ) || defaultPipeline.stages.find(
              (s) => s.name.toLowerCase().includes('agendada')
            ) || [...defaultPipeline.stages]
              .filter((s) => s.name.toLowerCase().includes('reuni'))
              .sort((a, b) => b.order - a.order)[0]
            || defaultPipeline.stages[0];

            // Find closer user or use first active user
            let dealUserId: string | null = null;
            if (hostEmail) {
              const closerUser = await prisma.user.findFirst({
                where: { email: { equals: hostEmail, mode: 'insensitive' }, isActive: true },
              });
              if (closerUser) dealUserId = closerUser.id;
            }
            if (!dealUserId) {
              const fallbackUser = await prisma.user.findFirst({
                where: { isActive: true },
                orderBy: { createdAt: 'asc' },
              });
              dealUserId = fallbackUser?.id || '';
            }

            if (dealUserId) {
              // Find Calendly source or create one
              let source = await prisma.source.findFirst({
                where: { name: 'Calendly' },
              });
              if (!source) {
                source = await prisma.source.create({
                  data: { name: 'Calendly' },
                });
              }

              deal = await prisma.deal.create({
                data: {
                  title: `${inviteeName || inviteeEmail} - ${eventType}`,
                  pipelineId: defaultPipeline.id,
                  stageId: reuniaoStageForNew.id,
                  contactId: contact.id,
                  userId: dealUserId,
                  sourceId: source.id,
                  status: 'OPEN',
                },
                include: { stage: true },
              });
              console.log(`[calendly-webhook] Auto-created deal: ${deal.id} in stage ${reuniaoStageForNew.name}`);
            }
          } else {
            console.warn(`[calendly-webhook] Cannot auto-create deal: no default pipeline found`);
          }
        }

        if (deal) {
          console.log(`[calendly-webhook] Found deal: id=${deal.id}, currentStage=${deal.stage?.name}, pipelineId=${deal.pipelineId}`);

          // 4. Find "Reunião Marcada" stage in the same pipeline
          const allStages = await prisma.pipelineStage.findMany({
            where: { pipelineId: deal.pipelineId },
            orderBy: { order: 'asc' },
          });
          console.log(`[calendly-webhook] Pipeline stages:`, allStages.map(s => `${s.name} (${s.id})`).join(', '));

          // Try exact "Reunião agendada" first, then "agendada", then highest-order "reuni" stage
          let reuniaoStage = allStages.find(s => s.name.toLowerCase() === 'reunião agendada') || null;
          if (!reuniaoStage) {
            reuniaoStage = allStages.find(s => s.name.toLowerCase().includes('agendada')) || null;
          }
          if (!reuniaoStage) {
            reuniaoStage = [...allStages]
              .filter(s => s.name.toLowerCase().includes('reuni'))
              .sort((a, b) => b.order - a.order)[0] || null;
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
          const activityUserId = (updateData.userId as string) || deal.userId;

          await prisma.activity.create({
            data: {
              type: 'MEETING',
              content: `Reunião agendada via Calendly: ${eventType}. Invitado: ${inviteeName || inviteeEmail}. Host: ${hostName || hostEmail || 'N/A'}. Data: ${startTime || 'N/A'}`,
              metadata: {
                source: 'calendly',
                calendlyEventId,
                scheduledEventUri,
                inviteeEmail,
                inviteePhone,
                hostEmail,
                startTime,
                endTime,
                timezone,
                cancelUrl,
                rescheduleUrl,
                questionsAndAnswers,
              },
              userId: activityUserId,
              dealId: deal.id,
              contactId: contact.id,
            },
          });

          // 7. Create Task with meeting date/time
          if (startTime) {
            await prisma.task.create({
              data: {
                title: `Reunião: ${eventType || 'Diagnóstico Financeiro'}`,
                description: `Agendado via Calendly. Participante: ${inviteeName || inviteeEmail}. Host: ${hostName || hostEmail || 'N/A'}`,
                type: 'MEETING',
                dueDate: new Date(startTime),
                status: 'PENDING',
                userId: activityUserId,
                dealId: deal.id,
                contactId: contact.id,
              },
            });
            console.log(`[calendly-webhook] Task created for meeting at ${startTime}`);
          }

          console.log(`[calendly-webhook] Processed invitee.created: contact=${contact.id}, deal=${deal.id}, stage=${reuniaoStage?.name || 'unchanged'}`);
        } else {
          console.log(`[calendly-webhook] Contact found/created (${contact.id}) but could not find or create deal`);
        }

        // Auto-tag based on journey
        const calDiretoTag = await prisma.tag.findUnique({ where: { name: 'Calendly Direto' } });
        const iaCalendlyTag = await prisma.tag.findUnique({ where: { name: 'IA → Calendly' } });

        // Check if the contact has a WhatsAppConversation with bot messages
        const hasConversation = await prisma.whatsAppConversation.findFirst({
          where: { contactId: contact.id },
          include: { messages: { where: { sender: 'BOT' }, take: 1 } },
        });

        const hasBotMessages = hasConversation && hasConversation.messages.length > 0;
        const tagToApply = hasBotMessages ? iaCalendlyTag : calDiretoTag;

        if (tagToApply) {
          await prisma.contactTag.upsert({
            where: { contactId_tagId: { contactId: contact.id, tagId: tagToApply.id } },
            create: { contactId: contact.id, tagId: tagToApply.id },
            update: {},
          });
          console.log(`[calendly-webhook] Auto-tagged contact ${contact.id} with "${tagToApply.name}"`);
        }
      } else {
        console.log(`[calendly-webhook] No contact found and no email to auto-create`);
      }
    } else if (event === 'invitee.canceled') {
      const payload = body.payload;
      if (!payload) {
        return res.status(200).json({ received: true });
      }

      // payload.uri is the invitee URI — same key we stored as calendlyEventId on creation
      const calendlyEventId = payload.uri || '';

      if (calendlyEventId) {
        const updated = await prisma.calendlyEvent.updateMany({
          where: { calendlyEventId },
          data: { status: 'canceled' },
        });
        console.log(`[calendly-webhook] Canceled event: ${calendlyEventId} (${updated.count} records updated)`);

        // Cancel any scheduled reminders for this event
        const canceledEvents = await prisma.calendlyEvent.findMany({ where: { calendlyEventId }, select: { id: true } });
        for (const ev of canceledEvents) {
          cancelMeetingReminders(ev.id);
        }

        // Cancel the associated task
        if (updated.count > 0) {
          const canceledEvt = await prisma.calendlyEvent.findFirst({ where: { calendlyEventId } });
          if (canceledEvt?.dealId && canceledEvt.startTime) {
            await prisma.task.updateMany({
              where: {
                dealId: canceledEvt.dealId,
                type: 'MEETING',
                dueDate: canceledEvt.startTime,
                status: 'PENDING',
              },
              data: { status: 'COMPLETED' },
            });
            console.log(`[calendly-webhook] Task marked COMPLETED (canceled meeting) for deal ${canceledEvt.dealId}`);
          }
        }

        // If we have a linked deal, create an activity noting the cancellation
        if (updated.count > 0) {
          const canceledEvent = await prisma.calendlyEvent.findFirst({
            where: { calendlyEventId },
          });
          if (canceledEvent?.dealId && canceledEvent?.contactId) {
            // Find a user for the activity
            const deal = await prisma.deal.findFirst({
              where: { id: canceledEvent.dealId },
            });
            if (deal) {
              await prisma.activity.create({
                data: {
                  type: 'MEETING',
                  content: `Reunião Calendly cancelada: ${canceledEvent.eventType}. Invitado: ${canceledEvent.inviteeName || canceledEvent.inviteeEmail}.`,
                  metadata: {
                    source: 'calendly',
                    action: 'canceled',
                    calendlyEventId,
                    cancelerName: payload.canceler_name || null,
                    cancelReason: payload.cancel_reason || null,
                  },
                  userId: deal.userId,
                  dealId: canceledEvent.dealId,
                  contactId: canceledEvent.contactId,
                },
              });
              console.log(`[calendly-webhook] Created cancellation activity for deal ${canceledEvent.dealId}`);
            }
          }
        }
      } else {
        console.warn(`[calendly-webhook] invitee.canceled but no URI in payload`);
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
