/**
 * Elimina o step 2 (mr_d1_abertura) da cadência Marcar Reunião WABA.
 *
 * Após 4 tentativas rejeitadas pela Meta (subcode 2388299 em todos os
 * bodies/nomes testados), decidido com o usuário em 2026-05-13: o step
 * é eliminado. Cadência passa a começar efetivamente no step 4
 * (reuniao_d2_facilitar_v2, APPROVED), depois dos delays do step 1 e 3.
 *
 * Segurança: verifica se há enrollments com currentStepId apontando pro
 * step 2 e os move pro step seguinte antes de deletar.
 *
 * Rodar: npx tsx src/scripts/deleteMrStep2_2026_05_13.ts
 */

import prisma from '../lib/prisma';

const AUTOMATION_ID = 'cmnfj0071000013sor2cblyyh'; // Marcar Reunião WABA
const STEP_ORDER = 2;

async function main() {
  console.log('═══ Eliminar step 2 — Marcar Reunião WABA ═══\n');

  const steps = await prisma.automationStep.findMany({
    where: { automationId: AUTOMATION_ID },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, actionType: true, config: true },
  });

  if (steps.length === 0) {
    console.log('⚠️  Automation não tem steps');
    return;
  }

  console.log('Steps atuais:');
  for (const s of steps) {
    const cfg = (s.config && typeof s.config === 'object') ? (s.config as any) : {};
    console.log(`  step ${String(s.order).padStart(2)} (${s.id}): ${s.actionType}${cfg.templateName ? ` — ${cfg.templateName}` : ''}${cfg.delayMinutes ? ` (delay ${cfg.delayMinutes}min)` : ''}`);
  }

  const target = steps.find((s) => s.order === STEP_ORDER);
  if (!target) {
    console.log(`\n⚠️  Step order=${STEP_ORDER} não encontrado`);
    return;
  }

  const nextStep = steps.find((s) => s.order > STEP_ORDER);
  console.log(`\nAlvo: step ${target.order} (${target.id})`);
  console.log(`Próximo step a usar pra realocação: step ${nextStep?.order || '(nenhum)'} (${nextStep?.id || '-'})\n`);

  // 1) Enrollments com currentStepId apontando pro alvo
  const enrollmentsOnTarget = await prisma.automationEnrollment.findMany({
    where: { currentStepId: target.id },
    select: { id: true, status: true },
  });
  console.log(`Enrollments com currentStepId=step2: ${enrollmentsOnTarget.length}`);
  for (const e of enrollmentsOnTarget) {
    console.log(`  - ${e.id} (status=${e.status})`);
  }

  if (enrollmentsOnTarget.length > 0) {
    if (!nextStep) {
      console.log('\n⚠️  Step 2 tem enrollments mas não há próximo step pra realocar — abortando');
      return;
    }
    await prisma.automationEnrollment.updateMany({
      where: { currentStepId: target.id },
      data: { currentStepId: nextStep.id },
    });
    console.log(`  ✓ ${enrollmentsOnTarget.length} enrollments realocados pro step ${nextStep.order}`);
  }

  // 2) Logs apontando pro step — mover pro próximo step (stepId é NOT NULL)
  const logsCount = await prisma.automationLog.count({
    where: { stepId: target.id } as any,
  }).catch(() => 0);
  if (logsCount > 0) {
    if (!nextStep) {
      console.log('\n⚠️  Logs apontam pro step mas não há próximo step pra realocar — abortando');
      return;
    }
    console.log(`\nLogs apontando pro step: ${logsCount}`);
    const updated = await prisma.automationLog.updateMany({
      where: { stepId: target.id } as any,
      data: { stepId: nextStep.id } as any,
    });
    console.log(`  ✓ ${updated.count} logs realocados pro step ${nextStep.order}`);
  }

  // 3) Steps que tenham nextStepId/trueStepId/falseStepId apontando pro alvo
  const stepsPointingHere = await prisma.automationStep.findMany({
    where: {
      OR: [
        { nextStepId: target.id },
        { trueStepId: target.id },
        { falseStepId: target.id },
      ],
    },
    select: { id: true, order: true, nextStepId: true, trueStepId: true, falseStepId: true },
  });
  if (stepsPointingHere.length > 0) {
    console.log(`\nSteps apontando pro alvo via nextStepId/trueStepId/falseStepId: ${stepsPointingHere.length}`);
    for (const sp of stepsPointingHere) {
      const fix: any = {};
      if (sp.nextStepId === target.id) fix.nextStepId = nextStep?.id ?? null;
      if (sp.trueStepId === target.id) fix.trueStepId = nextStep?.id ?? null;
      if (sp.falseStepId === target.id) fix.falseStepId = nextStep?.id ?? null;
      await prisma.automationStep.update({ where: { id: sp.id }, data: fix });
      console.log(`  ✓ step ${sp.order} redirecionado`);
    }
  }

  // 4) Deletar o step
  await prisma.automationStep.delete({ where: { id: target.id } });
  console.log(`\n✓ Step ${STEP_ORDER} deletado (${target.id})`);

  // 5) Confirmar estado final
  const finalSteps = await prisma.automationStep.findMany({
    where: { automationId: AUTOMATION_ID },
    orderBy: { order: 'asc' },
    select: { id: true, order: true, actionType: true, config: true },
  });
  console.log('\nEstado final da cadência:');
  for (const s of finalSteps) {
    const cfg = (s.config && typeof s.config === 'object') ? (s.config as any) : {};
    console.log(`  step ${String(s.order).padStart(2)}: ${s.actionType}${cfg.templateName ? ` — ${cfg.templateName}` : ''}${cfg.delayMinutes ? ` (delay ${cfg.delayMinutes}min)` : ''}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
