import prisma from '../lib/prisma';
import { Resend } from 'resend';

interface SaleNotificationData {
  dealId: string;
  dealTitle: string;
  clientName: string;
  productName?: string;
  monthlyValue?: number;
  closedAt?: Date;
}

export async function sendSaleNotifications(data: SaleNotificationData): Promise<void> {
  try {
    // Get notification config
    const configs = await prisma.notificationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.key, c.value]));

    const getConfig = (key: string, defaultValue: string) => configMap.get(key) || defaultValue;

    // --- Email notification ---
    const emailEnabled = getConfig('deal_won_enabled', 'true') === 'true';
    const emailRecipients = getConfig('deal_won_emails', 'fernanda@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br');
    const emailSubject = getConfig('deal_won_subject', '🎉 Venda Fechada — {{cliente}}')
      .replace(/\{\{cliente\}\}/gi, data.clientName || 'Cliente');

    if (emailEnabled && emailRecipients) {
      const emails = emailRecipients.split(',').map(e => e.trim()).filter(Boolean);
      if (emails.length > 0) {
        try {
          const resendKey = process.env.RESEND_API_KEY;
          if (resendKey) {
            const resend = new Resend(resendKey);
            await resend.emails.send({
              from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
              to: emails,
              subject: emailSubject,
              html: buildSaleEmailHtml(data),
            });
            console.log(`[sale-notification] Email sent to ${emails.join(', ')}`);
          }
        } catch (err) {
          console.error('[sale-notification] Email error:', err);
        }
      }
    }

    // --- WhatsApp notification ---
    const waEnabled = getConfig('deal_won_whatsapp_enabled', 'true') === 'true';
    const waPhone = getConfig('deal_won_whatsapp_phone', '5551937111140');
    const waFormat = getConfig('deal_won_whatsapp_format', '🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}');

    if (waEnabled && waPhone) {
      try {
        const { EvolutionApiClient } = await import('./evolutionApiClient');
        const client = await EvolutionApiClient.fromConfig();

        let connected = false;
        try {
          const status = await client.getInstanceStatus();
          const state = (status as any)?.instance?.state || (status as any)?.state;
          connected = state === 'open' || state === 'connected';
        } catch { connected = false; }

        if (connected) {
          const message = waFormat
            .replace(/\{\{valor\}\}/gi, data.monthlyValue ? data.monthlyValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00')
            .replace(/\{\{produto\}\}/gi, data.productName || 'N/A')
            .replace(/\{\{cliente\}\}/gi, data.clientName || 'Cliente');

          await client.sendText(waPhone, message);
          console.log(`[sale-notification] WhatsApp sent to ${waPhone}`);
        } else {
          console.warn('[sale-notification] WhatsApp not connected');
        }
      } catch (err) {
        console.error('[sale-notification] WhatsApp error:', err);
      }
    }
  } catch (err) {
    console.error('[sale-notification] Error sending notifications:', err);
  }
}

function buildSaleEmailHtml(data: SaleNotificationData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10B981, #059669); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Nova Venda!</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Negociação</td>
            <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${data.dealTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Cliente</td>
            <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${data.clientName}</td>
          </tr>
          ${data.productName ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Produto</td>
            <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${data.productName}</td>
          </tr>` : ''}
          ${data.monthlyValue ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Valor Mensal</td>
            <td style="padding: 8px 0; font-weight: bold; font-size: 14px; color: #059669;">R$ ${data.monthlyValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          </tr>` : ''}
        </table>
        <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">Enviado pelo CRM BGPGO</p>
      </div>
    </div>
  `;
}
