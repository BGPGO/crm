import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

const DEFAULT_STEPS = [
  { minutesBefore: 240, enabled: true, message: 'Olá {{nome}}! 👋\n\nLembrete: sua reunião está marcada para *{{data}}* às *{{hora}}* (faltam {{falta}}).\n\nTe esperamos lá! Qualquer dúvida, é só responder aqui.' },
  { minutesBefore: 120, enabled: true, message: 'Olá {{nome}}! Só passando pra lembrar da sua reunião hoje às *{{hora}}* (faltam {{falta}}).\n\nNos vemos em breve! 😊' },
  { minutesBefore: 60, enabled: true, message: '{{nome}}, sua reunião começa em *{{falta}}*, às *{{hora}}*.\n\nTe esperamos! 🕐' },
  { minutesBefore: 30, enabled: true, message: '{{nome}}, faltam *{{falta}}* pra sua reunião das *{{hora}}*!\n\nJá tá quase 😊' },
  { minutesBefore: 15, enabled: true, message: '{{nome}}, sua reunião começa em *{{falta}}*! Tá tudo certo por aí? 🚀' },
];

// GET /api/meeting-reminders — List all steps (creates defaults if empty)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let steps = await prisma.meetingReminderStep.findMany({
      orderBy: { minutesBefore: 'desc' },
    });

    // Seed defaults if empty
    if (steps.length === 0) {
      await prisma.meetingReminderStep.createMany({ data: DEFAULT_STEPS });
      steps = await prisma.meetingReminderStep.findMany({
        orderBy: { minutesBefore: 'desc' },
      });
    }

    res.json({ data: steps });
  } catch (err) {
    next(err);
  }
});

// PUT /api/meeting-reminders/:id — Update a step
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled, message } = req.body;
    const data: Record<string, unknown> = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (message !== undefined) data.message = message;

    const step = await prisma.meetingReminderStep.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: step });
  } catch (err) {
    next(err);
  }
});

export default router;
