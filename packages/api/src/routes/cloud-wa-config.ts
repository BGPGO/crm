/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Configuração — WhatsApp Cloud API (API Oficial da Meta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CRUD de configuração da Cloud API (credenciais, status, limites).
 *
 *   Z-API legado:   /api/whatsapp/config       (zapiInstanceId, zapiToken, etc.)
 *   Cloud API:      /api/whatsapp/cloud/config  ← ESTE ARQUIVO
 *
 * Referência: crm/WHATSAPP-CLOUD-API-REFERENCE.md
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const router = Router();

// ─── GET /api/whatsapp/cloud/config — Ler configuração ──────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.cloudWaConfig.findFirst();

    if (!config) {
      config = await prisma.cloudWaConfig.create({ data: {} });
    }

    // Mascarar campos sensíveis
    const mask = (val: string | null) =>
      val && val.length > 12 ? `${val.slice(0, 8)}...${val.slice(-4)}` : val;

    res.json({
      data: {
        ...config,
        accessToken: mask(config.accessToken),
        appSecret: mask(config.appSecret),
        twoStepPin: config.twoStepPin ? '••••••' : '',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/whatsapp/cloud/config — Atualizar configuração ────────────────

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.cloudWaConfig.findFirst();
    if (!config) {
      config = await prisma.cloudWaConfig.create({ data: {} });
    }

    const allowedFields = [
      'phoneNumberId', 'wabaId', 'accessToken', 'appSecret',
      'verifyToken', 'twoStepPin', 'displayPhone',
      'isActive', 'dailyMessageLimit', 'dailySpendLimitBRL', 'webhookUrl',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Não sobrescrever secrets com valores mascarados
    const sensitiveFields = ['accessToken', 'appSecret'];
    for (const field of sensitiveFields) {
      const val = updateData[field];
      if (typeof val === 'string' && val.includes('...')) {
        delete updateData[field];
      }
    }
    if (typeof updateData.twoStepPin === 'string' && updateData.twoStepPin.includes('•')) {
      delete updateData.twoStepPin;
    }

    const updated = await prisma.cloudWaConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    // Mascarar na resposta
    const mask = (val: string | null) =>
      val && val.length > 12 ? `${val.slice(0, 8)}...${val.slice(-4)}` : val;

    res.json({
      data: {
        ...updated,
        accessToken: mask(updated.accessToken),
        appSecret: mask(updated.appSecret),
        twoStepPin: updated.twoStepPin ? '••••••' : '',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/whatsapp/cloud/config/status — Status em tempo real ───────────

router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.cloudWaConfig.findFirst();
    if (!config || !config.phoneNumberId || !config.accessToken) {
      return res.json({
        data: {
          configured: false,
          message: 'Cloud API não configurada. Preencha phoneNumberId e accessToken.',
        },
      });
    }

    // Consultar Meta em tempo real
    try {
      const client = await WhatsAppCloudClient.fromDB();
      const phoneStatus = await client.getPhoneStatus();

      // Atualizar cache local
      await prisma.cloudWaConfig.update({
        where: { id: config.id },
        data: {
          qualityRating: phoneStatus.quality_rating || config.qualityRating,
          messagingTier: phoneStatus.messaging_limit_tier || config.messagingTier,
          phoneStatus: phoneStatus.status || config.phoneStatus,
        },
      });

      // Contar conversas iniciadas pela empresa hoje (business-initiated)
      // = templates enviados FORA da janela de 24h (contatos sem conversa ativa)
      // Respostas dentro da janela são gratuitas e não contam no limite
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const businessInitiated = await prisma.waMessage.count({
        where: {
          direction: 'OUTBOUND',
          type: 'TEMPLATE',
          createdAt: { gte: today },
        },
      });
      const todayCount = businessInitiated;

      // Contar templates por status
      const templateStats = await prisma.cloudWaTemplate.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      // Gasto diário WABA
      const { getDailySpend } = await import('../utils/wabaSpendLimit');
      const spend = await getDailySpend();

      res.json({
        data: {
          configured: true,
          isActive: config.isActive,
          phone: {
            displayPhone: config.displayPhone || phoneStatus.display_phone_number,
            qualityRating: phoneStatus.quality_rating,
            status: phoneStatus.status,
            messagingTier: phoneStatus.messaging_limit_tier,
          },
          today: {
            messagesSent: todayCount,
            dailyLimit: config.dailyMessageLimit,
            remaining: Math.max(0, config.dailyMessageLimit - todayCount),
          },
          spend: {
            totalCost: spend.totalCost,
            limitBRL: spend.limitBRL,
            remaining: spend.remaining,
            exceeded: spend.exceeded,
            marketingCount: spend.marketingCount,
            utilityCount: spend.utilityCount,
            automationCost: spend.automationCost,
            automationMarketingCount: spend.automationMarketingCount,
            automationUtilityCount: spend.automationUtilityCount,
            broadcastCost: spend.broadcastCost,
            broadcastMarketingCount: spend.broadcastMarketingCount,
            broadcastUtilityCount: spend.broadcastUtilityCount,
          },
          templates: templateStats.reduce((acc: Record<string, number>, s) => {
            acc[s.status] = s._count.id;
            return acc;
          }, {}),
        },
      });
    } catch (apiErr: any) {
      // Meta API falhou — retornar dados do cache
      res.json({
        data: {
          configured: true,
          isActive: config.isActive,
          phone: {
            displayPhone: config.displayPhone,
            qualityRating: config.qualityRating,
            status: config.phoneStatus,
            messagingTier: config.messagingTier,
          },
          error: 'Não foi possível consultar a Meta API em tempo real',
          errorDetail: apiErr.response?.data?.error?.message || apiErr.message,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
