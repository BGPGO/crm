import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';
import { EvolutionApiClient } from '../services/evolutionApiClient';
import { sendDailyReport } from '../services/dailyReportService';

const router = Router();

const DEFAULTS: Record<string, string> = {
  deal_won_enabled: 'true',
  deal_won_emails: 'fernanda@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br',
  deal_won_subject: 'Contrato Assinado — {{cliente}}',
  lead_created_enabled: 'true',
  lead_created_emails: 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br,joao.lopes@bertuzzipatrimonial.com.br',
  lead_created_subject: 'Novo Lead — {{nome}}',
  daily_report_enabled: 'true',
  daily_report_emails: 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br,joao.lopes@bertuzzipatrimonial.com.br',
};

// GET /api/notification-config — Get all notification settings
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.notificationConfig.findMany();

    // Merge with defaults
    const result: Record<string, string> = { ...DEFAULTS };
    for (const c of configs) {
      result[c.key] = c.value;
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PUT /api/notification-config — Update notification settings (batch)
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updates = req.body as Record<string, string>;

    for (const [key, value] of Object.entries(updates)) {
      await prisma.notificationConfig.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }

    // Return updated config
    const configs = await prisma.notificationConfig.findMany();
    const result: Record<string, string> = { ...DEFAULTS };
    for (const c of configs) {
      result[c.key] = c.value;
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/notification-config/test-email — Send test email
router.post('/test-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const c of configs) map[c.key] = c.value;

    const emails = (map.deal_won_emails || '').split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return next({ status: 400, message: 'Nenhum email configurado' });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return next({ status: 400, message: 'RESEND_API_KEY não configurado' });

    const subject = (map.deal_won_subject || 'Contrato Assinado — {{cliente}}').replace('{{cliente}}', 'Cliente Teste');
    const resend = new Resend(resendKey);

    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject: `[TESTE] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f59e0b; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Teste de Notificação</h1>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; color: #374151;">Este é um email de teste do sistema de notificação de venda fechada.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280; width: 140px;">Negociação</td>
                <td style="padding: 8px 0; color: #111827;">Deal de Teste</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Cliente</td>
                <td style="padding: 8px 0; color: #111827;">Cliente Teste</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Produto</td>
                <td style="padding: 8px 0; color: #111827;">BGP GO I</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Mensal</td>
                <td style="padding: 8px 0; font-weight: bold; color: #059669;">R$ 1.997,00</td>
              </tr>
            </table>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 16px;">Este é apenas um teste. Nenhuma venda foi realizada.</p>
          </div>
        </div>
      `,
    });

    res.json({ success: true, sentTo: emails });
  } catch (err) {
    next(err);
  }
});

// POST /api/notification-config/test-whatsapp — Send test WhatsApp
router.post('/test-whatsapp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phoneConfig = await prisma.notificationConfig.findUnique({ where: { key: 'deal_won_whatsapp_phone' } });
    const phone = phoneConfig?.value || '5551937111140';

    const client = await EvolutionApiClient.fromConfig();

    // Check connection
    let connected = false;
    try {
      const status = await client.getInstanceStatus();
      const state = (status as any)?.instance?.state || (status as any)?.state;
      connected = state === 'open' || state === 'connected';
    } catch { connected = false; }

    if (!connected) {
      return res.status(400).json({ error: 'WhatsApp não conectado. Conecte o número primeiro.' });
    }

    const formatConfig = await prisma.notificationConfig.findUnique({ where: { key: 'deal_won_whatsapp_format' } });
    const format = formatConfig?.value || '🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}';
    const msg = '[TESTE] ' + format
      .replace(/\{\{valor\}\}/gi, '1.997,00')
      .replace(/\{\{produto\}\}/gi, 'BGP GO I')
      .replace(/\{\{cliente\}\}/gi, 'Cliente Teste');
    await client.sendText(phone, msg);

    // Registrar no volume diário (testes também contam para proteção anti-ban)
    const { registerSent } = await import('../services/dailyLimitService');
    await registerSent('reminder').catch(() => {});

    res.json({ success: true, sentTo: phone });
  } catch (err) {
    next(err);
  }
});

// POST /api/notification-config/test-lead-email — Send test lead notification
router.post('/test-lead-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.notificationConfig.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const c of configs) map[c.key] = c.value;

    const emails = (map.lead_created_emails || '').split(',').map(e => e.trim()).filter(Boolean);
    if (emails.length === 0) return next({ status: 400, message: 'Nenhum email configurado' });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return next({ status: 400, message: 'RESEND_API_KEY não configurado' });

    const subject = (map.lead_created_subject || 'Novo Lead — {{nome}}').replace('{{nome}}', 'Lead Teste');
    const resend = new Resend(resendKey);

    await resend.emails.send({
      from: 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>',
      to: emails,
      subject: `[TESTE] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #3B82F6, #2563EB); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Novo Lead!</h1>
          </div>
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Nome</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">Lead Teste</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">teste@exemplo.com</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Telefone</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">+55 11 99999-0000</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Origem</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">Facebook Ads</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Campanha</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">AZ|BI|CADASTRO|Teste</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Link UTM</td><td style="padding: 8px 0; font-size: 14px;"><a href="#" style="color: #2563eb;">https://lp.bertuzzipatrimonial.com.br/teste?utm_source=Facebook</a></td></tr>
            </table>
            <p style="margin-top: 16px; font-size: 12px; color: #9ca3af;">Este é apenas um teste. Nenhum lead real foi criado.</p>
          </div>
        </div>
      `,
    });

    res.json({ success: true, sentTo: emails });
  } catch (err) {
    next(err);
  }
});

// POST /api/notification-config/send-daily-report — Send daily report now (manual trigger)
router.post('/send-daily-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await sendDailyReport();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
