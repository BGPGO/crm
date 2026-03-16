import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { getAIResponse } from '../services/whatsappBot';

const router = Router();

// POST /api/whatsapp/test-chat — Send a message to the AI bot and get a reply
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, history } = req.body as {
      message: string;
      history: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ message: 'Campo "message" é obrigatório.' });
      return;
    }

    // Read config for meetingLink
    const config = await prisma.whatsAppConfig.findFirst();
    const meetingLink = config?.meetingLink || null;

    // Sanitize history: only allow valid roles and non-empty content
    const validRoles = new Set(['user', 'assistant']);
    const sanitizedHistory = (Array.isArray(history) ? history : []).filter(
      (h) => h && validRoles.has(h.role) && typeof h.content === 'string' && h.content.trim().length > 0,
    );

    // Build history with current message
    const chatHistory = [
      ...sanitizedHistory,
      { role: 'user' as const, content: message },
    ];

    const reply = await getAIResponse(chatHistory, 'Usuário Teste', meetingLink);

    res.json({ data: { reply } });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp/test-chat/simulate-lead — Simulate a lead entry with campaign context
router.post('/simulate-lead', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { contactName, campaignName, sourceName } = req.body;

    if (!contactName) {
      return res.status(400).json({ error: 'contactName é obrigatório' });
    }

    const { simulateLeadEntry } = await import('../services/leadQualificationEngine');
    const result = await simulateLeadEntry({
      contactName,
      campaignName: campaignName || undefined,
      sourceName: sourceName || undefined,
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;

