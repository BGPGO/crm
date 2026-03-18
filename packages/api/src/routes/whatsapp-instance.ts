import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { EvolutionApiClient } from '../services/evolutionApiClient';

const router = Router();

// POST /api/whatsapp/instance/create — Create Evolution API instance
router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await EvolutionApiClient.fromConfig();
    const result = await client.createInstance();

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-instance/connect — Get QR code for connection
router.get('/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await EvolutionApiClient.fromConfig();
    const result = await client.connectInstance();

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/whatsapp-instance/status — Get connection status
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await EvolutionApiClient.fromConfig();
    const result = await client.getInstanceStatus();

    // Sync connection status to DB so it stays up-to-date
    const state = result?.instance?.state || 'unknown';
    const stateLC = state.toLowerCase();
    let mappedStatus: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
    if (stateLC === 'open' || stateLC === 'connected') {
      mappedStatus = 'CONNECTED';
    } else if (stateLC === 'connecting' || stateLC === 'pairing') {
      mappedStatus = 'CONNECTING';
    } else {
      mappedStatus = 'DISCONNECTED';
    }

    const config = await prisma.whatsAppConfig.findFirst();
    if (config) {
      await prisma.whatsAppConfig.update({
        where: { id: config.id },
        data: { connectionStatus: mappedStatus },
      });
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/whatsapp-instance/logout — Disconnect WhatsApp
router.delete('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await EvolutionApiClient.fromConfig();
    const result = await client.logoutInstance();

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/whatsapp-instance/delete — Delete instance
router.delete('/delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await EvolutionApiClient.fromConfig();
    const result = await client.deleteInstance();

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp/instance/webhook/setup — Configure webhook URL on Evolution API
router.post('/webhook/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.whatsAppConfig.findFirst();
    const baseUrl = config?.baseUrl || process.env.BASE_URL || 'http://localhost:3001';
    const webhookUrl = req.body.webhookUrl || `${baseUrl}/api/whatsapp/webhook`;

    const client = await EvolutionApiClient.fromConfig();
    const result = await client.setWebhook(webhookUrl);

    res.json({ data: { webhookUrl, result } });
  } catch (err) {
    next(err);
  }
});

export default router;
