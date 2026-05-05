import { Router, Request, Response, NextFunction } from 'express';
import { generateEmail, improveEmail } from '../services/aiEmailGenerator';
import { createError } from '../middleware/errorHandler';

const router = Router();

// POST /api/ai-email/generate-email
router.post('/generate-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { topic, tone, audience, language } = req.body;

    if (!topic) {
      return next(createError('topic is required', 400));
    }

    const result = await generateEmail({ topic, tone, audience, language, brand: req.brand });

    res.json({ data: { subject: result.subject, htmlContent: result.htmlContent } });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai-email/improve-email
router.post('/improve-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { htmlContent, instruction } = req.body;

    if (!htmlContent) {
      return next(createError('htmlContent is required', 400));
    }

    if (!instruction) {
      return next(createError('instruction is required', 400));
    }

    const result = await improveEmail({ htmlContent, instruction, brand: req.brand });

    res.json({ data: { htmlContent: result.htmlContent } });
  } catch (err) {
    next(err);
  }
});

export default router;
