/**
 * Wave 2 — Trocar step 3 da "Cadência Lead → Contato Feito — WABA" pra usar
 * cadencia_d1_confirmacao_utility (UTILITY, APPROVED 2026-05-18) no lugar de
 * cadencia_d1_abertura_v3 (MARKETING, failRate 39%).
 *
 * Também marca cadencia_d1_abertura_v3 como DISABLED no banco local.
 * O healthCheck agora preserva DISABLED localmente (fix Beta).
 *
 * DRY-RUN por padrão. Rode com --apply pra aplicar.
 */
import 'dotenv/config';
import prisma from '../lib/prisma';

const OLD_TEMPLATE = 'cadencia_d1_abertura_v3';
const NEW_TEMPLATE = 'cadencia_d1_confirmacao_utility';
const AUTOMATION_NAME = 'Cadência Lead → Contato Feito — WABA';
const STEP_ORDER = 3;

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '═══ APPLY MODE — vai gravar ═══' : '═══ DRY RUN — usar --apply pra gravar ═══');

  // 1. Validar pré-condições
  const newTemplate = await prisma.cloudWaTemplate.findFirst({
    where: { name: NEW_TEMPLATE },
    select: { id: true, status: true, category: true },
  });
  if (!newTemplate) {
    console.error(`✗ Template novo "${NEW_TEMPLATE}" não existe no banco`);
    process.exit(1);
  }
  if (newTemplate.status !== 'APPROVED') {
    console.error(`✗ Template novo "${NEW_TEMPLATE}" não está APPROVED (status=${newTemplate.status}). Abortando.`);
    process.exit(1);
  }
  console.log(`✓ Template novo: ${NEW_TEMPLATE} (${newTemplate.status}, ${newTemplate.category})`);

  // 2. Encontrar o step
  const automation = await prisma.automation.findFirst({
    where: { name: AUTOMATION_NAME },
    select: { id: true, name: true, status: true },
  });
  if (!automation) {
    console.error(`✗ Automação "${AUTOMATION_NAME}" não encontrada`);
    process.exit(1);
  }
  console.log(`✓ Automação: ${automation.name} (${automation.status})`);

  const step = await prisma.automationStep.findFirst({
    where: { automationId: automation.id, order: STEP_ORDER, actionType: 'SEND_WA_TEMPLATE' },
    select: { id: true, order: true, config: true },
  });
  if (!step) {
    console.error(`✗ Step ${STEP_ORDER} não encontrado em "${AUTOMATION_NAME}"`);
    process.exit(1);
  }
  const cfg = step.config as any;
  console.log(`✓ Step ${step.order} (id=${step.id})`);
  console.log(`  config.templateName atual: ${cfg?.templateName}`);
  if (cfg?.templateName !== OLD_TEMPLATE) {
    console.error(`✗ Step ${STEP_ORDER} aponta pra "${cfg?.templateName}", esperado "${OLD_TEMPLATE}". Abortando pra segurança.`);
    process.exit(1);
  }

  // 3. Quantos enrollments ATIVOS estão neste step agora?
  const activeAtStep = await prisma.automationEnrollment.count({
    where: { status: 'ACTIVE', currentStepId: step.id },
  });
  console.log(`  enrollments ATIVOS atualmente no step 3: ${activeAtStep}`);
  console.log(`  (continuam no mesmo step — próximo disparo usa o template novo)`);

  // 4. Estado atual do template antigo
  const oldTemplate = await prisma.cloudWaTemplate.findFirst({
    where: { name: OLD_TEMPLATE },
    select: { id: true, status: true, sentCount7d: true, failRate7d: true },
  });
  if (!oldTemplate) {
    console.warn(`⚠ Template antigo "${OLD_TEMPLATE}" não está no banco`);
  } else {
    console.log(`✓ Template antigo: ${OLD_TEMPLATE} (status=${oldTemplate.status}, sent7d=${oldTemplate.sentCount7d}, fail=${(oldTemplate.failRate7d * 100).toFixed(1)}%)`);
  }

  console.log('\n─── Mudanças planejadas ───');
  console.log(`1. AutomationStep ${step.id}: config.templateName "${OLD_TEMPLATE}" → "${NEW_TEMPLATE}"`);
  console.log(`2. CloudWaTemplate "${OLD_TEMPLATE}": status "${oldTemplate?.status || '?'}" → "DISABLED"`);

  if (!apply) {
    console.log('\n(dry run — rode com --apply pra aplicar)');
    await prisma.$disconnect();
    return;
  }

  // 5. APLICAR — em transação pra ser atômico
  await prisma.$transaction(async (tx) => {
    const newCfg = { ...cfg, templateName: NEW_TEMPLATE };
    await tx.automationStep.update({
      where: { id: step.id },
      data: { config: newCfg },
    });
    console.log(`✓ Step ${step.id} atualizado`);

    if (oldTemplate) {
      await tx.cloudWaTemplate.update({
        where: { id: oldTemplate.id },
        data: { status: 'DISABLED' as any },
      });
      console.log(`✓ Template "${OLD_TEMPLATE}" marcado como DISABLED`);
    }
  });

  // 6. Verificação pós-execução
  const stepAfter = await prisma.automationStep.findUnique({ where: { id: step.id }, select: { config: true } });
  const oldAfter = oldTemplate ? await prisma.cloudWaTemplate.findUnique({ where: { id: oldTemplate.id }, select: { status: true }}) : null;
  console.log('\n─── Pós-execução ───');
  console.log(`Step config.templateName: ${(stepAfter?.config as any)?.templateName}`);
  console.log(`Template antigo status:   ${oldAfter?.status}`);

  await prisma.$disconnect();
  console.log('\n✓ Wave 2 concluída.');
}

main().catch((e) => { console.error(e); process.exit(1); });
