/**
 * Ativa a cadência No-Show BGP (status PAUSED → ACTIVE).
 *
 * Reproduz o comportamento do endpoint POST /api/automations/:id/activate:
 * - Atualiza status pra ACTIVE
 * - Retoma enrollments cascade-paused (metadata.pausedBy='AUTOMATION_PAUSED')
 * - NÃO retoma enrollments com outras origens (INCIDENT_CLEANUP_2026_05_13
 *   ficam pausados pra sempre — leads queimados não voltam).
 *
 * Após ativação, apenas leads NOVOS que virarem no-show vão entrar na
 * cadência e receber os templates v2 aprovados.
 *
 * Rodar manualmente: npx tsx src/scripts/activateNoShowCadence.ts
 */

import prisma from '../lib/prisma';

const AUTOMATION_ID = 'cmosrxwk30001gyeu6elv7380'; // No-Show BGP

async function main() {
  const auto = await prisma.automation.findUnique({
    where: { id: AUTOMATION_ID },
    select: { id: true, name: true, status: true },
  });
  if (!auto) throw new Error(`Automation ${AUTOMATION_ID} não encontrada`);

  console.log(`Automation: ${auto.name} (status atual: ${auto.status})`);
  if (auto.status === 'ACTIVE') {
    console.log('✓ Já está ACTIVE, nada a fazer.');
    return;
  }
  if (auto.status !== 'PAUSED' && auto.status !== 'DRAFT') {
    throw new Error(`Status ${auto.status} não é ativável (deve ser PAUSED ou DRAFT)`);
  }

  await prisma.automation.update({
    where: { id: AUTOMATION_ID },
    data: { status: 'ACTIVE' },
  });
  console.log('✓ Automation ACTIVE');

  // Retomar enrollments cascade-paused (não há nenhum no caso da No-Show —
  // os 8 que estavam ACTIVE foram marcados como INCIDENT_CLEANUP_2026_05_13)
  const cascadePaused = await prisma.automationEnrollment.findMany({
    where: { automationId: AUTOMATION_ID, status: 'PAUSED' },
    select: { id: true, metadata: true },
  });
  let resumed = 0;
  for (const e of cascadePaused) {
    const meta = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
      ? (e.metadata as Record<string, unknown>)
      : {};
    if (meta.pausedBy !== 'AUTOMATION_PAUSED') continue;
    const { pausedBy, pausedAt, ...rest } = meta;
    await prisma.automationEnrollment.update({
      where: { id: e.id },
      data: {
        status: 'ACTIVE',
        metadata: { ...rest, resumedAt: new Date().toISOString(), resumedFrom: pausedBy },
      },
    });
    resumed++;
  }
  console.log(`✓ ${resumed} enrollments cascade-paused retomados`);
  console.log(`  (${cascadePaused.length - resumed} enrollments PAUSED por outras origens não foram tocados)`);

  console.log('\nCadência ativa — leads novos que virarem no-show entrarão na cadência.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
