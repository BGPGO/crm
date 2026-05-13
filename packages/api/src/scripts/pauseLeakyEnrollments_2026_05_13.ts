/**
 * Cleanup script — Incidente 2026-05-13
 *
 * Pausa enrollments ACTIVE que ficaram disparando porque a Automation
 * pai estava PAUSED mas o engine não cruzava esse status (bug em
 * automationEngine.ts:195-201). Resultou em 25+ envios MARKETING após
 * a "pausa" de 12/05 12:12, mantendo a quality em YELLOW.
 *
 * Marca explicitamente via metadata.pausedBy = 'INCIDENT_CLEANUP_2026_05_13'
 * para distinguir de enrollments PAUSED por motivos normais (saída de etapa,
 * resposta humana, opt-out, etc).
 *
 * Esses NÃO devem ser retomados automaticamente quando a Automation for
 * reativada — requerem reenrollment manual ou via novo trigger.
 *
 * Rodar com: npx tsx src/scripts/pauseLeakyEnrollments_2026_05_13.ts
 */

import prisma from '../lib/prisma';

async function main() {
  const pausedAutos = await prisma.automation.findMany({
    where: { status: 'PAUSED' },
    select: { id: true, name: true },
  });

  if (pausedAutos.length === 0) {
    console.log('Nenhuma automation PAUSED. Nada a fazer.');
    return;
  }

  const targets = await prisma.automationEnrollment.findMany({
    where: {
      status: 'ACTIVE',
      automationId: { in: pausedAutos.map((a) => a.id) },
    },
    select: {
      id: true,
      automationId: true,
      contact: { select: { name: true, phone: true } },
      metadata: true,
      enrolledAt: true,
    },
  });

  console.log(`Encontrados ${targets.length} enrollments ACTIVE em automations PAUSED.`);
  if (targets.length === 0) return;

  const autoNameById = new Map(pausedAutos.map((a) => [a.id, a.name]));
  for (const t of targets) {
    console.log(`  → ${t.id} | ${t.contact?.name?.padEnd(28) || '?'} | ${t.contact?.phone?.padEnd(22) || '?'} | ${autoNameById.get(t.automationId)}`);
  }

  const pausedAt = new Date().toISOString();
  let updated = 0;
  for (const t of targets) {
    const existingMeta = (t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata))
      ? (t.metadata as Record<string, unknown>)
      : {};
    const newMeta = {
      ...existingMeta,
      pausedBy: 'INCIDENT_CLEANUP_2026_05_13',
      pausedAt,
      reason: 'Automation status=PAUSED but engine did not check it; enrollment kept firing MARKETING templates and contributed to YELLOW quality after 2026-05-11 broadcast incident.',
      previousStatus: 'ACTIVE',
      cleanupRunAt: pausedAt,
    };
    await prisma.automationEnrollment.update({
      where: { id: t.id },
      data: { status: 'PAUSED', metadata: newMeta },
    });
    updated++;
  }

  console.log(`\n✓ ${updated} enrollments marcados como PAUSED com metadata.pausedBy='INCIDENT_CLEANUP_2026_05_13'.`);
  console.log('Para reverter um enrollment específico, busque por metadata->>pausedBy = INCIDENT_CLEANUP_2026_05_13.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
