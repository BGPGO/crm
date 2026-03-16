import { Router, Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { EvolutionApiClient } from '../services/evolutionApiClient';

const router = Router();

// POST /api/whatsapp-instance/create — Create Evolution API instance
router.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { instanceName } = req.body;
    if (!instanceName) return next(createError('instanceName is required', 400));

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

// POST /api/whatsapp-instance/webhook/setup — Configure webhook URL on Evolution API
router.post('/webhook/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl) return next(createError('webhookUrl is required', 400));

    const client = await EvolutionApiClient.fromConfig();
    const result = await client.setWebhook(webhookUrl);

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
