/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Templates — WhatsApp Cloud API (API Oficial da Meta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRUD de templates com sincronização com a Meta (submit/approval/delete).
 *
 *   Z-API legado:   /api/whatsapp/message-templates  (templates locais, sem aprovação)
 *   Cloud API:      /api/whatsapp/cloud/templates     ← ESTE ARQUIVO
 *
 * Funcionalidades:
 *   - Criar template e submeter para aprovação da Meta
 *   - Listar templates com status de aprovação
 *   - Sincronizar status da Meta para o banco local
 *   - Editar template (max 10 edições/30 dias para APPROVED)
 *   - Deletar template (remove da Meta + banco local)
 *
 * Referência: crm/WHATSAPP-CLOUD-API-REFERENCE.md (seção 4)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import multer from 'multer';
import prisma from '../lib/prisma';
import { supabase } from '../lib/supabase';
import { createError } from '../middleware/errorHandler';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';
import { extractHeaderContent, resolveSyncedHeaderContent } from '../utils/templateHeaderBuilder';

const router = Router();

// ─── Upload de mídia de header (IMAGE/VIDEO/DOCUMENT) ───────────────────────
//
// Templates com header de mídia precisam de DUAS coisas:
//   1. `header_handle` (Resumable Upload API) — exigido pela Meta na CRIAÇÃO/aprovação
//   2. URL pública (Supabase Storage)         — usada no ENVIO (image/video.link);
//      a URL scontent.whatsapp.net da Meta NÃO serve (incidente GOBI 2026-05-21, erro 131053)

const MEDIA_BUCKET = 'wa-media';

// Limites da Cloud API por tipo de mídia
const MEDIA_RULES: Array<{ mimes: string[]; maxBytes: number; label: string }> = [
  { mimes: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024, label: 'imagem (JPEG/PNG, máx 5MB)' },
  { mimes: ['video/mp4', 'video/3gpp'], maxBytes: 16 * 1024 * 1024, label: 'vídeo (MP4/3GP, máx 16MB)' },
  { mimes: ['application/pdf'], maxBytes: 100 * 1024 * 1024, label: 'documento (PDF, máx 100MB)' },
];

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

let bucketEnsured = false;
async function ensureMediaBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { data } = await supabase.storage.getBucket(MEDIA_BUCKET);
  if (data) {
    if (!data.public) {
      await supabase.storage.updateBucket(MEDIA_BUCKET, { public: true });
    }
  } else {
    const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
    // corrida entre requests: se outro criou primeiro, segue
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Falha ao criar bucket ${MEDIA_BUCKET}: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);
}

/**
 * Fallback: baixa a mídia de uma URL pública e sobe pra Meta via Resumable Upload,
 * devolvendo o header_handle. Usado quando o frontend só mandou URL (sem upload de arquivo).
 */
async function fetchHandleFromUrl(client: WhatsAppCloudClient, url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: 100 * 1024 * 1024,
    });
    const buffer = Buffer.from(res.data);
    const mimeType = (res.headers['content-type'] || 'application/octet-stream').split(';')[0];
    const fileName = sanitizeFileName(url.split('/').pop() || 'media') || 'media';
    return await client.uploadTemplateExampleMedia(buffer, mimeType, fileName);
  } catch (err: any) {
    console.warn('[cloud-templates] Fallback header_handle via URL falhou:', err.message);
    return null;
  }
}

/**
 * Núcleo do upload duplo: Supabase Storage (URL pública pro ENVIO) +
 * Meta Resumable Upload (header_handle pra CRIAÇÃO do template).
 * Usado pelo /upload-media e pelo /compress-video.
 */
async function uploadMediaCore(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<{ publicUrl: string; headerHandle: string | null; warning: string | null }> {
  // 1. Supabase Storage → URL pública (usada no envio)
  await ensureMediaBucket();
  const remotePath = `templates/${Date.now()}-${sanitizeFileName(originalName)}`;
  const { error: uploadErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(remotePath, buffer, { contentType: mimeType, upsert: false });
  if (uploadErr) {
    throw createError(`Falha ao subir para o Storage: ${uploadErr.message}`, 502);
  }
  const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(remotePath);

  // 2. Meta Resumable Upload → header_handle (usado na criação do template)
  let headerHandle: string | null = null;
  let warning: string | null = null;
  try {
    const client = await WhatsAppCloudClient.fromDB();
    headerHandle = await client.uploadTemplateExampleMedia(buffer, mimeType, sanitizeFileName(originalName));
  } catch (err: any) {
    warning = `Mídia salva, mas o upload de exemplo pra Meta falhou: ${err.message}`;
    console.error('[cloud-templates] resumable upload falhou:', err.message);
  }

  return { publicUrl: pub.publicUrl, headerHandle, warning };
}

// POST /api/whatsapp/cloud/templates/upload-media
router.post('/upload-media', mediaUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined;
    if (!file) return next(createError('Arquivo é obrigatório (campo "file")', 400));

    const rule = MEDIA_RULES.find((r) => r.mimes.includes(file.mimetype));
    if (!rule) {
      return next(createError(
        `Tipo de arquivo não suportado (${file.mimetype}). Aceitos: JPEG/PNG, MP4/3GP ou PDF.`,
        400
      ));
    }
    if (file.size > rule.maxBytes) {
      return next(createError(`Arquivo excede o limite de ${rule.label}.`, 400));
    }

    const { publicUrl, headerHandle, warning } = await uploadMediaCore(file.buffer, file.mimetype, file.originalname);

    res.json({
      data: {
        publicUrl,
        headerHandle,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size,
        warning,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/whatsapp/cloud/templates/compress-video
//
// Recebe um vídeo grande demais (>16MB) ou em formato não aceito pelo WhatsApp
// (.mov de iPhone, .webm...), comprime/converte pra MP4 H.264 dentro do limite
// e já faz o upload duplo. Resposta inclui tamanhos pra UI mostrar o antes/depois.
const VIDEO_LIMIT_BYTES = 16 * 1024 * 1024;

const compressUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // entrada generosa; a saída é que precisa caber em 16MB
});

router.post('/compress-video', compressUpload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined;
    if (!file) return next(createError('Arquivo é obrigatório (campo "file")', 400));
    if (!file.mimetype.startsWith('video/')) {
      return next(createError(`Este endpoint só aceita vídeo (recebi ${file.mimetype}).`, 400));
    }

    console.log(`[cloud-templates] compress-video: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    const { compressVideoToLimit } = await import('../utils/videoCompressor');
    const result = await compressVideoToLimit(file.buffer, VIDEO_LIMIT_BYTES);
    console.log(
      `[cloud-templates] compress-video: ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(result.buffer.length / 1024 / 1024).toFixed(1)}MB ` +
      `(${result.videoKbps}kbps, ${result.attempts} tentativa(s)${result.targetHeight ? `, ${result.targetHeight}p` : ''})`
    );

    const outName = sanitizeFileName(file.originalname).replace(/\.[^.]*$/, '') + '.mp4';
    const { publicUrl, headerHandle, warning } = await uploadMediaCore(result.buffer, 'video/mp4', outName);

    res.json({
      data: {
        publicUrl,
        headerHandle,
        mimeType: 'video/mp4',
        fileName: outName,
        originalSize: file.size,
        compressedSize: result.buffer.length,
        warning,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/whatsapp/cloud/templates — Listar templates ───────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, category, search } = req.query;
    const where: Record<string, any> = {};

    if (status) where.status = status as string;
    if (category) where.category = category as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { body: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const data = await prisma.cloudWaTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/whatsapp/cloud/templates/:id — Template individual ────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await prisma.cloudWaTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!template) return next(createError('Template não encontrado', 404));
    res.json({ data: template });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/cloud/templates — Criar e submeter à Meta ───────────

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      language = 'pt_BR',
      category,
      headerType,
      headerContent,
      headerHandle,
      body,
      footer,
      buttons,
      bodyExamples,
      headerExample,
      variableMapping,
    } = req.body;

    // Validações
    if (!name || !body || !category) {
      return next(createError('name, body e category são obrigatórios', 400));
    }

    // Validar nome (lowercase, underscores, sem espaços)
    if (!/^[a-z0-9_]+$/.test(name)) {
      return next(createError('Nome do template deve conter apenas letras minúsculas, números e underscores', 400));
    }

    // Validar limites de caracteres da Meta
    if (category === 'MARKETING' && body.length > 550) {
      return next(createError('Corpo do template de marketing não pode exceder 550 caracteres', 400));
    }
    if (body.length > 1024) {
      return next(createError('Corpo do template não pode exceder 1024 caracteres', 400));
    }
    if (footer && footer.length > 60) {
      return next(createError('Footer não pode exceder 60 caracteres', 400));
    }
    if (headerType === 'TEXT' && headerContent && headerContent.length > 60) {
      return next(createError('Header de texto não pode exceder 60 caracteres', 400));
    }

    // Verificar se já existe localmente
    const existing = await prisma.cloudWaTemplate.findFirst({
      where: { name, language },
    });
    if (existing) {
      return next(createError('Template com este nome e idioma já existe', 409));
    }

    // Montar components para a Meta
    const components: any[] = [];

    // Header (opcional)
    if (headerType && headerContent) {
      const headerComponent: any = { type: 'HEADER', format: headerType };
      if (headerType === 'TEXT') {
        headerComponent.text = headerContent;
        if (headerExample) {
          headerComponent.example = { header_text: [headerExample] };
        }
      } else {
        // IMAGE, VIDEO, DOCUMENT — a Meta exige header_handle (Resumable Upload API).
        // Se o frontend não mandou o handle (ex: colou só a URL), tenta gerar
        // baixando a URL; header_url fica como último recurso (nem sempre aceito).
        let handle: string | null = headerHandle || null;
        if (!handle && /^https?:\/\//i.test(headerContent)) {
          try {
            const client = await WhatsAppCloudClient.fromDB();
            handle = await fetchHandleFromUrl(client, headerContent);
          } catch { /* Cloud API não configurada — segue sem handle */ }
        }
        headerComponent.example = handle
          ? { header_handle: [handle] }
          : { header_url: [headerContent] };
      }
      components.push(headerComponent);
    }

    // Body (obrigatório)
    const bodyComponent: any = { type: 'BODY', text: body };
    if (bodyExamples && Array.isArray(bodyExamples) && bodyExamples.length > 0) {
      // bodyExamples from frontend: [["val1","val2"]] or ["val1","val2"]
      // Meta expects: body_text: [["val1","val2"]]
      const first = bodyExamples[0];
      const normalized = Array.isArray(first)
        ? bodyExamples.map((row: any) => (Array.isArray(row) ? row.map(String) : [String(row)]))
        : [bodyExamples.map(String)];
      bodyComponent.example = { body_text: normalized };
    }
    components.push(bodyComponent);

    // Footer (opcional)
    if (footer) {
      components.push({ type: 'FOOTER', text: footer });
    }

    // Buttons (opcional)
    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map((btn: any) => {
          const button: any = { type: btn.type, text: btn.text };
          if (btn.type === 'URL' && btn.url) button.url = btn.url;
          if (btn.type === 'PHONE_NUMBER' && btn.phone_number) button.phone_number = btn.phone_number;
          if (btn.example) button.example = btn.example;
          return button;
        }),
      });
    }

    // Submeter à Meta
    let metaTemplateId: string | null = null;
    let submitStatus = 'PENDING';
    let submitError: string | null = null;

    // Verificar se Cloud API está configurada antes de tentar submeter
    const cloudConfig = await prisma.cloudWaConfig.findFirst();
    const isCloudConfigured = cloudConfig && cloudConfig.accessToken && cloudConfig.wabaId;

    if (isCloudConfigured) {
      try {
        const client = await WhatsAppCloudClient.fromDB();
        const metaResult = await client.createTemplate({
          name,
          language,
          category: category as any,
          components,
        });
        metaTemplateId = metaResult.id;
        submitStatus = metaResult.status || 'PENDING';
      } catch (err: any) {
        submitError = err.message || 'Erro ao submeter à Meta';
        submitStatus = 'REJECTED';
        console.error('[cloud-templates] Erro ao submeter à Meta:', submitError);
      }
    } else {
      // Salvar como rascunho local — será submetido quando a Cloud API for configurada
      submitStatus = 'PENDING';
      console.log('[cloud-templates] Cloud API não configurada — template salvo localmente');
    }

    // Salvar no banco local
    const template = await prisma.cloudWaTemplate.create({
      data: {
        name,
        language,
        category: category as any,
        status: submitStatus as any,
        metaTemplateId,
        headerType: headerType || null,
        headerContent: headerContent || null,
        body,
        footer: footer || null,
        buttons: buttons || null,
        bodyExamples: bodyExamples || null,
        headerExample: headerExample || null,
        variableMapping: variableMapping || null,
        rejectedReason: submitError,
      },
    });

    res.status(201).json({
      data: template,
      meta: {
        submitted: !submitError,
        metaTemplateId,
        error: submitError,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/whatsapp/cloud/templates/:id — Editar template ────────────────

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.cloudWaTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Template não encontrado', 404));

    // Verificar limite de edições (APPROVED: max 10 por 30 dias)
    if (existing.status === 'APPROVED' && existing.editsRemaining <= 0) {
      return next(createError('Limite de edições atingido (10 por 30 dias). Aguarde para editar novamente.', 429));
    }

    const { headerType, headerContent, headerHandle, body, footer, buttons, bodyExamples, headerExample, variableMapping } = req.body;

    // Montar components atualizados
    const components: any[] = [];

    const newHeaderType = headerType !== undefined ? headerType : existing.headerType;
    const newHeaderContent = headerContent !== undefined ? headerContent : existing.headerContent;
    const newBody = body !== undefined ? body : existing.body;
    const newFooter = footer !== undefined ? footer : existing.footer;
    const newButtons = buttons !== undefined ? buttons : existing.buttons;

    if (newHeaderType && newHeaderContent) {
      const headerComponent: any = { type: 'HEADER', format: newHeaderType };
      if (newHeaderType === 'TEXT') {
        headerComponent.text = newHeaderContent;
      } else {
        // Mídia: mesma regra do POST — preferir header_handle
        let handle: string | null = headerHandle || null;
        if (!handle && /^https?:\/\//i.test(newHeaderContent)) {
          try {
            const client = await WhatsAppCloudClient.fromDB();
            handle = await fetchHandleFromUrl(client, newHeaderContent);
          } catch { /* Cloud API não configurada — segue sem handle */ }
        }
        headerComponent.example = handle
          ? { header_handle: [handle] }
          : { header_url: [newHeaderContent] };
      }
      components.push(headerComponent);
    }

    const bodyComponent: any = { type: 'BODY', text: newBody };
    if (bodyExamples && Array.isArray(bodyExamples) && bodyExamples.length > 0) {
      const first = bodyExamples[0];
      const normalized = Array.isArray(first)
        ? bodyExamples.map((row: any) => (Array.isArray(row) ? row.map(String) : [String(row)]))
        : [bodyExamples.map(String)];
      bodyComponent.example = { body_text: normalized };
    }
    components.push(bodyComponent);

    if (newFooter) components.push({ type: 'FOOTER', text: newFooter });

    if (newButtons && Array.isArray(newButtons) && newButtons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: (newButtons as any[]).map((btn: any) => {
          const button: any = { type: btn.type, text: btn.text };
          if (btn.url) button.url = btn.url;
          if (btn.phone_number) button.phone_number = btn.phone_number;
          if (btn.example) button.example = btn.example;
          return button;
        }),
      });
    }

    // Submeter edição à Meta (se tiver ID da Meta)
    let editError: string | null = null;
    if (existing.metaTemplateId) {
      try {
        const client = await WhatsAppCloudClient.fromDB();
        await client.editTemplate(existing.metaTemplateId, components);
      } catch (err: any) {
        editError = err.response?.data?.error?.message || err.message;
        console.error('[cloud-templates] Erro ao editar na Meta:', editError);
      }
    }

    // Atualizar no banco local
    const updateData: Record<string, any> = {};
    if (headerType !== undefined) updateData.headerType = headerType;
    if (headerContent !== undefined) updateData.headerContent = headerContent;
    if (body !== undefined) updateData.body = body;
    if (footer !== undefined) updateData.footer = footer;
    if (buttons !== undefined) updateData.buttons = buttons;
    if (bodyExamples !== undefined) updateData.bodyExamples = bodyExamples;
    if (headerExample !== undefined) updateData.headerExample = headerExample;
    if (variableMapping !== undefined) updateData.variableMapping = variableMapping;

    // Se era APPROVED e foi editado, volta para PENDING (re-review)
    if (existing.status === 'APPROVED' && !editError) {
      updateData.status = 'PENDING';
      updateData.editsRemaining = existing.editsRemaining - 1;
      updateData.lastEditedAt = new Date();
    }

    if (editError) {
      updateData.rejectedReason = editError;
    }

    const template = await prisma.cloudWaTemplate.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({
      data: template,
      meta: { editSubmitted: !editError, error: editError },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/whatsapp/cloud/templates/:id — Deletar ─────────────────────

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.cloudWaTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return next(createError('Template não encontrado', 404));

    // Deletar na Meta (se tiver sido submetido)
    if (existing.metaTemplateId) {
      try {
        const client = await WhatsAppCloudClient.fromDB();
        await client.deleteTemplate(existing.name);
      } catch (err: any) {
        console.error('[cloud-templates] Erro ao deletar na Meta:', err.response?.data || err.message);
        // Continua com a deleção local mesmo se Meta falhar
      }
    }

    // Deletar localmente
    await prisma.cloudWaTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/cloud/templates/seed-reminders — Criar templates de lembrete ──

const REMINDER_TEMPLATES = [
  {
    name: 'lembrete_reuniao_1h',
    body: 'Olá {{1}}, sua reunião está marcada para hoje às {{2}} (falta 1 hora). Te esperamos!',
    footer: 'BGPGO',
    bodyExamples: [['João', '15:00']],
  },
  {
    name: 'lembrete_reuniao_15min',
    body: 'Olá {{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!',
    footer: 'BGPGO',
    bodyExamples: [['João', '15:00']],
  },
];

router.post('/seed-reminders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results: Array<{ name: string; action: string; status: string; error?: string }> = [];

    const cloudConfig = await prisma.cloudWaConfig.findFirst();
    const isCloudConfigured = cloudConfig?.accessToken && cloudConfig?.wabaId;
    let client: WhatsAppCloudClient | null = null;
    if (isCloudConfigured) {
      try { client = await WhatsAppCloudClient.fromDB(); } catch { /* sem client */ }
    }

    for (const def of REMINDER_TEMPLATES) {
      const existing = await prisma.cloudWaTemplate.findFirst({
        where: { name: def.name, language: 'pt_BR' },
      });

      if (existing) {
        results.push({ name: def.name, action: 'skip', status: existing.status });
        continue;
      }

      // Montar components
      const components: any[] = [
        { type: 'BODY', text: def.body, example: { body_text: def.bodyExamples } },
        { type: 'FOOTER', text: def.footer },
      ];

      let metaTemplateId: string | null = null;
      let submitStatus = 'PENDING';
      let submitError: string | null = null;

      if (client) {
        try {
          const metaResult = await client.createTemplate({
            name: def.name,
            language: 'pt_BR',
            category: 'UTILITY',
            components,
          });
          metaTemplateId = metaResult.id;
          submitStatus = metaResult.status || 'PENDING';
        } catch (err: any) {
          submitError = err.message || 'Erro ao submeter à Meta';
          submitStatus = 'REJECTED';
        }
      }

      await prisma.cloudWaTemplate.create({
        data: {
          name: def.name,
          language: 'pt_BR',
          category: 'UTILITY',
          status: submitStatus as any,
          metaTemplateId,
          headerType: null,
          headerContent: null,
          body: def.body,
          footer: def.footer,
          buttons: null,
          bodyExamples: def.bodyExamples,
          headerExample: null,
          rejectedReason: submitError,
        },
      });

      results.push({ name: def.name, action: 'created', status: submitStatus, ...(submitError ? { error: submitError } : {}) });
    }

    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/whatsapp/cloud/templates/sync — Sincronizar com Meta ─────────

router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await WhatsAppCloudClient.fromDB();

    let synced = 0;
    let created = 0;
    let updated = 0;
    let after: string | undefined;

    // Paginar por todos os templates da Meta
    do {
      const metaTemplates = await client.listTemplates({ limit: 100, after });

      for (const mt of metaTemplates.data || []) {
        const existing = await prisma.cloudWaTemplate.findFirst({
          where: { name: mt.name, language: mt.language },
        });

        const qualityScore = mt.quality_score?.score || null;
        const status = mt.status as any;

        const bodyComp = mt.components?.find((c: any) => c.type === 'BODY');
        const headerComp = mt.components?.find((c: any) => c.type === 'HEADER');
        const footerComp = mt.components?.find((c: any) => c.type === 'FOOTER');
        const buttonsComp = mt.components?.find((c: any) => c.type === 'BUTTONS');
        const headerContent = extractHeaderContent(headerComp);

        if (existing) {
          // Update mantém status local (DRAFT/DISABLED não voltam pra APPROVED só porque a Meta diz).
          // Mas conteúdo do template (body, header, components) é sempre fonte-Meta —
          // exceto headerContent de mídia, que preserva override manual público.
          const finalHeaderContent = resolveSyncedHeaderContent(
            existing.headerContent,
            headerContent,
            headerComp?.format || null,
          );
          await prisma.cloudWaTemplate.update({
            where: { id: existing.id },
            data: {
              status,
              metaTemplateId: mt.id,
              qualityScore,
              rejectedReason: mt.rejected_reason || null,
              headerType: headerComp?.format || null,
              headerContent: finalHeaderContent,
              body: bodyComp?.text || '',
              footer: footerComp?.text || null,
              buttons: (buttonsComp?.buttons || null) as any,
              components: (mt.components || null) as any,
            },
          });
          updated++;
        } else {
          await prisma.cloudWaTemplate.create({
            data: {
              name: mt.name,
              language: mt.language,
              category: (mt.category || 'MARKETING') as any,
              status,
              metaTemplateId: mt.id,
              qualityScore,
              headerType: headerComp?.format || null,
              headerContent,
              body: bodyComp?.text || '',
              footer: footerComp?.text || null,
              buttons: buttonsComp?.buttons || null,
              components: mt.components || null,
              rejectedReason: mt.rejected_reason || null,
            },
          });
          created++;
        }
        synced++;
      }

      // Próxima página
      after = metaTemplates.paging?.cursors?.after;
    } while (after);

    res.json({
      data: { synced, created, updated },
      message: `Sincronizados ${synced} templates (${created} novos, ${updated} atualizados)`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
