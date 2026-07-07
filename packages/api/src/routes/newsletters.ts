import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import {
  extractLinks,
  getEditionMetrics,
  sendNewsletterTo,
} from '../services/newsletterService';
import { isValidEmail } from './email-tracking';

const router = Router();

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
