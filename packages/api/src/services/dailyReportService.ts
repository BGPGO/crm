import { Resend } from 'resend';
import prisma from '../lib/prisma';
import { buildDailyReportHtml } from './dailyReport';

export async function sendDailyReport(): Promise<void> {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const configMap = new Map(configs.map(c => [c.key, c.value]));
    const getConfig = (key: string, def: string) => configMap.get(key) || def;

    const enabled = getConfig('daily_report_enabled', 'true') === 'true';
    const recipients = getConfig('daily_report_emails', 'vitor@bertuzzipatrimonial.com.br,oliver@bertuzzipatrimonial.com.br');

    if (!enabled || !recipients) {
      console.log('[daily-report] Disabled or no recipients');
      return;
    }

    const emails = recipients.split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[daily-report] RESEND_API_KEY not set');
      return;
    }

    console.log('[daily-report] Building report...');
    const html = await buildDailyReportHtml();

    // Subject: "Relatório Diário do Funil — DD/MM"
    const yesterday = new Date(Date.now() - 86400000);
    const subjectDate = yesterday.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo'
    });

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject: `Relatório Diário do Funil — ${subjectDate}`,
      html,
    });

    console.log(`[daily-report] Sent to ${emails.join(', ')}`);
  } catch (err) {
    console.error('[daily-report] Error:', err);
  }
}

// Reexport pra compatibilidade com cron existente
export { sendDailyReport as startDailyReport };
