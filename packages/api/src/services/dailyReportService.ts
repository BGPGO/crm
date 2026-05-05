import { Resend } from 'resend';
import prisma from '../lib/prisma';
import { buildDailyReportHtml } from './dailyReport';

const PIPELINE_ID = '64fb7516ea4eb400219457de';
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

export interface SendDailyReportOptions {
  /** Override de destinatários — útil pra disparos manuais de teste. */
  recipients?: string[];
  /** Subject prefix opcional (ex: "[TESTE] "). */
  subjectPrefix?: string;
  /** Override de data de referência (formato YYYY-MM-DD em BRT) pra disparos de teste. */
  referenceDate?: string;
}

function startOfDayBRT(year: number, monthIndex: number, day: number): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(Date.UTC(year, monthIndex, day) - BRT_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return { dayStart, dayEnd };
}

function startOfYesterdayBRT(now = new Date()): { dayStart: Date; dayEnd: Date } {
  const brtNow = new Date(now.getTime() + BRT_OFFSET_MS);
  return startOfDayBRT(
    brtNow.getUTCFullYear(),
    brtNow.getUTCMonth(),
    brtNow.getUTCDate() - 1,
  );
}

/**
 * Resumo enxuto pra montar o subject — 3 queries paralelas, ~5ms.
 */
async function buildSubjectSummary(window: { dayStart: Date; dayEnd: Date }): Promise<{
  leads: number;
  meetings: number;
  wonCount: number;
  wonValue: number;
}> {
  const { dayStart, dayEnd } = window;
  const [leads, meetings, wonDeals] = await Promise.all([
    prisma.deal.count({
      // Daily report é BGP-only (multi-brand pending)
      where: { pipelineId: PIPELINE_ID, brand: 'BGP', createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.calendlyEvent.count({
      where: { createdAt: { gte: dayStart, lt: dayEnd }, status: 'active' },
    }),
    prisma.deal.findMany({
      // Daily report é BGP-only (multi-brand pending)
      where: { pipelineId: PIPELINE_ID, brand: 'BGP', status: 'WON', closedAt: { gte: dayStart, lt: dayEnd } },
      select: { value: true },
    }),
  ]);
  const wonValue = wonDeals.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0);
  return { leads, meetings, wonCount: wonDeals.length, wonValue };
}

export async function sendDailyReport(options: SendDailyReportOptions = {}): Promise<void> {
  try {
    let emails: string[];
    if (options.recipients && options.recipients.length > 0) {
      emails = options.recipients.map(e => e.trim()).filter(Boolean);
    } else {
      const configs = await prisma.notificationConfig.findMany();
      const configMap = new Map(configs.map(c => [c.key, c.value]));
      const getConfig = (key: string, def: string) => configMap.get(key) || def;

      const enabled = getConfig('daily_report_enabled', 'true') === 'true';
      const recipients = getConfig('daily_report_emails', 'vitor@bertuzzipatrimonial.com.br,oliver@bertuzzipatrimonial.com.br');

      if (!enabled || !recipients) {
        console.log('[daily-report] Disabled or no recipients');
        return;
      }

      emails = recipients.split(',').map(e => e.trim()).filter(Boolean);
    }
    if (emails.length === 0) return;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[daily-report] RESEND_API_KEY not set');
      return;
    }

    // Resolve referenceDate (override de teste) ou usa "ontem em BRT"
    let refDate: Date | undefined;
    let window: { dayStart: Date; dayEnd: Date };
    if (options.referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(options.referenceDate)) {
      const [y, m, d] = options.referenceDate.split('-').map(Number);
      window = startOfDayBRT(y, m - 1, d);
      refDate = window.dayStart;
    } else {
      window = startOfYesterdayBRT();
    }

    console.log('[daily-report] Building report for', window.dayStart.toISOString());
    const [html, summary] = await Promise.all([
      buildDailyReportHtml(refDate),
      buildSubjectSummary(window),
    ]);

    // Subject dinâmico — destaca o que realmente importa pro time
    const subjectDate = window.dayStart.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
    });

    const parts: string[] = [];
    parts.push(`${summary.leads} lead${summary.leads === 1 ? '' : 's'}`);
    parts.push(`${summary.meetings} reuni${summary.meetings === 1 ? 'ão' : 'ões'}`);
    if (summary.wonCount > 0) {
      const valueBRL = summary.wonValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      });
      parts.push(`${summary.wonCount} venda${summary.wonCount === 1 ? '' : 's'} (${valueBRL})`);
    }

    const subject = `${options.subjectPrefix ?? ''}Funil ${subjectDate} · ${parts.join(' · ')}`;

    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject,
      html,
    });

    console.log(`[daily-report] Sent to ${emails.join(', ')}`);
  } catch (err) {
    console.error('[daily-report] Error:', err);
  }
}

// Reexport pra compatibilidade com cron existente
export { sendDailyReport as startDailyReport };
