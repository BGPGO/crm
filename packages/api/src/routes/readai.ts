import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * POST /api/readai/webhook — Receives data from Read.ai when meeting ends
 * Read.ai sends the full meeting payload directly in the webhook body.
 * No API key needed — all data comes in the POST payload.
 */
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;

    console.log(`[Read.ai] Webhook received:`, JSON.stringify(body).slice(0, 500));

    // Read.ai can send data in various formats — extract flexibly
    const sessionId = body.session_id || body.id || body.meeting_id || `readai_${Date.now()}`;
    const title = body.title || body.meeting_title || body.name || body.subject || null;
    const summary = body.summary || body.meeting_summary || body.report?.summary || null;
    const transcript = body.transcript
      ? (typeof body.transcript === 'string' ? body.transcript : JSON.stringify(body.transcript))
      : body.report?.transcript
        ? (typeof body.report.transcript === 'string' ? body.report.transcript : JSON.stringify(body.report.transcript))
        : null;
    const actionItems = body.action_items || body.actionItems || body.report?.action_items || null;
    const topics = body.topics || body.key_topics || body.report?.topics || null;
    const duration = body.duration_minutes || body.duration || body.report?.duration || null;
    const meetingDate = body.start_time || body.meeting_date || body.created_at || body.date || null;
    const participants = body.participants || body.attendees || body.report?.participants || [];

    // Extract participant emails for matching
    const participantEmails = (Array.isArray(participants) ? participants : [])
      .map((p: any) => typeof p === 'string' ? p : (p.email || p.participant_email))
      .filter(Boolean)
      .map((e: string) => e.toLowerCase());

    // Try to match to a deal via participant emails
    let dealId: string | null = null;
    let contactId: string | null = null;

    if (participantEmails.length > 0) {
      const contacts = await prisma.contact.findMany({
        where: { email: { in: participantEmails, mode: 'insensitive' } },
        select: { id: true, deals: { where: { status: 'OPEN' }, select: { id: true, userId: true }, take: 1 } },
      });

      if (contacts.length > 0) {
        contactId = contacts[0].id;
        dealId = contacts[0].deals?.[0]?.id || null;
      }
    }

    // Store the meeting data
    await prisma.readAiMeeting.upsert({
      where: { sessionId: String(sessionId) },
      create: {
        sessionId: String(sessionId),
        title,
        summary,
        transcript,
        actionItems,
        topics,
        duration: duration ? parseInt(String(duration)) : null,
        meetingDate: meetingDate ? new Date(meetingDate) : new Date(),
        participants: participantEmails.length > 0 ? participantEmails : (participants.length > 0 ? participants : null),
        dealId,
        contactId,
        rawData: body,
      },
      update: {
        title,
        summary,
        transcript,
        actionItems,
        topics,
        duration: duration ? parseInt(String(duration)) : null,
        meetingDate: meetingDate ? new Date(meetingDate) : undefined,
        participants: participantEmails.length > 0 ? participantEmails : (participants.length > 0 ? participants : null),
        dealId: dealId || undefined,
        contactId: contactId || undefined,
        rawData: body,
      },
    });

    console.log(`[Read.ai] Meeting ${sessionId} stored (deal: ${dealId || 'none'}, contact: ${contactId || 'none'})`);

    // If we found a deal, log an activity
    if (dealId) {
      try {
        const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { userId: true } });
        if (deal) {
          await prisma.activity.create({
            data: {
              type: 'MEETING' as any,
              content: `Reunião Read.ai: ${title || 'Sem título'} — ${summary?.slice(0, 200) || 'Resumo pendente'}`,
              dealId,
              contactId,
              userId: deal.userId,
            },
          });
        }
      } catch { /* silent */ }
    }

    res.json({ ok: true, dealId, contactId });
  } catch (err) {
    console.error('[Read.ai] Webhook error:', err);
    next(err);
  }
});

/**
 * GET /api/readai/meetings — List all Read.ai meetings (optionally filter by dealId)
 */
router.get('/meetings', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId, contactId } = req.query;
    const where: Record<string, unknown> = {};
    if (dealId) where.dealId = dealId as string;
    if (contactId) where.contactId = contactId as string;

    const meetings = await prisma.readAiMeeting.findMany({
      where,
      orderBy: { meetingDate: 'desc' },
      select: {
        id: true,
        sessionId: true,
        title: true,
        summary: true,
        transcript: true,
        actionItems: true,
        topics: true,
        duration: true,
        meetingDate: true,
        participants: true,
        dealId: true,
        contactId: true,
        createdAt: true,
      },
    });

    res.json({ data: meetings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/readai/meetings/:id — Get a single Read.ai meeting
 */
router.get('/meetings/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.readAiMeeting.findUnique({
      where: { id: req.params.id },
    });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ data: meeting });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/readai/meetings/:id/link — Manually link a Read.ai meeting to a deal
 */
router.put('/meetings/:id/link', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dealId } = req.body;
    const meeting = await prisma.readAiMeeting.update({
      where: { id: req.params.id },
      data: { dealId },
    });
    res.json({ data: meeting });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/readai/config — Get Read.ai configuration
 */
router.get('/config', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    const apiKey = (config as any)?.readAiApiKey || '';
    res.json({ data: { apiKey: apiKey ? '****' + apiKey.slice(-4) : '', hasKey: !!apiKey } });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/readai/config — Update Read.ai API key
 */
router.put('/config', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { apiKey } = req.body;
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config) return res.status(404).json({ error: 'Config not found' });

    await prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { readAiApiKey: apiKey || null },
    });

    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
