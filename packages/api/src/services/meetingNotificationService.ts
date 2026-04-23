import prisma from '../lib/prisma';
import { Resend } from 'resend';

type MeetingSourceEnum = 'CALENDLY_EMAIL' | 'CALENDLY_LP' | 'SDR_IA' | 'HUMANO';

const MEETING_SOURCE_LABELS: Record<MeetingSourceEnum, string> = {
  CALENDLY_EMAIL: 'Email marketing',
  CALENDLY_LP:    'Direto (landing page)',
  SDR_IA:         'BIA (WhatsApp)',
  HUMANO:         'Atendimento humano',
};

const MEETING_SOURCE_COLORS: Record<MeetingSourceEnum, { bg: string; text: string; border: string }> = {
  CALENDLY_EMAIL: { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' }, // azul
  CALENDLY_LP:    { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }, // cinza
  SDR_IA:         { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' }, // verde
  HUMANO:         { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' }, // laranja
};

function formatMeetingSource(source: MeetingSourceEnum | null | undefined): string {
  if (!source) return 'Origem não identificada';
  return MEETING_SOURCE_LABELS[source] ?? 'Origem não identificada';
}

function renderMeetingSourceBadge(source?: MeetingSourceEnum | null): string {
  if (!source) return '—';
  const label = MEETING_SOURCE_LABELS[source];
  const colors = MEETING_SOURCE_COLORS[source];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${colors.bg};color:${colors.text};border:1px solid ${colors.border};">${label}</span>`;
}

interface MeetingNotificationData {
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  eventType: string;
  startTime: string;
  hostName?: string | null;
  dealId?: string | null;
  utmUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  meetingSource?: MeetingSourceEnum | null;
}

export async function sendMeetingNotifications(data: MeetingNotificationData): Promise<void> {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.key, c.value]));
    const getConfig = (key: string, defaultValue: string) => configMap.get(key) || defaultValue;

    const enabled = getConfig('meeting_booked_enabled', 'true') === 'true';
    const recipients = getConfig('meeting_booked_emails', 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br');
    const subject = getConfig('meeting_booked_subject', 'Reunião Agendada — {{nome}}')
      .replace(/\{\{nome\}\}/gi, data.contactName || 'Sem nome');

    if (!enabled) {
      console.warn('[meeting-notification] SKIP: meeting_booked_enabled está desativado');
      return;
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) {
      console.warn('[meeting-notification] SKIP: nenhum email destinatário configurado');
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[meeting-notification] SKIP: RESEND_API_KEY não configurado');
      return;
    }

    console.log(`[meeting-notification] Enviando para ${emails.join(', ')} — ${data.contactName} agendou ${data.eventType}`);

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject,
      html: buildMeetingEmailHtml(data),
    });

    console.log(`[meeting-notification] Email sent to ${emails.join(', ')}`);
  } catch (err) {
    console.error('[meeting-notification] Error:', err);
  }
}

function buildMeetingEmailHtml(data: MeetingNotificationData): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const row = (label: string, value: string | null | undefined) =>
    value ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">${esc(label)}</td><td style="padding:8px 0;font-weight:bold;font-size:14px;">${esc(value)}</td></tr>` : '';

  let formattedDate = '';
  if (data.startTime) {
    try {
      const d = new Date(data.startTime);
      formattedDate = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long', timeStyle: 'short' });
    } catch {
      formattedDate = data.startTime;
    }
  }

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#10B981,#059669);padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:white;margin:0;font-size:24px;">Reunião Agendada!</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;">
          ${row('Nome', data.contactName)}
          ${row('Email', data.contactEmail)}
          ${row('Telefone', data.contactPhone)}
          ${row('Tipo', data.eventType)}
          ${row('Data/Hora', formattedDate)}
          <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">🎯 Origem</td><td style="padding:8px 0;">${renderMeetingSourceBadge(data.meetingSource)}</td></tr>
          ${row('Closer', data.hostName)}
          ${row('UTM Source', data.utmSource)}
          ${row('UTM Medium', data.utmMedium)}
          ${row('UTM Campaign', data.utmCampaign)}
          ${data.utmUrl ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Landing Page</td><td style="padding:8px 0;font-size:14px;"><a href="${esc(data.utmUrl)}" style="color:#2563eb;word-break:break-all;">${esc(data.utmUrl.length > 80 ? data.utmUrl.slice(0, 80) + '...' : data.utmUrl)}</a></td></tr>` : ''}
        </table>
        <p style="margin-top:16px;font-size:12px;color:#9ca3af;">Enviado pelo CRM BGPGO</p>
      </div>
    </div>`;
}
