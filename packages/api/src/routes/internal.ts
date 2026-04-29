/**
 * Internal endpoints called by Supabase Edge Functions.
 * Public (no auth) — the Edge Function runs server-side with env secrets.
 */

import { Router, Request, Response } from 'express';
import { sendLeadNotifications } from '../services/leadNotificationService';
import { onLeadCreated } from '../services/leadQualificationEngine';
import { sendDailyReport } from '../services/dailyReportService';
import prisma from '../lib/prisma';
import { getMetaAdsDaily, getMetaAdsMTD } from '../services/metaAds';
import { getGoogleAdsDaily, getGoogleAdsMTD } from '../services/googleAds';
import { getBgpMessengerDailyStats } from '../services/bgpmassa';
import { getCampaignMetrics } from '../services/emailMetrics';

const router = Router();

// Default stage ID for "Lead" (first stage)
const DEFAULT_STAGE_ID = '64fb7516ea4eb400219457df';

const PIPELINE_ID = '64fb7516ea4eb400219457de';
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * POST /api/internal/lead-created
 * Called by the Supabase Edge Function after creating a lead.
 * Triggers: email notification, automations, SDR IA qualification.
 */
router.post('/lead-created', async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, contactName, contactEmail, contactPhone, sourceName, campaignName, landingPage } = req.body;

    if (!contactId || !dealId) {
      return res.status(400).json({ error: 'contactId and dealId are required' });
    }

    // Email notification to team
    sendLeadNotifications({
      dealId,
      contactName: contactName ?? 'Sem nome',
      contactEmail: contactEmail ?? null,
      contactPhone: contactPhone ?? null,
      sourceName: sourceName ?? null,
      campaignName: campaignName ?? null,
      utmUrl: landingPage ?? null,
    }).catch(err => console.error('[internal/lead-created] Notification error:', err));

    // Trigger lead qualification + automations (onLeadCreated already calls
    // evaluateTriggers for CONTACT_CREATED and STAGE_CHANGED internally)
    onLeadCreated(contactId, dealId).catch(err => {
      console.error('[internal/lead-created] LeadQualification error:', err);
    });

    console.log(`[internal/lead-created] Triggered for contact=${contactId} deal=${dealId} name=${contactName}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[internal/lead-created] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * POST /api/internal/send-daily-report
 * Dispara o relatório diário das 7h manualmente.
 * Auth via header x-internal-secret (reusa META_ADS_INTERNAL_SECRET do Coolify).
 */
router.post('/send-daily-report', async (req: Request, res: Response) => {
  const secret = req.header('x-internal-secret');
  const expected = process.env.META_ADS_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    // Suporta override de destinatários via query (?to=email1,email2) ou body.recipients[]
    const toRaw = (req.query.to as string | undefined) ?? '';
    const bodyRecipients = Array.isArray(req.body?.recipients) ? req.body.recipients as string[] : [];
    const queryRecipients = toRaw.split(',').map(e => e.trim()).filter(Boolean);
    const recipients = [...queryRecipients, ...bodyRecipients];

    const subjectPrefix = (req.query.prefix as string | undefined) ?? (recipients.length > 0 ? '[TESTE] ' : '');

    await sendDailyReport({
      recipients: recipients.length > 0 ? recipients : undefined,
      subjectPrefix,
    });
    return res.status(200).json({ success: true, sentTo: recipients.length > 0 ? recipients : 'config padrão' });
  } catch (err) {
    console.error('[internal/send-daily-report] erro:', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

/**
 * GET /api/internal/preview-daily-report
 * Renderiza o HTML do relatório direto (sem mandar email) pra inspeção.
 * Auth: x-internal-secret.
 */
router.get('/preview-daily-report', async (req: Request, res: Response) => {
  const secret = req.header('x-internal-secret');
  const expected = process.env.META_ADS_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const { buildDailyReportHtml } = await import('../services/dailyReport');
    const html = await buildDailyReportHtml();
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('[internal/preview-daily-report] erro:', err);
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/internal/validate-daily-report?date=YYYY-MM-DD
 * Devolve JSON com cada métrica calculada por múltiplos caminhos pra cross-check.
 * Auth: x-internal-secret (mesmo do send-daily-report).
 */
router.get('/validate-daily-report', async (req: Request, res: Response) => {
  const secret = req.header('x-internal-secret');
  const expected = process.env.META_ADS_INTERNAL_SECRET;
  if (!expected || secret !== expected) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const dateParam = (req.query.date as string | undefined) || '';
    let refDate: Date;
    if (dateParam) {
      // Interpreta YYYY-MM-DD como início de dia BRT
      const [y, m, d] = dateParam.split('-').map(Number);
      refDate = new Date(Date.UTC(y, m - 1, d) - BRT_OFFSET_MS);
    } else {
      // ontem em BRT
      const now = new Date();
      const brtNow = new Date(now.getTime() + BRT_OFFSET_MS);
      const yesterdayUtc = new Date(
        Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate() - 1),
      );
      refDate = new Date(yesterdayUtc.getTime() - BRT_OFFSET_MS);
    }

    const dayStart = refDate;
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const monthStartBrt = new Date(refDate.getTime() + BRT_OFFSET_MS);
    const monthStart = new Date(
      Date.UTC(monthStartBrt.getUTCFullYear(), monthStartBrt.getUTCMonth(), 1) - BRT_OFFSET_MS,
    );

    const STAGES = {
      LEAD: '64fb7516ea4eb400219457df',
      CONTATO_FEITO: '65bd0418294535000d1f57cd',
      MARCAR_REUNIAO: '64fb7516ea4eb400219457e0',
      REUNIAO_AGENDADA: '64fb7517ea4eb400219457e1',
      PROPOSTA_ENVIADA: '64fb7517ea4eb400219457e2',
      AGUARDANDO_DADOS: '661d5a409a6525001ed04124',
      AGUARDANDO_ASSINATURA: '64fb7517ea4eb400219457e3',
      GANHO_FECHADO: '65084ece058c5700170506d4',
    };

    // ── Funnel ──────────────────────────────────────────────────────────────
    const [
      leadsCreatedYesterday,
      stageMovesToReuniao,
      stageMovesToProposta,
      stageMovesToDados,
      stageMovesToAssinatura,
      stageMovesFromContatoFeito,
      contatoFeitoTotal,
      marcarReuniaoTotal,
      reuniaoAgendadaTotal,
      propostaEnviadaTotal,
      aguardandoDadosTotal,
      aguardandoAssinaturaTotal,
      wonYesterday,
      wonMonth,
    ] = await Promise.all([
      prisma.deal.count({ where: { pipelineId: PIPELINE_ID, createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['toStage'], string_contains: 'Reunião agendada' },
        },
      }),
      prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['toStage'], string_contains: 'Proposta enviada' },
        },
      }),
      prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['toStage'], string_contains: 'Aguardando dados' },
        },
      }),
      prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['toStage'], string_contains: 'Aguardando assinatura' },
        },
      }),
      prisma.activity.count({
        where: {
          type: 'STAGE_CHANGE',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { pipelineId: PIPELINE_ID },
          metadata: { path: ['fromStage'], string_contains: 'Contato feito' },
        },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.CONTATO_FEITO },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.MARCAR_REUNIAO },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.REUNIAO_AGENDADA },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.PROPOSTA_ENVIADA },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.AGUARDANDO_DADOS },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.aggregate({
        where: { pipelineId: PIPELINE_ID, status: 'OPEN', stageId: STAGES.AGUARDANDO_ASSINATURA },
        _count: true,
        _sum: { value: true },
      }),
      prisma.deal.findMany({
        where: { pipelineId: PIPELINE_ID, status: 'WON', closedAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, title: true, value: true, meetingSource: true },
      }),
      prisma.deal.findMany({
        where: { pipelineId: PIPELINE_ID, status: 'WON', closedAt: { gte: monthStart, lt: dayEnd } },
        select: { id: true, value: true },
      }),
    ]);

    // ── Reuniões — múltiplas fontes pra cross-check ─────────────────────────
    const [
      calendlyEventsAll,
      calendlyEventsWithDeal,
      calendlyEventsWithoutDeal,
      activityMeetingsCreatedYesterday,
      activityMeetingsBySource,
      dealsBySource,
    ] = await Promise.all([
      prisma.calendlyEvent.findMany({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'active' },
        select: { id: true, calendlyEventId: true, inviteeEmail: true, inviteeName: true, dealId: true, startTime: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.calendlyEvent.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'active', dealId: { not: null } },
      }),
      prisma.calendlyEvent.count({
        where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'active', dealId: null },
      }),
      prisma.activity.count({
        where: { type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.activity.findMany({
        where: { type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, dealId: true, content: true, deal: { select: { meetingSource: true } } },
      }),
      prisma.deal.groupBy({
        by: ['meetingSource'],
        where: { pipelineId: PIPELINE_ID, updatedAt: { gte: dayStart, lt: dayEnd }, meetingSource: { not: null } },
        _count: true,
      }),
    ]);

    const meetingsBySource: Record<string, number> = {};
    for (const m of activityMeetingsBySource) {
      const src = m.deal?.meetingSource ?? 'NULL';
      meetingsBySource[src] = (meetingsBySource[src] ?? 0) + 1;
    }

    // ── Tráfego Pago ────────────────────────────────────────────────────────
    const [metaDaily, googleDaily, mtdMeta, mtdGoogle] = await Promise.all([
      getMetaAdsDaily(refDate).catch((err) => ({ error: String(err) })),
      getGoogleAdsDaily(refDate).catch((err) => ({ error: String(err) })),
      getMetaAdsMTD(refDate).catch((err) => ({ error: String(err) })),
      getGoogleAdsMTD(refDate).catch((err) => ({ error: String(err) })),
    ]);

    // ── BIA / WhatsApp ──────────────────────────────────────────────────────
    const [
      waBotMsgs,
      waConvsAtivas,
      waConvsMeetingBookedUpdatedYesterday,
      messengerStats,
      activityMeetingsBia,
    ] = await Promise.all([
      prisma.waMessage.count({
        where: { direction: 'OUTBOUND', senderType: 'WA_BOT', createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.waConversation.count({
        where: { lastMessageAt: { gte: dayStart, lt: dayEnd } },
      }),
      prisma.waConversation.count({
        where: { meetingBooked: true, updatedAt: { gte: dayStart, lt: dayEnd } },
      }),
      getBgpMessengerDailyStats(dayStart).catch((err) => ({ error: String(err) })),
      prisma.activity.count({
        where: {
          type: 'MEETING',
          createdAt: { gte: dayStart, lt: dayEnd },
          deal: { meetingSource: 'SDR_IA' },
        },
      }),
    ]);

    // ── Calendly: eventos COMEÇANDO (startTime) ontem ───────────────────────
    const calendlyStartingYesterday = await prisma.calendlyEvent.findMany({
      where: { startTime: { gte: dayStart, lt: dayEnd }, status: 'active' },
      select: { inviteeName: true, inviteeEmail: true, startTime: true, dealId: true },
      orderBy: { startTime: 'asc' },
    });

    // ── Email (última campanha madura) ──────────────────────────────────────
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const lastCampaign = await prisma.emailCampaign.findFirst({
      where: { status: 'SENT', sentAt: { lt: cutoff } },
      orderBy: { sentAt: 'desc' },
      select: { id: true, subject: true, sentAt: true, totalRecipients: true },
    });

    let emailMetricsBlock: any = null;
    if (lastCampaign && lastCampaign.sentAt) {
      const m = await getCampaignMetrics(lastCampaign.id);
      const reunByActivity = await prisma.activity.count({
        where: {
          type: 'MEETING',
          createdAt: { gte: lastCampaign.sentAt },
          deal: { meetingSource: 'CALENDLY_EMAIL' },
        },
      });
      const reunByDealUpdatedAt = await prisma.deal.count({
        where: { meetingSource: 'CALENDLY_EMAIL', updatedAt: { gte: lastCampaign.sentAt } },
      });
      emailMetricsBlock = {
        campaign: lastCampaign,
        metrics: m,
        reuniaoAgendada_byActivity: reunByActivity,
        reuniaoAgendada_byDealUpdatedAt_LEGACY: reunByDealUpdatedAt,
      };
    }

    res.json({
      referenceDate: dayStart.toISOString(),
      window: { dayStart: dayStart.toISOString(), dayEnd: dayEnd.toISOString(), monthStart: monthStart.toISOString() },
      funnel: {
        leadsCreatedYesterday,
        stageMovements: {
          fromContatoFeito: stageMovesFromContatoFeito,
          toReuniaoAgendada: stageMovesToReuniao,
          toPropostaEnviada: stageMovesToProposta,
          toAguardandoDados: stageMovesToDados,
          toAguardandoAssinatura: stageMovesToAssinatura,
        },
        stageTotals: {
          contatoFeito: { count: contatoFeitoTotal._count, value: Number(contatoFeitoTotal._sum.value ?? 0) },
          marcarReuniao: { count: marcarReuniaoTotal._count, value: Number(marcarReuniaoTotal._sum.value ?? 0) },
          reuniaoAgendada: { count: reuniaoAgendadaTotal._count, value: Number(reuniaoAgendadaTotal._sum.value ?? 0) },
          propostaEnviada: { count: propostaEnviadaTotal._count, value: Number(propostaEnviadaTotal._sum.value ?? 0) },
          aguardandoDados: { count: aguardandoDadosTotal._count, value: Number(aguardandoDadosTotal._sum.value ?? 0) },
          aguardandoAssinatura: { count: aguardandoAssinaturaTotal._count, value: Number(aguardandoAssinaturaTotal._sum.value ?? 0) },
        },
        wonYesterday: {
          count: wonYesterday.length,
          value: wonYesterday.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0),
          deals: wonYesterday.map((d) => ({ id: d.id, title: d.title, value: Number(d.value ?? 0), meetingSource: d.meetingSource })),
        },
        wonMonth: {
          count: wonMonth.length,
          value: wonMonth.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0),
        },
      },
      meetings: {
        // Métrica que aparece no relatório (após o fix):
        reportValue_calendlyEventsActive: calendlyEventsAll.length,
        // Cross-checks:
        calendlyEvents_withDeal: calendlyEventsWithDeal,
        calendlyEvents_withoutDeal: calendlyEventsWithoutDeal,
        activity_meetingType_createdYesterday: activityMeetingsCreatedYesterday,
        activitiesByMeetingSource: meetingsBySource,
        dealsByMeetingSource_updatedYesterday: dealsBySource.map((g) => ({ source: g.meetingSource, count: g._count })),
        calendlyEventsRaw: calendlyEventsAll.slice(0, 50), // primeiros 50 pra inspeção
        warnings: buildMeetingsWarnings(calendlyEventsAll.length, calendlyEventsWithoutDeal, activityMeetingsCreatedYesterday),
      },
      paidTraffic: {
        meta: metaDaily,
        google: googleDaily,
        mtdMeta,
        mtdGoogle,
      },
      digitalChannels: {
        bia: {
          msgsEnviadas: waBotMsgs,
          convsAtivas: waConvsAtivas,
          reunAgendadas_byActivity_NEW: activityMeetingsBia,
          reunAgendadas_byUpdatedAt_LEGACY: waConvsMeetingBookedUpdatedYesterday,
          messenger: messengerStats,
        },
        calendlyStartingYesterday: {
          count: calendlyStartingYesterday.length,
          events: calendlyStartingYesterday,
        },
        email: emailMetricsBlock,
      },
    });
  } catch (err) {
    console.error('[internal/validate-daily-report] erro:', err);
    return res.status(500).json({ error: String(err) });
  }
});

function buildMeetingsWarnings(total: number, withoutDeal: number, activityCount: number): string[] {
  const warnings: string[] = [];
  if (withoutDeal > 0) {
    warnings.push(
      `${withoutDeal} CalendlyEvent(s) sem dealId vinculado — webhook quebrou entre o upsert do evento e o link com Deal/Activity.`,
    );
  }
  if (total > 0 && total !== activityCount) {
    warnings.push(
      `Calendly=${total} mas Activity=${activityCount}. Diferença=${Math.abs(total - activityCount)}.`,
    );
  }
  if (total === 0) {
    warnings.push('Zero CalendlyEvents no dia — verifique se o webhook do Calendly está chegando (logs Coolify).');
  }
  return warnings;
}

export default router;
