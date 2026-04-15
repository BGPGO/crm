import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { triggerMeetingAnalysis, analyzeMeeting } from '../services/meetingAnalyzer';

const router = Router();

// Domínios de email dos consultores BGP — nunca devem ser usados para matching
// de reunião com lead, apenas os emails externos (do cliente).
const INTERNAL_EMAIL_DOMAINS = ['@bertuzzipatrimonial.com.br', '@bgpgo.com'];

function isInternalEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return INTERNAL_EMAIL_DOMAINS.some(d => lower.endsWith(d));
}

/**
 * Dado uma lista de emails dos participantes, encontra o lead correspondente.
 * - Ignora emails internos (consultores BGP)
 * - Tenta cada email externo um a um, até achar um com deal OPEN
 * - Se nenhum tem deal OPEN, retorna o contact achado (ainda útil) sem deal
 * - Se nenhum email externo bate com contact, retorna null
 */
async function matchParticipantsToLead(participantEmails: string[]): Promise<{ contactId: string | null; dealId: string | null }> {
  const externalEmails = participantEmails.filter(e => !isInternalEmail(e));
  if (externalEmails.length === 0) return { contactId: null, dealId: null };

  let fallbackContactId: string | null = null;

  for (const email of externalEmails) {
    const contact = await prisma.contact.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: {
        id: true,
        deals: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, userId: true },
          take: 1,
        },
      },
    });
    if (!contact) continue;

    if (contact.deals.length > 0) {
      // Match ideal: contact com deal OPEN
      return { contactId: contact.id, dealId: contact.deals[0].id };
    }
    // Guarda o primeiro contact encontrado mesmo sem deal (fallback)
    if (!fallbackContactId) fallbackContactId = contact.id;
  }

  return { contactId: fallbackContactId, dealId: null };
}

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

    // Only process meetings with "Diagnóstico" in the title (sales meetings)
    // Other meetings are ignored
    const REQUIRED_TITLE_KEYWORD = 'diagnóstico';
    if (title && !title.toLowerCase().includes(REQUIRED_TITLE_KEYWORD)) {
      console.log(`[Read.ai] Ignoring meeting "${title}" — not a sales meeting`);
      return res.json({ ok: true, ignored: true, reason: 'Title does not match sales meeting pattern' });
    }

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

    // Try to match to a deal via participant emails (ignora consultores BGP)
    let { contactId, dealId } = await matchParticipantsToLead(participantEmails);

    // Store the meeting data
    const storedMeeting = await prisma.readAiMeeting.upsert({
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

    // Trigger AI analysis in background if transcript is available (non-blocking)
    if (transcript) {
      triggerMeetingAnalysis(storedMeeting.id);
    }

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
    const unlinked = req.query.unlinked === 'true';
    const all = req.query.all === 'true';

    const where: Record<string, unknown> = {};
    if (dealId) where.dealId = dealId as string;
    if (contactId) where.contactId = contactId as string;
    if (unlinked) where.dealId = null;

    // If not filtering by anything specific and not requesting all, return empty
    // (prevents accidentally loading everything)
    if (!dealId && !contactId && !unlinked && !all) {
      return res.json({ data: [] });
    }

    const meetings = await prisma.readAiMeeting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
        aiAnalysis: true,
        aiAnalyzedAt: true,
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
 * POST /api/readai/meetings/:id/analyze — (Re)generate AI analysis for a meeting
 * Can be called manually (button "Reanalisar") or programmatically.
 */
router.post('/meetings/:id/analyze', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const meeting = await prisma.readAiMeeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, transcript: true, title: true },
    });

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.transcript) return res.status(422).json({ error: 'Meeting has no transcript to analyze' });

    const { analyzeMeeting: runAnalysis } = await import('../services/meetingAnalyzer');
    const analysis = await runAnalysis(meeting.transcript, meeting.title);

    const updated = await prisma.readAiMeeting.update({
      where: { id: meeting.id },
      data: { aiAnalysis: analysis as any, aiAnalyzedAt: new Date() },
    });

    res.json({ data: { aiAnalysis: updated.aiAnalysis, aiAnalyzedAt: updated.aiAnalyzedAt } });
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

/**
 * POST /api/readai/performance-report — Receives a sales performance report
 * from the BGP Sales Report service and stores it in the deal's timeline.
 * Public endpoint (called by our automated pipeline).
 */
router.post('/performance-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      session_id,
      title,
      meeting_date,
      score,
      report_html,
      report_json,
      participants,
      pipeline, // "sales" or "ops"
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    console.log(`[Performance Report] Received: ${title} (score: ${score}, pipeline: ${pipeline})`);

    // 1. Try to find the ReadAiMeeting by sessionId
    let meeting = await prisma.readAiMeeting.findUnique({
      where: { sessionId: String(session_id) },
    });

    // 2. If no meeting found, try to match via participant emails
    let dealId: string | null = meeting?.dealId || null;
    let contactId: string | null = meeting?.contactId || null;

    if (!dealId && participants && Array.isArray(participants)) {
      const participantEmails = participants
        .map((p: any) => typeof p === 'string' ? p : (p.email || ''))
        .filter((e: string) => e && e.includes('@'))
        .map((e: string) => e.toLowerCase());

      if (participantEmails.length > 0) {
        const matched = await matchParticipantsToLead(participantEmails);
        contactId = matched.contactId;
        dealId = matched.dealId;
      }
    }

    // 3. Also try matching by meeting title (extract client name from "Diagnóstico Financeiro BGP <> ClientName")
    if (!dealId && title) {
      const nameMatch = title.match(/<>\s*(.+)$/i);
      if (nameMatch) {
        const clientName = nameMatch[1].trim();
        // Find contact by exact unique name
        const contacts = await prisma.contact.findMany({
          where: { name: { contains: clientName, mode: 'insensitive' } },
          select: { id: true, name: true, deals: { where: { status: 'OPEN' }, select: { id: true, userId: true }, take: 1 } },
        });

        if (contacts.length === 1) {
          contactId = contactId || contacts[0].id;
          dealId = dealId || contacts[0].deals?.[0]?.id || null;
          console.log(`[Performance Report] Matched by name: "${clientName}" → contact ${contactId}, deal ${dealId}`);
        }
      }
    }

    // 4. Update the ReadAiMeeting record with report data (if exists)
    if (meeting) {
      await prisma.readAiMeeting.update({
        where: { sessionId: String(session_id) },
        data: {
          dealId: dealId || meeting.dealId,
          contactId: contactId || meeting.contactId,
        },
      });
    }

    // 5. Create Activity in the deal's timeline with the report
    if (dealId) {
      const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { userId: true } });
      if (deal) {
        const scoreEmoji = (score || 0) >= 7 ? '🟢' : (score || 0) >= 5 ? '🟡' : '🔴';
        const pipelineLabel = pipeline === 'ops' ? 'Operação' : 'Vendas';
        const activityContent = report_html
          || `<h3>${scoreEmoji} Relatório de ${pipelineLabel} — Score ${score || '?'}/10</h3><p>${title || 'Reunião'}</p><pre>${JSON.stringify(report_json, null, 2)}</pre>`;

        await prisma.activity.create({
          data: {
            type: 'MEETING' as any,
            content: activityContent,
            metadata: {
              source: 'bgp-sales-report',
              pipeline: pipeline || 'sales',
              score: score || null,
              session_id,
              meeting_date: meeting_date || null,
              report_json: report_json || null,
            },
            dealId,
            contactId,
            userId: deal.userId,
          },
        });

        console.log(`[Performance Report] Activity created in deal ${dealId} (score: ${score})`);
      }
    } else {
      console.log(`[Performance Report] No deal found for "${title}" — report stored but not linked`);
    }

    res.json({
      ok: true,
      dealId,
      contactId,
      linked: !!dealId,
    });
  } catch (err) {
    console.error('[Performance Report] Error:', err);
    next(err);
  }
});

export default router;
