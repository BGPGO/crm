import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import {
  extractLinks,
  getEditionMetrics,
  sendNewsletterTo,
} from '../services/newsletterService';
import {
  getOrCreateConfig,
  resolveAudience,
  runNewsletterAutomation,
  runNewsletterTest,
} from '../services/newsletterAutomation';
import { isValidEmail } from './email-tracking';

const router = Router();

// ─── GET /newsletters/config — configuração da automação ────────────────────

router.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOrCreateConfig();
    const segment = config.segmentId
      ? await prisma.segment.findUnique({
          where: { id: config.segmentId },
          select: { id: true, name: true, contactCount: true },
        })
      : null;
    const audienceCount = (await resolveAudience(config)).length;
    return res.json({ data: { ...config, segment, audienceCount } });
  } catch (error) {
    return next(error);
  }
});

// ─── PUT /newsletters/config — atualiza automação (liga/desliga, lista) ─────

router.put('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled, recipients, segmentId } = req.body as {
      enabled?: boolean;
      recipients?: unknown;
      segmentId?: string | null;
    };

    const data: { enabled?: boolean; recipients?: string[]; segmentId?: string | null } = {};
    if (typeof enabled === 'boolean') data.enabled = enabled;
    if (segmentId !== undefined) {
      if (segmentId === null || segmentId === '') {
        data.segmentId = null;
      } else {
        const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
        if (!segment) {
          return res.status(400).json({ error: 'Segmento não encontrado' });
        }
        data.segmentId = segmentId;
      }
    }
    if (recipients !== undefined) {
      if (!Array.isArray(recipients)) {
        return res.status(400).json({ error: 'recipients deve ser uma lista de emails' });
      }
      const clean = [...new Set(recipients.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
      const invalid = clean.filter((e) => !isValidEmail(e));
      if (invalid.length > 0) {
        return res.status(400).json({ error: `Emails inválidos: ${invalid.join(', ')}` });
      }
      data.recipients = clean;
    }

    await getOrCreateConfig();
    const config = await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data,
    });
    const segment = config.segmentId
      ? await prisma.segment.findUnique({
          where: { id: config.segmentId },
          select: { id: true, name: true, contactCount: true },
        })
      : null;
    const audienceCount = (await resolveAudience(config)).length;
    return res.json({ data: { ...config, segment, audienceCount } });
  } catch (error) {
    return next(error);
  }
});

// ─── POST /newsletters/run-now — monta a edição agora ───────────────────────
// body: { testEmail } → edição de teste só pra esse email;
// body: {}            → execução completa (envia pra lista configurada)

router.post('/run-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { testEmail } = req.body as { testEmail?: string };

    if (testEmail) {
      if (!isValidEmail(testEmail)) {
        return res.status(400).json({ error: 'testEmail inválido' });
      }
      const { editionId } = await runNewsletterTest(testEmail);
      return res.json({ data: { editionId, sent: 1, test: true } });
    }

    const config = await getOrCreateConfig();
    const audience = await resolveAudience(config);
    if (audience.length === 0) {
      return res.status(400).json({ error: 'Audiência vazia — escolha um segmento ou adicione emails antes de enviar.' });
    }

    // Envio pode levar minutos (600ms/destinatário) — roda em background
    runNewsletterAutomation({ force: true }).catch((err) =>
      console.error('[newsletter] run-now falhou:', err)
    );
    return res.json({ data: { started: true, audienceCount: audience.length } });
  } catch (error) {
    return next(error);
  }
});

// ─── GET /newsletters — lista edições com métricas resumidas ────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

    const [editions, total] = await Promise.all([
      prisma.newsletterEdition.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          subject: true,
          status: true,
          isTest: true,
          sentAt: true,
          recipientCount: true,
          createdAt: true,
        },
      }),
      prisma.newsletterEdition.count(),
    ]);

    // Aberturas/cliques únicos por edição (por email), em uma query por tipo
    const ids = editions.map((e) => e.id);
    const events = ids.length
      ? await prisma.newsletterEvent.findMany({
          where: { editionId: { in: ids } },
          select: { editionId: true, type: true, email: true },
        })
      : [];

    const agg = new Map<string, { opens: Set<string>; clicks: Set<string> }>();
    for (const ev of events) {
      if (!agg.has(ev.editionId)) agg.set(ev.editionId, { opens: new Set(), clicks: new Set() });
      const a = agg.get(ev.editionId)!;
      const who = ev.email || 'anon';
      if (ev.type === 'OPEN') a.opens.add(who);
      if (ev.type === 'CLICK') a.clicks.add(who);
    }

    const data = editions.map((e) => {
      const a = agg.get(e.id);
      const uniqueOpens = a?.opens.size || 0;
      const uniqueClicks = a?.clicks.size || 0;
      return {
        ...e,
        uniqueOpens,
        uniqueClicks,
        openRate: e.recipientCount > 0 ? uniqueOpens / e.recipientCount : null,
        clickRate: e.recipientCount > 0 ? uniqueClicks / e.recipientCount : null,
      };
    });

    return res.json({
      data,
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return next(error);
  }
});

// ─── GET /newsletters/:id — detalhe com métricas por botão ──────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const edition = await prisma.newsletterEdition.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        subject: true,
        status: true,
        isTest: true,
        sentAt: true,
        recipientCount: true,
        createdAt: true,
        links: true,
      },
    });
    if (!edition) {
      return res.status(404).json({ error: 'Edição não encontrada' });
    }

    const metrics = await getEditionMetrics(edition.id);

    // Últimos eventos pra timeline
    const recentEvents = await prisma.newsletterEvent.findMany({
      where: { editionId: edition.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, slot: true, email: true, createdAt: true },
    });

    return res.json({ data: { ...edition, metrics, recentEvents } });
  } catch (error) {
    return next(error);
  }
});

// ─── POST /newsletters — cria edição a partir de HTML anotado com data-slot ─

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subject, html, isTest } = req.body as {
      subject?: string;
      html?: string;
      isTest?: boolean;
    };
    if (!subject || typeof subject !== 'string' || !html || typeof html !== 'string') {
      return res.status(400).json({ error: 'subject e html são obrigatórios' });
    }

    const links = extractLinks(html);
    if (Object.keys(links).length === 0) {
      return res.status(400).json({ error: 'HTML sem nenhum <a data-slot="...">' });
    }

    const edition = await prisma.newsletterEdition.create({
      data: {
        subject: subject.slice(0, 200),
        html,
        links: links as object,
        isTest: Boolean(isTest),
      },
    });

    return res.status(201).json({ data: edition });
  } catch (error) {
    return next(error);
  }
});

// ─── POST /newsletters/:id/send-test — envia teste rastreado ────────────────

router.post('/:id/send-test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'email inválido' });
    }

    const result = await sendNewsletterTo(req.params.id, email);
    if (result.error) {
      return res.status(502).json({ error: result.error });
    }

    await prisma.newsletterEdition.update({
      where: { id: req.params.id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        recipientCount: { increment: 1 },
      },
    });

    return res.json({ data: { messageId: result.id } });
  } catch (error) {
    return next(error);
  }
});

export default router;
