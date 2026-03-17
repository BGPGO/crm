import { Router } from 'express';
import { handleAutentiqueWebhook } from '../services/contractWebhookHandler';

const router = Router();

// POST /api/contracts/webhook/autentique — Autentique signature webhook (PUBLIC)
// This is a legacy endpoint — the preferred URL is /api/webhooks/incoming/:id
router.post('/autentique', handleAutentiqueWebhook);

export default router;
