import prisma from '../lib/prisma';
import { Resend } from 'resend';
interface LeadNotificationData {
  dealId: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  sourceName?: string | null;
  campaignName?: string | null;
  utmUrl?: string | null;
}

export async function sendLeadNotifications(data: LeadNotificationData): Promise<void> {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.key, c.value]));
    const getConfig = (key: string, defaultValue: string) => configMap.get(key) || defaultValue;

    const enabled = getConfig('lead_created_enabled', 'true') === 'true';
    const recipients = getConfig('lead_created_emails', 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br,joao.lopes@bertuzzipatrimonial.com.br');
    const subject = getConfig('lead_created_subject', 'Novo Lead — {{nome}}')
      .replace(/\{\{nome\}\}/gi, data.contactName || 'Sem nome');

    if (!enabled) {
      console.warn('[lead-notification] SKIP: lead_created_enabled está desativado no banco');
      return;
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      console.warn('[lead-notification] SKIP: nenhum email destinatário configurado');
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[lead-notification] SKIP: RESEND_API_KEY não configurado');
      return;
    }

    console.log(`[lead-notification] Enviando para ${emails.join(', ')} — lead: ${data.contactName}`);

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject,
      html: buildLeadEmailHtml(data),
    });

    console.log(`[lead-notification] Email sent to ${emails.join(', ')} — lead: ${data.contactName}`);
  } catch (err) {
    console.error('[lead-notification] Error:', err);
  }
}

function buildLeadEmailHtml(data: LeadNotificationData): string {
  const rows: string[] = [];

  rows.push(row('Nome', data.contactName));
  if (data.contactEmail) rows.push(row('Email', data.contactEmail));
  if (data.contactPhone) rows.push(row('Telefone', data.contactPhone));
  if (data.sourceName) rows.push(row('Origem', data.sourceName));
  if (data.campaignName) rows.push(row('Campanha', data.campaignName));

  if (data.utmUrl) {
    rows.push(`
      <tr>
        <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Link UTM</td>
        <td style="padding: 8px 0; font-size: 14px;">
          <a href="${escapeHtml(data.utmUrl)}" style="color: #2563eb; word-break: break-all;">${escapeHtml(truncate(data.utmUrl, 80))}</a>
        </td>
      </tr>`);
  }

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3B82F6, #2563EB); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Novo Lead!</h1>
      </div>
      <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <table style="width: 100%; border-collapse: collapse;">
          ${rows.join('')}
        </table>
        <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">Enviado pelo CRM BGPGO</p>
      </div>
    </div>
  `;
}

function row(label: string, value: string): string {
  return `
    <tr>
      <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">${escapeHtml(label)}</td>
      <td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${escapeHtml(value)}</td>
    </tr>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

