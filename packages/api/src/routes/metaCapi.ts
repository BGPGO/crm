/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Configuração — Meta Conversions API (CAPI)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   GET  /api/meta-capi/config       → ler config da brand atual (token mascarado)
 *   PUT  /api/meta-capi/config       → upsert config
 *   POST /api/meta-capi/test-event   → disparar evento de teste
 *
 * Tela frontend: /settings/meta-capi
 * Service: services/meta/metaCapi.ts
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { sendTestEvent } from '../services/meta/metaCapi';

const router = Router();

// Mascara token mantendo últimos 4 chars visíveis (mesmo padrão de cloud-wa-config)
function maskToken(val: string | null | undefined): string {
  if (!val) return '';
  if (val.length <= 4) return '••••';
  return `••••${val.slice(-4)}`;
}

function isMaskedToken(val: unknown): boolean {
  return typeof val === 'string' && val.startsWith('••••');
}

async function getOrCreateConfig(brand: 'BGP' | 'AIMO') {
  let config = await prisma.metaCapiConfig.findUnique({ where: { brand } });
  if (!config) {
    config = await prisma.metaCapiConfig.create({ data: { brand } });
  }
  return config;
}

// ─── GET /api/meta-capi/config ──────────────────────────────────────────────

router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOrCreateConfig(req.brand);
    res.json({
      data: {
        id: config.id,
        brand: config.brand,
        pixelId: config.pixelId,
        accessToken: maskToken(config.accessToken),
        hasAccessToken: !!config.accessToken,
        testEventCode: config.testEventCode ?? '',
        eventName: config.eventName,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/meta-capi/config ──────────────────────────────────────────────

router.put('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getOrCreateConfig(req.brand);

    const allowed = ['pixelId', 'accessToken', 'testEventCode', 'eventName', 'isActive'];
    const updateData: Record<string, unknown> = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    // Não sobrescrever accessToken com valor mascarado
    if (isMaskedToken(updateData.accessToken)) {
      delete updateData.accessToken;
    }

    // Validações leves
    if (updateData.eventName !== undefined) {
      const ev = String(updateData.eventName).trim();
      if (!ev) return next(createError('eventName não pode ser vazio', 400));
      if (ev.length > 64) return next(createError('eventName muito longo', 400));
      updateData.eventName = ev;
    }
    if (updateData.testEventCode === '') updateData.testEventCode = null;

    const updated = await prisma.metaCapiConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    res.json({
      data: {
        id: updated.id,
        brand: updated.brand,
        pixelId: updated.pixelId,
        accessToken: maskToken(updated.accessToken),
        hasAccessToken: !!updated.accessToken,
        testEventCode: updated.testEventCode ?? '',
        eventName: updated.eventName,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/meta-capi/test-event ─────────────────────────────────────────

router.post('/test-event', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, phone, value, eventName } = req.body ?? {};

    const numericValue = value === undefined || value === null || value === ''
      ? null
      : Number(value);

    const result = await sendTestEvent(req.brand, {
      email: typeof email === 'string' ? email : null,
      phone: typeof phone === 'string' ? phone : null,
      value: typeof numericValue === 'number' && Number.isFinite(numericValue) ? numericValue : null,
      eventName: typeof eventName === 'string' && eventName ? eventName : null,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error, data: result.response ?? null });
    }
    res.json({ data: result.response });
  } catch (err) {
    next(err);
  }
});

export default router;
