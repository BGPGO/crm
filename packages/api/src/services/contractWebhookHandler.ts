import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';

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

    const contract = await prisma.contract.findFirst({
      where: { autentiqueDocumentId: documentId },
      include: {
        deal: { include: { contact: true, organization: true, user: true } },
      },
    });

    if (!contract) {
      console.warn(`[contract-webhook] No contract found for Autentique doc ${documentId}`);
      return res.status(200).json({ received: true });
    }

    // ── Extract event type ───────────────────────────────────────────────────
    // Autentique: body.event.type = "document.finished"
    const eventType =
      body?.event?.type ||
      body?.event ||
      body?.data?.event ||
      '';
    const eventTypeStr = typeof eventType === 'string' ? eventType : '';

    const isFinished = ['document.done', 'document.completed', 'document.finished', 'done', 'finished'].includes(eventTypeStr);

    console.log(`[contract-webhook] Event type: "${eventTypeStr}" | isFinished: ${isFinished}`);

    // ── Update individual signers from payload ───────────────────────────────
    // Autentique sends full signatures array in body.event.data.signatures
    const signatures: any[] =
      body?.event?.data?.signatures ||
      body?.data?.data?.signatures ||
      body?.data?.signatures ||
      [];

    for (const sig of signatures) {
      const email = sig?.user?.email;
      const signedAt = sig?.signed; // ISO string or null
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

    // ── Check if all signatures are complete ─────────────────────────────────
    // 1. Event says finished, OR
    // 2. signed_count === signatures_count in payload, OR
    // 3. No pending signatures in our DB
    const docData = body?.event?.data || body?.data?.data || {};
    const allSignedByCount = docData.signed_count > 0 && docData.signed_count === docData.signatures_count;

    if (isFinished || allSignedByCount) {
      console.log(`[contract-webhook] All signed (event: ${isFinished}, count: ${allSignedByCount})`);
      await handleAllSigned(contract);
    } else {
      const pending = await prisma.contractSignatureRecord.count({
        where: { contractId: contract.id, status: 'pending' },
      });
      console.log(`[contract-webhook] Pending signatures: ${pending}`);
      if (pending === 0) await handleAllSigned(contract);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[contract-webhook] Error:', err);
    res.status(200).json({ received: true, error: 'internal' });
  }
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

  // Move deal to "Ganho fechado"
  const ganhoStage = await prisma.pipelineStage.findFirst({
    where: { name: { contains: 'Ganho fechado', mode: 'insensitive' } },
  });
  if (ganhoStage && contract.deal) {
    await prisma.deal.update({
      where: { id: contract.dealId },
      data: { stageId: ganhoStage.id, status: 'WON', closedAt: new Date() },
    });
    console.log(`[contract-webhook] Deal ${contract.dealId} moved to "Ganho fechado"`);
  }

  if (contract.deal?.userId) {
    await prisma.activity.create({
      data: {
        type: 'NOTE',
        content: `Contrato assinado por todas as partes! Deal movido para Ganho Fechado.`,
        dealId: contract.dealId,
        userId: contract.deal.userId,
        metadata: { source: 'contract-signed', contractId: contract.id },
      },
    });
  }

  const clientName = contract.deal?.organization?.name || contract.deal?.contact?.name || contract.razaoSocial;
  const dealTitle = contract.deal?.title || 'Negociação';

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
                <tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Produto</td><td style="padding: 8px 0;">${contract.produto || '—'}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Mensal</td><td style="padding: 8px 0; font-weight: bold; color: #059669;">R$ ${contract.valorMensal || '—'}</td></tr>
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
        const msg = waFormat
          .replace(/\{\{valor\}\}/gi, String(contract.valorMensal || '—'))
          .replace(/\{\{produto\}\}/gi, contract.produto || '—')
          .replace(/\{\{cliente\}\}/gi, clientName);
        await client.sendText(waPhone, msg);
        console.log(`[contract-webhook] WhatsApp sent to ${waPhone}`);
      }
    }
  } catch (err) {
    console.error('[contract-webhook] WhatsApp error:', err);
  }
}
