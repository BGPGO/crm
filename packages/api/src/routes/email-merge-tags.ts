import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { supabase } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';
import {
  AVAILABLE_MERGE_TAGS,
  buildExampleData,
  buildPersonalizationData,
  personalizeContent,
} from '../services/personalize';

const router = Router();

// ─── Upload de imagem pro corpo do email ─────────────────────────────────────
//
// Gmail/Outlook bloqueiam imagens em data-URL base64, então o editor precisa de
// uma URL pública. Sobe pro bucket `email-assets` (mesmo dos assets do wrapper
// de marca, ver seeds/uploadEmailAssets.ts) e devolve a URL.

const EMAIL_ASSETS_BUCKET = 'email-assets';

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
});

let bucketEnsured = false;
async function ensureEmailAssetsBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { data } = await supabase.storage.getBucket(EMAIL_ASSETS_BUCKET);
  if (data) {
    if (!data.public) {
      await supabase.storage.updateBucket(EMAIL_ASSETS_BUCKET, { public: true });
    }
  } else {
    const { error } = await supabase.storage.createBucket(EMAIL_ASSETS_BUCKET, { public: true });
    // corrida entre requests: se outro criou primeiro, segue
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Falha ao criar bucket ${EMAIL_ASSETS_BUCKET}: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
}

// POST /api/email/upload-image — campo "file"; devolve { data: { url } }
router.post('/upload-image', imageUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined;
    if (!file) return next(createError('Arquivo é obrigatório (campo "file")', 400));
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return next(createError('Formato não suportado — use JPEG, PNG, GIF ou WebP', 400));
    }

    await ensureEmailAssetsBucket();
    const remotePath = `uploads/${Date.now()}-${sanitizeFileName(file.originalname) || 'imagem'}`;
    const { error: uploadErr } = await supabase.storage
      .from(EMAIL_ASSETS_BUCKET)
      .upload(remotePath, file.buffer, { contentType: file.mimetype, upsert: false, cacheControl: '31536000' });
    if (uploadErr) {
      return next(createError(`Falha ao subir para o Storage: ${uploadErr.message}`, 502));
    }
    const { data: pub } = supabase.storage.from(EMAIL_ASSETS_BUCKET).getPublicUrl(remotePath);

    res.json({ data: { url: pub.publicUrl } });
  } catch (err) {
    next(err);
  }
});

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
