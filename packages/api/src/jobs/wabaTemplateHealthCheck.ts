/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Job: WABA Template Health Check
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sincroniza templates com a Meta API, calcula taxa de erro por template
 * nos últimos 7 dias a partir de WaMessage, e define um flag de saúde:
 *
 *   CRITICAL — failRate7d >= 20% com pelo menos 10 envios
 *   WARNING  — failRate7d >= 10% com pelo menos 5 envios
 *   HEALTHY  — failRate7d < 10% com pelo menos 5 envios
 *   UNKNOWN  — menos de 5 envios (volume insuficiente para conclusão)
 *
 * Roda a cada 1h via cron orchestrator (jobs/index.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type TemplateHealthFlag = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export interface TemplateHealthResult {
  total: number;
  updated: number;
  critical: number;
  warning: number;
  healthy: number;
  unknown: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcHealthFlag(failRate: number, sentCount: number): TemplateHealthFlag {
  if (sentCount < 5) return 'UNKNOWN';
  if (failRate >= 0.20 && sentCount >= 10) return 'CRITICAL';
  if (failRate >= 0.10 && sentCount >= 5) return 'WARNING';
  return 'HEALTHY';
}

// ─── Job principal ───────────────────────────────────────────────────────────

export async function runWabaTemplateHealthCheck(): Promise<TemplateHealthResult> {
  const JOB = '[waba-template-health-check]';

  // ── 1. Carregar config WABA ──────────────────────────────────────────────
  const config = await prisma.cloudWaConfig.findFirst();
  if (!config || !config.phoneNumberId || !config.accessToken) {
    console.warn(`${JOB} CloudWaConfig não configurada — job ignorado`);
    return { total: 0, updated: 0, critical: 0, warning: 0, healthy: 0, unknown: 0 };
  }

  // ── 2. Sincronizar templates com a Meta API ──────────────────────────────
  let client: WhatsAppCloudClient;
  try {
    client = await WhatsAppCloudClient.fromDB();
  } catch (err) {
    console.error(`${JOB} Erro ao instanciar cliente Meta:`, err);
    throw err;
  }

  const MAX_PAGES = 10;
  let after: string | undefined;
  let syncedFromMeta = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    let result: { data: any[]; paging?: any };
    try {
      result = await client.listTemplates({
        fields: 'name,status,category,language,quality_score,rejected_reason',
        limit: 100,
        after,
      });
    } catch (err) {
      console.error(`${JOB} Erro ao buscar templates da Meta (página ${page + 1}):`, err);
      break;
    }

    const templates = result.data ?? [];
    if (templates.length === 0) break;

    for (const t of templates) {
      const qualityScore = t.quality_score?.score ?? null;
      const rejectedReason = t.rejected_reason ?? null;

      // Upsert por (name, language) — mesma unique do schema
      await prisma.cloudWaTemplate.upsert({
        where: { name_language: { name: t.name, language: t.language } },
        update: {
          status: t.status as any,
          category: t.category as any,
          qualityScore,
          rejectedReason,
          metaTemplateId: t.id,
        },
        create: {
          name: t.name,
          language: t.language,
          status: t.status as any,
          category: t.category as any,
          qualityScore,
          rejectedReason,
          metaTemplateId: t.id,
          body: '', // campo obrigatório — será completado pelo usuário
        },
      });
      syncedFromMeta++;
    }

    // Paginar
    after = result.paging?.cursors?.after;
    if (!after || !result.paging?.next) break;
  }

  console.log(`${JOB} ${syncedFromMeta} templates sincronizados com a Meta`);

  // ── 3. Calcular métricas de saúde para todos os templates no DB ──────────
  const allTemplates = await prisma.cloudWaTemplate.findMany({
    select: { id: true, name: true },
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const counters = { critical: 0, warning: 0, healthy: 0, unknown: 0 };
  let updated = 0;

  for (const tmpl of allTemplates) {
    // Contar envios OUTBOUND TEMPLATE nos últimos 7d
    const sentCount7d = await prisma.waMessage.count({
      where: {
        direction: 'OUTBOUND',
        type: 'TEMPLATE',
        templateName: tmpl.name,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Contar falhas (errorCode IS NOT NULL) nos mesmos critérios
    const failCount7d = await prisma.waMessage.count({
      where: {
        direction: 'OUTBOUND',
        type: 'TEMPLATE',
        templateName: tmpl.name,
        createdAt: { gte: sevenDaysAgo },
        errorCode: { not: null },
      },
    });

    const failRate7d = sentCount7d > 0 ? failCount7d / sentCount7d : 0;
    const healthFlag = calcHealthFlag(failRate7d, sentCount7d);

    await prisma.cloudWaTemplate.update({
      where: { id: tmpl.id },
      data: {
        failRate7d,
        sentCount7d,
        healthFlag,
        lastHealthCheckAt: now,
      },
    });

    counters[healthFlag.toLowerCase() as keyof typeof counters]++;
    updated++;
  }

  const result: TemplateHealthResult = {
    total: allTemplates.length,
    updated,
    ...counters,
  };

  console.log(
    `${JOB} Concluído — total: ${result.total}, ` +
    `critical: ${result.critical}, warning: ${result.warning}, ` +
    `healthy: ${result.healthy}, unknown: ${result.unknown}`,
  );

  return result;
}
