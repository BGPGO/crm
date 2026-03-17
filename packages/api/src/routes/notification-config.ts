import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { Resend } from 'resend';
import { EvolutionApiClient } from '../services/evolutionApiClient';

const router = Router();

const DEFAULTS: Record<string, string> = {
  deal_won_enabled: 'true',
  deal_won_emails: 'fernanda@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br',
  deal_won_subject: 'Contrato Assinado — {{cliente}}',
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

    res.json({ success: true, sentTo: phone });
  } catch (err) {
    next(err);
  }
});

export default router;
