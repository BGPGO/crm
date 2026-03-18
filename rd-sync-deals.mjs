/**
 * Sync inteligente de etapas de deals: RD Station → CRM BGPGO
 *
 * REGRA: Para cada deal, compara a etapa no RD vs CRM.
 *   - Se RD está MAIS AVANÇADO → atualiza CRM para a etapa do RD
 *   - Se CRM está MAIS AVANÇADO → mantém CRM (não regride)
 *   - Se deal não existe no CRM → ignora (não cria novos)
 *   - Também atualiza status (OPEN/WON/LOST) se mudou no RD
 *
 * Uso:
 *   node rd-sync-deals.mjs              → sync completo
 *   node rd-sync-deals.mjs --dry-run    → só mostra o que mudaria
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Load RD data ────────────────────────────────────────────────────────────

const deals = JSON.parse(readFileSync('./rd-data/deals.json', 'utf-8'));

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Sync Inteligente de Deals: RD → CRM ${DRY_RUN ? '(DRY RUN)' : ''} ═══\n`);

  // Build stage order map: stageId → order number
  const stages = await prisma.pipelineStage.findMany({
    select: { id: true, name: true, order: true, pipelineId: true },
  });
  const stageOrder = new Map(stages.map(s => [s.id, s.order]));
  const stageName = new Map(stages.map(s => [s.id, s.name]));

  // Load all existing CRM deals with their current stage
  const crmDeals = await prisma.deal.findMany({
    select: { id: true, stageId: true, status: true, pipelineId: true },
  });
  const crmDealMap = new Map(crmDeals.map(d => [d.id, d]));

  console.log(`Deals no RD: ${deals.length}`);
  console.log(`Deals no CRM: ${crmDeals.length}\n`);

  let updated = 0;
  let skippedAhead = 0;
  let skippedSame = 0;
  let notInCrm = 0;
  let statusUpdated = 0;
  const changes = [];

  for (const rdDeal of deals) {
    const dealId = rdDeal._id;
    const crmDeal = crmDealMap.get(dealId);

    // Deal doesn't exist in CRM → skip
    if (!crmDeal) {
      notInCrm++;
      continue;
    }

    const rdStageId = rdDeal.deal_stage?._id;
    const rdStatus = rdDeal.win === true ? 'WON' : rdDeal.win === false ? 'LOST' : 'OPEN';

    // Only process if same pipeline
    if (!rdStageId || !stageOrder.has(rdStageId)) continue;

    const rdOrder = stageOrder.get(rdStageId);
    const crmOrder = stageOrder.get(crmDeal.stageId) ?? 0;

    const updateData = {};

    // Compare stages: only advance, never regress
    if (rdOrder > crmOrder) {
      updateData.stageId = rdStageId;
      changes.push({
        dealId,
        title: rdDeal.name,
        from: stageName.get(crmDeal.stageId) || crmDeal.stageId,
        to: stageName.get(rdStageId) || rdStageId,
        fromOrder: crmOrder,
        toOrder: rdOrder,
      });
    } else if (rdOrder === crmOrder) {
      skippedSame++;
    } else {
      skippedAhead++;
    }

    // Status update: if RD says WON/LOST but CRM says OPEN → update
    if (rdStatus !== crmDeal.status && crmDeal.status === 'OPEN') {
      updateData.status = rdStatus;
      if (rdDeal.closed_at) updateData.closedAt = new Date(rdDeal.closed_at);
      statusUpdated++;
    }

    if (Object.keys(updateData).length > 0) {
      if (!DRY_RUN) {
        await prisma.deal.update({
          where: { id: dealId },
          data: { ...updateData, updatedAt: new Date() },
        });
      }
      updated++;
    }
  }

  // ─── Report ──────────────────────────────────────────────────────────────

  console.log('── Resultado ──\n');

  if (changes.length > 0) {
    console.log('Deals que avançaram de etapa:');
    console.log('─'.repeat(80));
    for (const c of changes) {
      console.log(`  ${c.title}`);
      console.log(`    ${c.from} (${c.fromOrder}) → ${c.to} (${c.toOrder})`);
    }
    console.log('─'.repeat(80));
  }

  console.log(`
  Atualizados (etapa avançou):  ${changes.length}
  Status atualizado (WON/LOST): ${statusUpdated}
  Mantidos (CRM mais avançado):  ${skippedAhead}
  Mesma etapa (sem mudança):     ${skippedSame}
  Não existe no CRM:             ${notInCrm}
  Total processado:              ${deals.length}
  `);

  if (DRY_RUN) {
    console.log('⚠  DRY RUN — nenhuma alteração foi feita. Rode sem --dry-run para aplicar.\n');
  } else {
    console.log('✓ Sync concluído.\n');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
