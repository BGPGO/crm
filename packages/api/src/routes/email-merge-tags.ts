import { Router, Request, Response, NextFunction } from 'express';
import {
  AVAILABLE_MERGE_TAGS,
  buildExampleData,
  buildPersonalizationData,
  personalizeContent,
} from '../services/personalize';

const router = Router();

// GET /api/email/merge-tags — lista as variáveis disponíveis pro editor
router.get('/merge-tags', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ data: AVAILABLE_MERGE_TAGS });
  } catch (err) {
    next(err);
  }
});

// POST /api/email/preview — renderiza html+subject com dados do contato real
// (ou com exemplos da lista, se contactId não vier).
router.post('/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { html, subject, contactId } = req.body as {
      html?: string;
      subject?: string;
      contactId?: string | null;
    };

    const data = contactId
      ? await buildPersonalizationData({ contactId })
      : buildExampleData();

    res.json({
      html: html ? personalizeContent(html, data) : '',
      subject: subject ? personalizeContent(subject, data) : '',
      data,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
