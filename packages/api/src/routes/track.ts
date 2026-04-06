/**
 * Click tracking redirect for broadcast links.
 *
 * GET /api/t/:token — records click and redirects to the actual URL.
 * Token = WaBroadcastContact ID. No auth required (public link).
 */

import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const bc = await prisma.waBroadcastContact.findUnique({
      where: { id: token },
      select: {
        id: true,
        clickedAt: true,
        broadcast: {
          select: {
            template: {
              select: { buttons: true },
            },
          },
        },
      },
    });

    if (!bc) {
      return res.status(404).send('Link not found');
    }

    // Record click (only first click matters for stats)
    if (!bc.clickedAt) {
      const updated = await prisma.waBroadcastContact.update({
        where: { id: token },
        data: { clickedAt: new Date() },
      });
      // Increment broadcast-level click count
      await prisma.waBroadcast.update({
        where: { id: updated.broadcastId },
        data: { clickedCount: { increment: 1 } },
      });
    }

    // Find the URL to redirect to from the template buttons
    const buttons = bc.broadcast?.template?.buttons as Array<{ type: string; url?: string }> | null;
    const urlButton = buttons?.find(b => b.type === 'URL' && b.url);

    if (urlButton?.url) {
      return res.redirect(302, urlButton.url);
    }

    // Fallback if no URL found
    return res.status(404).send('URL not found');
  } catch (err) {
    console.error('[track] Error:', err);
    return res.status(500).send('Internal error');
  }
});

export default router;
