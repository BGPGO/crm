/**
 * Backfill: inscreve leads recentes nas automações email-by-stage que deveriam
 * ter sido ativadas automaticamente mas não foram (problema de deploy/trigger).
 *
 * - Busca todos os deals OPEN que NÃO têm enrollment em email-by-stage
 * - Para cada deal, verifica se existe automação email-by-stage ACTIVE pra essa stage
 * - Cria enrollment se não existir
 * - Seguro para re-rodar (idempotente)
 *
 * Run: npx tsx packages/api/src/seeds/backfillEmailEnrollments.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  // 1. Pegar todas automações email-by-stage ACTIVE
  const emailAutomations = await prisma.automation.findMany({
    where: {
      status: 'ACTIVE',
      triggerConfig: { path: ['kind'], equals: 'email-by-stage' },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  });

  console.log(`📧 ${emailAutomations.length} automações email-by-stage ACTIVE\n`);

  // Map stageId → automation
  const stageToAutomation = new Map<string, typeof emailAutomations[0]>();
  for (const a of emailAutomations) {
    const cfg = a.triggerConfig as Record<string, unknown>;
    const stageId = cfg.stageId as string;
    if (stageId) stageToAutomation.set(stageId, a);
  }

  // 2. Buscar todos os deals OPEN
  const openDeals = await prisma.deal.findMany({
    where: { status: 'OPEN' },
    select: {
      id: true,
      stageId: true,
      contactId: true,
      stage: { select: { name: true } },
      contact: { select: { name: true, email: true } },
    },
  });

  console.log(`📋 ${openDeals.length} deals OPEN no funil\n`);

  let enrolled = 0;
  let skippedNoEmail = 0;
  let skippedAlreadyEnrolled = 0;
  let skippedNoAutomation = 0;

  for (const deal of openDeals) {
    // 3. Tem automação pra essa stage?
    const automation = stageToAutomation.get(deal.stageId);
    if (!automation) {
      skippedNoAutomation++;
      continue;
    }

    // 4. Contact tem email?
    if (!deal.contact?.email) {
      skippedNoEmail++;
      continue;
    }

    // 5. Já tem enrollment ACTIVE/PAUSED pra essa automação?
    const existing = await prisma.automationEnrollment.findFirst({
      where: {
        automationId: automation.id,
        contactId: deal.contactId!,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });
    if (existing) {
      skippedAlreadyEnrolled++;
      continue;
    }

    // 6. Criar enrollment (mesmo padrão do evaluateTriggers)
    const firstStep = automation.steps[0];
    if (!firstStep) continue;

    await prisma.automationEnrollment.create({
      data: {
        automationId: automation.id,
        contactId: deal.contactId!,
        status: 'ACTIVE',
        currentStepId: firstStep.id,
        nextActionAt: new Date(),
      },
    });

    console.log(
      `✅ "${deal.contact.name}" (${deal.contact.email}) → "${automation.name}" [${deal.stage?.name}]`
    );
    enrolled++;
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Inscritos      : ${enrolled}`);
  console.log(`Já inscritos   : ${skippedAlreadyEnrolled}`);
  console.log(`Sem email      : ${skippedNoEmail}`);
  console.log(`Sem automação  : ${skippedNoAutomation}`);
  console.log(`Total deals    : ${openDeals.length}`);

  if (enrolled > 0) {
    console.log(`\n📧 ${enrolled} leads inscritos. O cron de automação (a cada 60s) vai processar os SEND_EMAIL.`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
