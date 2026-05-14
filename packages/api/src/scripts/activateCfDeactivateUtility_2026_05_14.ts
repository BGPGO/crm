/**
 * Reativa Contato Feito (CF) WABA + pausa a automação UTILITY de boas-vindas
 * que era placeholder do período pós-incidente — 2026-05-14.
 *
 * - waba_cad_cf: PAUSED → ACTIVE
 *   Retoma enrollments cascade-paused (metadata.pausedBy='AUTOMATION_PAUSED').
 *   Preserva enrollments com outras origens (INCIDENT_CLEANUP, etc).
 *
 * - cmp2lzemd00006mebgg1g9cez (Lead → Boas-vindas UTILITY): ACTIVE → PAUSED
 *   Era placeholder enquanto CF estava pausada. Volta a usar CF agora.
 *
 * Rodar: npx tsx src/scripts/activateCfDeactivateUtility_2026_05_14.ts
 */

import prisma from '../lib/prisma';

const CF_ID = 'waba_cad_cf';
const UTILITY_ID = 'cmp2lzemd00006mebgg1g9cez';

async function main() {
  console.log('═══ Ativar CF + Pausar UTILITY ═══\n');

  // ── 1) Pausar UTILITY primeiro ──
  console.log('▸ Pausando UTILITY Boas-vindas...');
  const util = await prisma.automation.findUnique({
    where: { id: UTILITY_ID },
    select: { name: true, status: true },
  });
  if (!util) throw new Error('UTILITY não encontrada');
  console.log(`  ${util.name} (status atual: ${util.status})`);

  if (util.status !== 'PAUSED') {
    await prisma.automation.update({
      where: { id: UTILITY_ID },
      data: { status: 'PAUSED' },
    });
    // Cascade pause enrollments ACTIVE
    const active = await prisma.automationEnrollment.findMany({
      where: { automationId: UTILITY_ID, status: 'ACTIVE' },
      select: { id: true, metadata: true },
    });
    const pausedAt = new Date().toISOString();
    for (const e of active) {
      const m = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
        ? (e.metadata as Record<string, unknown>) : {};
      await prisma.automationEnrollment.update({
        where: { id: e.id },
        data: { status: 'PAUSED', metadata: { ...m, pausedBy: 'AUTOMATION_PAUSED', pausedAt } },
      });
    }
    console.log(`  ✓ Pausada. ${active.length} enrollments ACTIVE pausados em cascata`);
  } else {
    console.log('  • Já estava PAUSED');
  }

  // ── 2) Ativar CF ──
  console.log('\n▸ Ativando Contato Feito...');
  const cf = await prisma.automation.findUnique({
    where: { id: CF_ID },
    select: { name: true, status: true },
  });
  if (!cf) throw new Error('CF não encontrada');
  console.log(`  ${cf.name} (status atual: ${cf.status})`);

  if (cf.status !== 'ACTIVE') {
    await prisma.automation.update({
      where: { id: CF_ID },
      data: { status: 'ACTIVE' },
    });
    // Retomar enrollments cascade-paused
    const paused = await prisma.automationEnrollment.findMany({
      where: { automationId: CF_ID, status: 'PAUSED' },
      select: { id: true, metadata: true },
    });
    let resumed = 0;
    for (const e of paused) {
      const m = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
        ? (e.metadata as Record<string, unknown>) : {};
      if (m.pausedBy !== 'AUTOMATION_PAUSED') continue;
      const { pausedBy, pausedAt, ...rest } = m;
      await prisma.automationEnrollment.update({
        where: { id: e.id },
        data: {
          status: 'ACTIVE',
          metadata: { ...rest, resumedAt: new Date().toISOString(), resumedFrom: pausedBy },
        },
      });
      resumed++;
    }
    console.log(`  ✓ ACTIVE. ${resumed} enrollments cascade-paused retomados`);
    console.log(`    (${paused.length - resumed} enrollments PAUSED preservados por outras origens)`);
  } else {
    console.log('  • Já estava ACTIVE');
  }

  console.log('\n✓ Concluído.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
