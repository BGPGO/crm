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
    const alerts = await prisma.duplicateAlert.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

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
router.get('/count', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.duplicateAlert.count({ where: { status: 'PENDING' } });
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
      'automationEnrollment', 'activity', 'calendlyEvent', 'leadTracking', 'emailSend'] as const;

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
