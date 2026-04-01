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
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const router = Router();

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
      body,
      footer,
      buttons,
      bodyExamples,
      headerExample,
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
        // IMAGE, VIDEO, DOCUMENT
        headerComponent.example = { header_url: [headerContent] };
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

    const { headerType, headerContent, body, footer, buttons, bodyExamples, headerExample } = req.body;

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
        headerComponent.example = { header_url: [newHeaderContent] };
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
    body: '{{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!',
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

        if (existing) {
          await prisma.cloudWaTemplate.update({
            where: { id: existing.id },
            data: {
              status,
              metaTemplateId: mt.id,
              qualityScore,
              rejectedReason: mt.rejected_reason || null,
            },
          });
          updated++;
        } else {
          const bodyComp = mt.components?.find((c: any) => c.type === 'BODY');
          const headerComp = mt.components?.find((c: any) => c.type === 'HEADER');
          const footerComp = mt.components?.find((c: any) => c.type === 'FOOTER');
          const buttonsComp = mt.components?.find((c: any) => c.type === 'BUTTONS');

          await prisma.cloudWaTemplate.create({
            data: {
              name: mt.name,
              language: mt.language,
              category: (mt.category || 'MARKETING') as any,
              status,
              metaTemplateId: mt.id,
              qualityScore,
              headerType: headerComp?.format || null,
              headerContent: headerComp?.text || null,
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
