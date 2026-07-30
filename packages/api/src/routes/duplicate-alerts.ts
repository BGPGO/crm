/**
 * Duplicate Alert routes — list, merge, dismiss
 */
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/duplicate-alerts — List alerts (default: PENDING)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as string) || 'PENDING';

    // DuplicateAlert has no brand and no Prisma relation to Contact (uses raw IDs).
    // Filter manually: keep alert only if at least one of its contacts matches the brand.
    const rawAlerts = await prisma.duplicateAlert.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const ids = Array.from(new Set(rawAlerts.flatMap((a) => [a.contactAId, a.contactBId])));
    const matchingContacts = await prisma.contact.findMany({
      where: { id: { in: ids }, brand: req.brand },
      select: { id: true },
    });
    const matchingIds = new Set(matchingContacts.map((c) => c.id));

    const alerts = rawAlerts
      .filter((a) => matchingIds.has(a.contactAId) || matchingIds.has(a.contactBId))
      .slice(0, 50);

    // Enrich with contact data
    const enriched = await Promise.all(alerts.map(async (a) => {
      const [contactA, contactB] = await Promise.all([
        prisma.contact.findUnique({
          where: { id: a.contactAId },
          select: { id: true, name: true, phone: true, email: true },
        }),
        prisma.contact.findUnique({
          where: { id: a.contactBId },
          select: { id: true, name: true, phone: true, email: true },
        }),
      ]);

      // Get deals for each
      const [dealsA, dealsB] = await Promise.all([
        prisma.deal.findMany({
          where: { contactId: a.contactAId, status: 'OPEN' },
          select: { title: true, stage: { select: { name: true, order: true } } },
          orderBy: { stage: { order: 'desc' } },
          take: 1,
        }),
        prisma.deal.findMany({
          where: { contactId: a.contactBId, status: 'OPEN' },
          select: { title: true, stage: { select: { name: true, order: true } } },
          orderBy: { stage: { order: 'desc' } },
          take: 1,
        }),
      ]);

      return {
        ...a,
        contactA: contactA ? { ...contactA, deal: dealsA[0] || null } : null,
        contactB: contactB ? { ...contactB, deal: dealsB[0] || null } : null,
      };
    }));

    res.json({ data: enriched });
  } catch (err) {
    next(err);
  }
});

// GET /api/duplicate-alerts/count — Pending count (for badge)
router.get('/count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // DuplicateAlert has no Prisma relation to Contact, so we filter post-hoc by brand.
    const pending = await prisma.duplicateAlert.findMany({
      where: { status: 'PENDING' },
      select: { contactAId: true, contactBId: true },
    });
    const ids = Array.from(new Set(pending.flatMap((a) => [a.contactAId, a.contactBId])));
    const matching = ids.length
      ? await prisma.contact.findMany({
          where: { id: { in: ids }, brand: req.brand },
          select: { id: true },
        })
      : [];
    const matchingIds = new Set(matching.map((c) => c.id));
    const count = pending.filter((a) => matchingIds.has(a.contactAId) || matchingIds.has(a.contactBId)).length;
    res.json({ data: { count } });
  } catch (err) {
    next(err);
  }
});

// POST /api/duplicate-alerts/:id/merge — Merge contacts (keep the one with deal further in funnel)
router.post('/:id/merge', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await prisma.duplicateAlert.findUnique({ where: { id: req.params.id } });
    if (!alert || alert.status !== 'PENDING') {
      return res.status(404).json({ error: 'Alert not found or already resolved' });
    }

    // Determine which to keep: the one with the deal further in the funnel
    const [dealsA, dealsB] = await Promise.all([
      prisma.deal.findFirst({
        where: { contactId: alert.contactAId, status: 'OPEN' },
        include: { stage: { select: { order: true } } },
        orderBy: { stage: { order: 'desc' } },
      }),
      prisma.deal.findFirst({
        where: { contactId: alert.contactBId, status: 'OPEN' },
        include: { stage: { select: { order: true } } },
        orderBy: { stage: { order: 'desc' } },
      }),
    ]);

    const orderA = dealsA?.stage?.order ?? -1;
    const orderB = dealsB?.stage?.order ?? -1;
    const keepId = orderA >= orderB ? alert.contactAId : alert.contactBId;
    const removeId = keepId === alert.contactAId ? alert.contactBId : alert.contactAId;

    const keep = await prisma.contact.findUnique({ where: { id: keepId }, select: { name: true, phone: true, email: true } });
    const remove = await prisma.contact.findUnique({ where: { id: removeId }, select: { name: true, phone: true, email: true } });

    if (!keep || !remove) {
      return res.status(404).json({ error: 'One of the contacts no longer exists' });
    }

    // Complement missing data
    const updates: Record<string, string> = {};
    if (!keep.phone && remove.phone) updates.phone = remove.phone;
    if (!keep.email && remove.email) updates.email = remove.email;
    if (Object.keys(updates).length > 0) {
      await prisma.contact.update({ where: { id: keepId }, data: updates });
    }

    // Move all relations
    const tables = ['deal', 'dealContact', 'whatsAppConversation', 'waConversation',
      'automationEnrollment', 'activity', 'calendlyEvent', 'readAiMeeting', 'leadTracking', 'emailSend'] as const;

    for (const table of tables) {
      try {
        await (prisma[table] as any).updateMany({
          where: { contactId: removeId },
          data: { contactId: keepId },
        });
      } catch { /* unique constraint conflicts — skip */ }
    }

    // Tags
    try {
      const existingTags = new Set(
        (await prisma.contactTag.findMany({ where: { contactId: keepId }, select: { tagId: true } })).map(t => t.tagId)
      );
      await prisma.contactTag.deleteMany({
        where: { contactId: removeId, tagId: { in: [...existingTags] } },
      });
      await prisma.contactTag.updateMany({
        where: { contactId: removeId },
        data: { contactId: keepId },
      });
    } catch { /* skip */ }

    // Delete removed contact
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "EmailSend" WHERE "contactId" = $1`, removeId);
      await prisma.$executeRawUnsafe(`DELETE FROM "ContactTag" WHERE "contactId" = $1`, removeId);
      await prisma.$executeRawUnsafe(`DELETE FROM "LeadScore" WHERE "contactId" = $1`, removeId);
      await prisma.contact.delete({ where: { id: removeId } });
    } catch { /* last resort — leave orphan */ }

    // ── Consolidar as negociações ────────────────────────────────────────
    //
    // Mover as relações junta os CONTATOS, mas deixava dois deals abertos no
    // contato mantido: o da LP (com campanha, sem reunião) e o criado pelo
    // Calendly (com reunião, sem campanha) — exatamente o par que motivou o
    // merge. Aqui eles viram um só: fica o deal com campanha (é ele que carrega
    // a atribuição de mídia; desempate, o mais antigo), a etapa mais avançada
    // entre os dois é adotada, e reunião/atividades/produtos migram.
    let consolidated: { kept: string; removed: string[] } | null = null;
    const openDeals = await prisma.deal.findMany({
      where: { contactId: keepId, status: 'OPEN' },
      include: { stage: { select: { order: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (openDeals.length > 1) {
      const principal = openDeals.find((d) => d.campaignId) ?? openDeals[0];
      const duplicados = openDeals.filter((d) => d.id !== principal.id);
      const ordemAlvo = Math.max(...openDeals.map((d) => d.stage?.order ?? 0));

      for (const dup of duplicados) {
        const dealTables = ['calendlyEvent', 'readAiMeeting', 'activity', 'task', 'dealProduct'] as const;
        for (const table of dealTables) {
          try {
            await (prisma[table] as any).updateMany({
              where: { dealId: dup.id },
              data: { dealId: principal.id },
            });
          } catch { /* conflitos de unicidade — segue */ }
        }
        // O deal do Calendly costuma ser o que sabe quem atende e de onde veio a reunião
        const herda: Record<string, unknown> = {};
        if (!principal.closerId && dup.closerId) herda.closerId = dup.closerId;
        if (!principal.meetingSource && dup.meetingSource) herda.meetingSource = dup.meetingSource;
        if (Object.keys(herda).length > 0) {
          await prisma.deal.update({ where: { id: principal.id }, data: herda });
        }
        await prisma.deal.delete({ where: { id: dup.id } });
      }

      // Etapa mais avançada, resolvida DENTRO do funil do principal (os funis
      // têm etapas espelhadas por ordem — nunca aponte stage de outro funil)
      if ((principal.stage?.order ?? 0) < ordemAlvo) {
        const alvo = await prisma.pipelineStage.findFirst({
          where: { pipelineId: principal.pipelineId, order: ordemAlvo },
        });
        if (alvo) {
          await prisma.deal.update({ where: { id: principal.id }, data: { stageId: alvo.id } });
        }
      }

      consolidated = { kept: principal.id, removed: duplicados.map((d) => d.id) };
      console.log(`[duplicate-alerts] Deals consolidados no merge: mantido=${principal.id}, removidos=${consolidated.removed.join(',')}`);
    }

    // Mark alert as merged
    await prisma.duplicateAlert.update({
      where: { id: alert.id },
      data: { status: 'MERGED' },
    });

    res.json({
      data: {
        merged: true,
        kept: { id: keepId, name: keep.name },
        removed: { id: removeId, name: remove.name },
        complemented: updates,
        dealsConsolidated: consolidated,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/duplicate-alerts/:id/dismiss — Mark as not a duplicate
router.post('/:id/dismiss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await prisma.duplicateAlert.findUnique({ where: { id: req.params.id } });
    if (!alert || alert.status !== 'PENDING') {
      return res.status(404).json({ error: 'Alert not found or already resolved' });
    }

    await prisma.duplicateAlert.update({
      where: { id: alert.id },
      data: { status: 'DISMISSED' },
    });

    res.json({ data: { dismissed: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
