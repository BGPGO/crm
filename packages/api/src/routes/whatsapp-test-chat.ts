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

    // Build history with current message
    const chatHistory = [
      ...(Array.isArray(history) ? history : []),
      { role: 'user' as const, content: message },
    ];

    const reply = await getAIResponse(chatHistory, 'Usuário Teste', meetingLink);

    res.json({ data: { reply } });
  } catch (err) {
    next(err);
  }
});

export default router;
