import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';

const router = Router();

async function getNotificationConfig(): Promise<{ enabled: boolean; emails: string[]; subject: string }> {
  const configs = await prisma.notificationConfig.findMany({
    where: { key: { in: ['deal_won_enabled', 'deal_won_emails', 'deal_won_subject'] } },
  });
  const map: Record<string, string> = {};
  for (const c of configs) map[c.key] = c.value;

  return {
    enabled: (map.deal_won_enabled ?? 'true') === 'true',
    emails: (map.deal_won_emails ?? 'fernanda@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br').split(',').map(e => e.trim()).filter(Boolean),
    subject: map.deal_won_subject ?? 'Contrato Assinado — {{cliente}}',
  };
}

// POST /api/contracts/webhook/autentique — Autentique signature webhook (PUBLIC)
router.post('/autentique', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    console.log('[contract-webhook] Received:', JSON.stringify(body).slice(0, 500));

    // Autentique sends document.id when signatures are completed
    const documentId = body?.document?.id || body?.data?.document?.id || body?.id;
    if (!documentId) {
      console.warn('[contract-webhook] No document ID in payload');
      return res.status(200).json({ received: true });
    }

    // Find contract by autentiqueDocumentId
    const contract = await prisma.contract.findFirst({
      where: { autentiqueDocumentId: documentId },
      include: {
        deal: {
          include: {
            contact: true,
            organization: true,
            user: true,
          },
        },
      },
    });

    if (!contract) {
      console.warn(`[contract-webhook] No contract found for Autentique doc ${documentId}`);
      return res.status(200).json({ received: true });
    }

    // Check event type — Autentique sends events for each signature and when all sign
    const event = body?.event || body?.data?.event || '';
    const allSigned = event === 'document.done' || event === 'document.completed' || event === 'done';

    // Update individual signer if info provided
    const signerEmail = body?.signature?.email || body?.data?.signature?.email;
    if (signerEmail) {
      await prisma.contractSignatureRecord.updateMany({
        where: { contractId: contract.id, signerEmail, status: 'pending' },
        data: { status: 'signed', signedAt: new Date() },
      });
      console.log(`[contract-webhook] Signer ${signerEmail} signed contract ${contract.id}`);
    }

    // Check if all signers have signed (or Autentique told us it's done)
    if (allSigned) {
      await handleAllSigned(contract);
    } else {
      // Check manually if all signatures are done
      const pending = await prisma.contractSignatureRecord.count({
        where: { contractId: contract.id, status: 'pending' },
      });
      if (pending === 0) {
        await handleAllSigned(contract);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[contract-webhook] Error:', err);
    res.status(200).json({ received: true, error: 'internal' });
  }
});

async function handleAllSigned(contract: any) {
  // Already completed?
  if (contract.status === 'SIGNED' || contract.status === 'COMPLETED') return;

  console.log(`[contract-webhook] All signatures completed for contract ${contract.id}`);

  // Update contract status
  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: 'SIGNED', autentiqueSignedAt: new Date() },
  });

  // Mark all signatures as signed
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

  // Log activity
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

  // Create notification for deal owner
  const dealTitle = contract.deal?.title || 'Negociação';
  const clientName = contract.deal?.organization?.name || contract.deal?.contact?.name || contract.razaoSocial;

  // Send email notification based on config
  const notifConfig = await getNotificationConfig();
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && notifConfig.enabled && notifConfig.emails.length > 0) {
      const resend = new Resend(resendKey);
      const subject = notifConfig.subject.replace('{{cliente}}', clientName);
      await resend.emails.send({
        from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
        to: notifConfig.emails,
        subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #059669; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">Contrato Assinado!</h1>
            </div>
            <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <p style="font-size: 16px; color: #374151;">Todas as partes assinaram o contrato da negociação:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280; width: 140px;">Negociação</td>
                  <td style="padding: 8px 0; color: #111827;">${dealTitle}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Cliente</td>
                  <td style="padding: 8px 0; color: #111827;">${clientName}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">CNPJ</td>
                  <td style="padding: 8px 0; color: #111827;">${contract.cnpj || '—'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Produto</td>
                  <td style="padding: 8px 0; color: #111827;">${contract.produto || '—'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Mensal</td>
                  <td style="padding: 8px 0; color: #111827; font-weight: bold; color: #059669;">R$ ${contract.valorMensal || '—'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Responsável</td>
                  <td style="padding: 8px 0; color: #111827;">${contract.deal?.user?.name || '—'}</td>
                </tr>
              </table>
              <p style="font-size: 14px; color: #6b7280;">A negociação foi automaticamente movida para <strong>Ganho Fechado</strong>.</p>
              <a href="https://crm.bertuzzipatrimonial.com.br/pipeline/${contract.dealId}"
                 style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
                Ver Negociação
              </a>
            </div>
          </div>
        `,
      });
      console.log(`[contract-webhook] Notification emails sent to ${notifConfig.emails.join(', ')}`);
    }
  } catch (emailErr) {
    console.error('[contract-webhook] Failed to send email notification:', emailErr);
  }

  // Send WhatsApp notification
  try {
    const waConfigs = await prisma.notificationConfig.findMany({
      where: { key: { in: ['deal_won_whatsapp_phone', 'deal_won_whatsapp_enabled', 'deal_won_whatsapp_format'] } },
    });
    const waMap: Record<string, string> = {};
    for (const c of waConfigs) waMap[c.key] = c.value;

    const phone = waMap.deal_won_whatsapp_phone || '5551937111140';
    const isEnabled = (waMap.deal_won_whatsapp_enabled ?? 'true') === 'true';
    const format = waMap.deal_won_whatsapp_format || '🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}';

    if (isEnabled && phone) {
      const { EvolutionApiClient } = await import('../services/evolutionApiClient');
      const client = await EvolutionApiClient.fromConfig();

      // Check connection first
      let connected = false;
      try {
        const status = await client.getInstanceStatus();
        const state = (status as any)?.instance?.state || (status as any)?.state;
        connected = state === 'open' || state === 'connected';
      } catch { connected = false; }

      if (connected) {
        const msg = format
          .replace(/\{\{valor\}\}/gi, String(contract.valorMensal || '—'))
          .replace(/\{\{produto\}\}/gi, contract.produto || '—')
          .replace(/\{\{cliente\}\}/gi, clientName);
        await client.sendText(phone, msg);
        console.log(`[contract-webhook] WhatsApp notification sent to ${phone}`);
      }
    }
  } catch (waErr) {
    console.error('[contract-webhook] Failed to send WhatsApp notification:', waErr);
  }
}

export default router;
