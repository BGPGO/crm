import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';

// Event types that Autentique uses to signal "all signed".
// Includes both dot-separated (document.finished) and underscore (document_finished)
// because the format depends on Autentique config.
const FINISHED_EVENTS = new Set([
  'document.done', 'document.completed', 'document.finished',
  'document_done', 'document_completed', 'document_finished',
  'done', 'finished',
]);

// A signature with action=null is an observer/copy (added by Autentique email_template_id),
// not a real signer. We only count those that have an action.
function isRealSigner(sig: any): boolean {
  if (!sig) return false;
  const action = sig.action;
  if (action === null || action === undefined) return false;
  if (typeof action === 'object' && action !== null && !action.name) return false;
  return true;
}

function countRealSigned(signatures: any[]): { real: number; signed: number } {
  const real = signatures.filter(isRealSigner);
  const signed = real.filter((s) => s?.signed?.created_at || (typeof s?.signed === 'string' && s.signed));
  return { real: real.length, signed: signed.length };
}

/**
 * Handles incoming Autentique webhook — called from both
 * /api/contracts/webhook/autentique and /api/webhooks/incoming/:id
 */
export async function handleAutentiqueWebhook(req: Request, res: Response) {
  try {
    // Validate webhook secret (if present in headers — Autentique may not send one)
    const webhookSecret = process.env.AUTENTIQUE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const incomingSecret =
        (req.headers['x-webhook-secret'] as string) ??
        req.headers['authorization']?.replace(/^Bearer\s+/i, '');
      // Only reject if a secret IS provided but doesn't match.
      // Autentique doesn't send auth headers, so missing secret = allow through.
      if (incomingSecret && incomingSecret !== webhookSecret) {
        console.warn('[contract-webhook] Invalid webhook secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const body = req.body;
    console.log('[contract-webhook] Received webhook:', JSON.stringify(body).slice(0, 500));

    // ── Extract document ID ──────────────────────────────────────────────────
    // Autentique real payload structure:
    //   body.event.data.id  = document hash (primary path)
    //   body.data.data.id   = alternative
    //   body.document.id    = legacy/generic
    const documentId =
      body?.event?.data?.id ||      // Autentique: { event: { data: { id } } }
      body?.data?.data?.id ||
      body?.document?.id ||
      body?.data?.document?.id ||
      body?.data?.id ||
      body?.id;

    if (!documentId) {
      console.warn('[contract-webhook] No document ID found in payload');
      return res.status(200).json({ received: true });
    }

    console.log(`[contract-webhook] Document ID: ${documentId}`);

    // ── Extract event type and signatures (shared by both flows) ─────────────
    const eventType =
      body?.event?.type ||
      body?.event ||
      body?.data?.event ||
      '';
    const eventTypeStr = typeof eventType === 'string' ? eventType : '';
    const isFinishedByEvent = FINISHED_EVENTS.has(eventTypeStr);

    const signatures: any[] =
      body?.event?.data?.signatures ||
      body?.data?.data?.signatures ||
      body?.data?.signatures ||
      [];

    console.log(`[contract-webhook] Event type: "${eventTypeStr}" | isFinished: ${isFinishedByEvent} | signatures in payload: ${signatures.length}`);

    // ── 1) Try to match as a Contract ────────────────────────────────────────
    const contract = await prisma.contract.findFirst({
      where: { autentiqueDocumentId: documentId },
      include: {
        deal: { include: { contact: true, organization: true, user: true } },
      },
    });

    if (contract) {
      for (const sig of signatures) {
        if (!isRealSigner(sig)) continue;
        const email = sig?.user?.email || sig?.email;
        const signedAt = sig?.signed?.created_at || (typeof sig?.signed === 'string' ? sig.signed : null);
        if (email && signedAt) {
          const updated = await prisma.contractSignatureRecord.updateMany({
            where: { contractId: contract.id, signerEmail: email, status: 'pending' },
            data: { status: 'signed', signedAt: new Date(signedAt) },
          });
          if (updated.count > 0) {
            console.log(`[contract-webhook] Signer ${email} marked as signed (${signedAt})`);
          }
        }
      }

      const { real, signed } = countRealSigned(signatures);
      const allSignedByCount = real > 0 && signed === real;

      if (isFinishedByEvent || allSignedByCount) {
        console.log(`[contract-webhook] Contract all signed (event: ${isFinishedByEvent}, count: ${signed}/${real})`);
        await handleAllSigned(contract);
      } else {
        const pending = await prisma.contractSignatureRecord.count({
          where: { contractId: contract.id, status: 'pending' },
        });
        console.log(`[contract-webhook] Pending contract signatures in DB: ${pending}`);
        if (pending === 0) await handleAllSigned(contract);
      }

      return res.status(200).json({ received: true });
    }

    // ── 2) Try to match as a SentDocument (Aditivo/Distrato) ─────────────────
    const sentDocument = await prisma.sentDocument.findFirst({
      where: { autentiqueDocumentId: documentId },
      include: {
        deal: { include: { contact: true, organization: true, user: true } },
      },
    });

    if (sentDocument) {
      const { real, signed } = countRealSigned(signatures);
      const allSignedByCount = real > 0 && signed === real;

      console.log(`[contract-webhook] SentDocument ${sentDocument.id} (${sentDocument.documentType}) — signed=${signed}/${real} | event=${eventTypeStr}`);

      await prisma.sentDocument.update({
        where: { id: sentDocument.id },
        data: {
          signedCount: signed,
          totalSigners: real,
          lastCheckedAt: new Date(),
          metadata: signatures.length > 0 ? signatures : sentDocument.metadata as any,
          status: allSignedByCount || isFinishedByEvent ? 'signed' : 'pending',
        },
      });

      if ((isFinishedByEvent || allSignedByCount) && sentDocument.status !== 'signed') {
        console.log(`[contract-webhook] SentDocument fully signed — moving deal to "Ganho fechado"`);
        await handleSentDocumentSigned(sentDocument);
      }

      return res.status(200).json({ received: true });
    }

    console.warn(`[contract-webhook] No contract or sentDocument found for Autentique doc ${documentId}`);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[contract-webhook] Error:', err);
    res.status(200).json({ received: true, error: 'internal' });
  }
}

async function moveDealToWon(opts: {
  dealId: string;
  deal: any;
  source: 'contract-signed' | 'sentdocument-signed';
  activityContent: string;
  activityMetadata: Record<string, any>;
}) {
  const ganhoStage = await prisma.pipelineStage.findFirst({
    where: { name: { contains: 'Ganho fechado', mode: 'insensitive' } },
  });
  if (ganhoStage && opts.deal) {
    await prisma.deal.update({
      where: { id: opts.dealId },
      data: { stageId: ganhoStage.id, status: 'WON', closedAt: new Date() },
    });
    console.log(`[contract-webhook] Deal ${opts.dealId} moved to "Ganho fechado" (${opts.source})`);
  }

  if (opts.deal?.userId) {
    await prisma.activity.create({
      data: {
        type: 'NOTE',
        content: opts.activityContent,
        dealId: opts.dealId,
        userId: opts.deal.userId,
        metadata: { source: opts.source, ...opts.activityMetadata },
      },
    });
  }
}

async function handleSentDocumentSigned(sentDocument: any) {
  if (!sentDocument.dealId) {
    console.warn(`[contract-webhook] SentDocument ${sentDocument.id} has no dealId — skipping deal move`);
    return;
  }

  const docTypeLabel =
    sentDocument.documentType === 'aditivo' ? 'Aditivo'
      : sentDocument.documentType === 'distrato' ? 'Distrato'
      : 'Documento';

  await moveDealToWon({
    dealId: sentDocument.dealId,
    deal: sentDocument.deal,
    source: 'sentdocument-signed',
    activityContent: `${docTypeLabel} "${sentDocument.documentName}" assinado por todas as partes! Deal movido para Ganho Fechado.`,
    activityMetadata: {
      sentDocumentId: sentDocument.id,
      documentType: sentDocument.documentType,
      autentiqueDocumentId: sentDocument.autentiqueDocumentId,
    },
  });

  // Notification (email + WhatsApp) using deal data, since SentDocument doesn't have produto/valorMensal
  const clientName = sentDocument.deal?.organization?.name || sentDocument.deal?.contact?.name || 'Cliente';
  const dealTitle = sentDocument.deal?.title || sentDocument.documentName;
  const dealValue = sentDocument.deal?.value != null ? String(sentDocument.deal.value) : '—';
  await sendDealWonNotifications({
    clientName,
    dealTitle,
    produto: docTypeLabel,
    valorMensal: dealValue,
  });
}

async function handleAllSigned(contract: any) {
  if (contract.status === 'SIGNED' || contract.status === 'COMPLETED') return;

  console.log(`[contract-webhook] All signatures completed for contract ${contract.id}`);

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: 'SIGNED', autentiqueSignedAt: new Date() },
  });

  await prisma.contractSignatureRecord.updateMany({
    where: { contractId: contract.id },
    data: { status: 'signed', signedAt: new Date() },
  });

  await moveDealToWon({
    dealId: contract.dealId,
    deal: contract.deal,
    source: 'contract-signed',
    activityContent: 'Contrato assinado por todas as partes! Deal movido para Ganho Fechado.',
    activityMetadata: { contractId: contract.id },
  });

  const clientName = contract.deal?.organization?.name || contract.deal?.contact?.name || contract.razaoSocial;
  const dealTitle = contract.deal?.title || 'Negociação';
  await sendDealWonNotifications({
    clientName,
    dealTitle,
    produto: contract.produto || '—',
    valorMensal: contract.valorMensal != null ? String(contract.valorMensal) : '—',
  });
}

async function sendDealWonNotifications(args: {
  clientName: string;
  dealTitle: string;
  produto: string;
  valorMensal: string;
}) {
  const { clientName, dealTitle, produto, valorMensal } = args;

  // Email notification
  const notifConfigs = await prisma.notificationConfig.findMany({
    where: { key: { in: ['deal_won_enabled', 'deal_won_emails', 'deal_won_subject'] } },
  });
  const nMap: Record<string, string> = {};
  for (const c of notifConfigs) nMap[c.key] = c.value;

  const emailEnabled = (nMap.deal_won_enabled ?? 'true') === 'true';
  const emails = (nMap.deal_won_emails ?? '').split(',').map(e => e.trim()).filter(Boolean);

  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && emailEnabled && emails.length > 0) {
      const resend = new Resend(resendKey);
      const subject = (nMap.deal_won_subject ?? 'Contrato Assinado — {{cliente}}').replace('{{cliente}}', clientName);
      await resend.emails.send({
        from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
        to: emails,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #059669; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">Contrato Assinado!</h1>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; color: #374151;">Todas as partes assinaram o contrato:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px 0; font-weight: bold; color: #6b7280; width: 140px;">Negociação</td><td style="padding: 8px 0;">${dealTitle}</td></tr>
                <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Cliente</td><td style="padding: 8px 0;">${clientName}</td></tr>
                <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Produto</td><td style="padding: 8px 0;">${produto}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Mensal</td><td style="padding: 8px 0; font-weight: bold; color: #059669;">R$ ${valorMensal}</td></tr>
              </table>
            </div>
          </div>`,
      });
      console.log(`[contract-webhook] Email sent to ${emails.join(', ')}`);
    }
  } catch (err) {
    console.error('[contract-webhook] Email error:', err);
  }

  // WhatsApp notification
  const waConfigs = await prisma.notificationConfig.findMany({
    where: { key: { in: ['deal_won_whatsapp_phone', 'deal_won_whatsapp_enabled', 'deal_won_whatsapp_format'] } },
  });
  const waMap: Record<string, string> = {};
  for (const c of waConfigs) waMap[c.key] = c.value;

  const waEnabled = (waMap.deal_won_whatsapp_enabled ?? 'true') === 'true';
  const waPhone = waMap.deal_won_whatsapp_phone || '5551937111140';
  const waFormat = waMap.deal_won_whatsapp_format || '🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}';

  try {
    if (waEnabled && waPhone) {
      const { EvolutionApiClient } = await import('./evolutionApiClient');
      const client = await EvolutionApiClient.fromConfig();

      let connected = false;
      try {
        const status = await client.getInstanceStatus();
        const state = (status as any)?.instance?.state || (status as any)?.state;
        connected = state === 'open' || state === 'connected';
      } catch { connected = false; }

      if (connected) {
        const { canSend: canSendNow, registerSent: regSent } = await import('./dailyLimitService');
        if (!await canSendNow()) {
          console.warn('[contract-webhook] Limite diário atingido — WhatsApp não enviado');
        } else {
          const msg = waFormat
            .replace(/\{\{valor\}\}/gi, valorMensal)
            .replace(/\{\{produto\}\}/gi, produto)
            .replace(/\{\{cliente\}\}/gi, clientName);
          await client.sendText(waPhone, msg);
          await regSent('reminder');
          console.log(`[contract-webhook] WhatsApp sent to ${waPhone}`);
        }
      }
    }
  } catch (err) {
    console.error('[contract-webhook] WhatsApp error:', err);
  }
}
