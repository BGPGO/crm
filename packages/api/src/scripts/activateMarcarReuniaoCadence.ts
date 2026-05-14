/**
 * Ativa a cadência Marcar Reunião WABA (status PAUSED → ACTIVE).
 *
 * Reproduz o comportamento do endpoint POST /api/automations/:id/activate.
 *
 * Rodar: npx tsx src/scripts/activateMarcarReuniaoCadence.ts
 */

import prisma from '../lib/prisma';

const AUTOMATION_ID = 'cmnfj0071000013sor2cblyyh'; // Marcar Reunião WABA

async function main() {
  const auto = await prisma.automation.findUnique({
    where: { id: AUTOMATION_ID },
    select: { id: true, name: true, status: true },
  });
  if (!auto) throw new Error(`Automation ${AUTOMATION_ID} não encontrada`);

  console.log(`Automation: ${auto.name} (status atual: ${auto.status})`);
  if (auto.status === 'ACTIVE') {
    console.log('✓ Já está ACTIVE.');
    return;
  }

  await prisma.automation.update({
    where: { id: AUTOMATION_ID },
    data: { status: 'ACTIVE' },
  });
  console.log('✓ Automation ACTIVE');

  const paused = await prisma.automationEnrollment.findMany({
    where: { automationId: AUTOMATION_ID, status: 'PAUSED' },
    select: { id: true, metadata: true },
  });
  let resumed = 0;
  for (const e of paused) {
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
  console.log(`  (${paused.length - resumed} enrollments PAUSED preservados por outras origens)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
