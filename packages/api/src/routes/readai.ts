import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

/**
 * POST /api/readai/webhook — Receives notification from Read.ai when meeting ends
 * Read.ai sends: { session_id, trigger }
 * We then fetch the full meeting data from Read.ai API and store it
 */
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, trigger } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    console.log(`[Read.ai] Webhook received: session=${session_id}, trigger=${trigger}`);

    // Get Read.ai API key from config
    const config = await prisma.whatsAppConfig.findFirst();
    const apiKey = (config as any)?.readAiApiKey;

    if (!apiKey) {
      console.warn('[Read.ai] No API key configured — storing session_id only');
      await prisma.readAiMeeting.upsert({
        where: { sessionId: session_id },
        create: { sessionId: session_id },
        update: {},
      });
      return res.json({ ok: true, message: 'Session stored, no API key to fetch details' });
    }

    // Fetch meeting data from Read.ai API
    let meetingData: any = null;
    try {
      const meetingRes = await fetch(`https://api.read.ai/v1/meetings/${session_id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (meetingRes.ok) {
        meetingData = await meetingRes.json();
      } else {
        console.warn(`[Read.ai] API returned ${meetingRes.status} for session ${session_id}`);
      }
    } catch (fetchErr) {
      console.error('[Read.ai] Failed to fetch meeting data:', fetchErr);
    }

    // Try to match to a deal via participant emails
    let dealId: string | null = null;
    let contactId: string | null = null;
    const participants = meetingData?.participants || meetingData?.attendees || [];
    const participantEmails = participants
      .map((p: any) => p.email || p.participant_email)
      .filter(Boolean)
      .map((e: string) => e.toLowerCase());

    if (participantEmails.length > 0) {
      // Find contacts matching participant emails
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
    const summary = meetingData?.summary || meetingData?.meeting_summary || null;
    const transcript = meetingData?.transcript
      ? (typeof meetingData.transcript === 'string'
        ? meetingData.transcript
        : JSON.stringify(meetingData.transcript))
      : null;
    const actionItems = meetingData?.action_items || meetingData?.actionItems || null;
    const topics = meetingData?.topics || meetingData?.key_topics || null;
    const title = meetingData?.title || meetingData?.meeting_title || meetingData?.name || null;
    const duration = meetingData?.duration_minutes || meetingData?.duration || null;
    const meetingDate = meetingData?.start_time || meetingData?.meeting_date || meetingData?.created_at || null;

    await prisma.readAiMeeting.upsert({
      where: { sessionId: session_id },
      create: {
        sessionId: session_id,
        title,
        summary,
        transcript,
        actionItems,
        topics,
        duration: duration ? parseInt(String(duration)) : null,
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        participants: participantEmails.length > 0 ? participantEmails : (participants.length > 0 ? participants : null),
        dealId,
        contactId,
        rawData: meetingData,
      },
      update: {
        title,
        summary,
        transcript,
        actionItems,
        topics,
        duration: duration ? parseInt(String(duration)) : null,
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        participants: participantEmails.length > 0 ? participantEmails : (participants.length > 0 ? participants : null),
        dealId: dealId || undefined,
        contactId: contactId || undefined,
        rawData: meetingData,
      },
    });

    console.log(`[Read.ai] Meeting ${session_id} stored (deal: ${dealId || 'none'}, contact: ${contactId || 'none'})`);

    // If we found a deal, log an activity
    if (dealId) {
      try {
        // Fetch the deal to get userId (required for Activity)
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
      } catch { /* silent — activity logging is non-critical */ }
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
router.get('/meetings', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/meetings/:id', async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/meetings/:id/link', async (req: Request, res: Response, next: NextFunction) => {
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
router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
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
router.put('/config', async (req: Request, res: Response, next: NextFunction) => {
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
