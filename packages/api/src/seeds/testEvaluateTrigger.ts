import { PrismaClient } from '@prisma/client';
import { evaluateTriggers } from '../services/automationEngine';

const prisma = new PrismaClient();

async function test() {
  // Usar André (entrou em Contato feito, sem enrollment email)
  const contact = await prisma.contact.findFirst({
    where: { email: 'andreefilho01@gmail.com' },
    select: { id: true, name: true },
  });
  if (!contact) { console.log('Contact not found'); return; }

  const deal = await prisma.deal.findFirst({
    where: { contactId: contact.id },
    select: { id: true, stageId: true, stage: { select: { name: true } } },
  });
  if (!deal) { console.log('Deal not found'); return; }

  console.log('Contact:', contact.id, contact.name);
  console.log('Deal stage:', deal.stage!.name, '(' + deal.stageId + ')');

  // Enrollment ANTES
  const before = await prisma.automationEnrollment.count({
    where: { contactId: contact.id, automation: { triggerConfig: { path: ['kind'], equals: 'email-by-stage' } } },
  });
  console.log('Enrollments email-by-stage ANTES:', before);

  // Chamar evaluateTriggers
  console.log('\n>>> evaluateTriggers STAGE_CHANGED...');
  await evaluateTriggers('STAGE_CHANGED', {
    contactId: contact.id,
    metadata: { stageId: deal.stageId, dealId: deal.id },
  });

  // Enrollment DEPOIS
  const after = await prisma.automationEnrollment.findMany({
    where: { contactId: contact.id, automation: { triggerConfig: { path: ['kind'], equals: 'email-by-stage' } } },
    include: { automation: { select: { name: true } } },
  });
  console.log('\nEnrollments email-by-stage DEPOIS:', after.length);
  for (const e of after) {
    console.log('  ✅', e.automation.name, 'status=' + e.status);
  }

  if (after.length === 0) {
    console.log('  🔴 ZERO — mostrando todas automations STAGE_CHANGED ACTIVE:');
    const all = await prisma.automation.findMany({
      where: { status: 'ACTIVE', triggerType: 'STAGE_CHANGED' },
      select: { name: true, triggerConfig: true },
    });
    for (const a of all) {
      const cfg = a.triggerConfig as Record<string, unknown>;
      const match = cfg?.stageId === deal.stageId;
      console.log(`  ${match ? '✅' : '❌'} "${a.name}" stageId=${cfg?.stageId} match=${match} kind=${cfg?.kind}`);
    }
  }

  await prisma.$disconnect();
}

test().catch(err => { console.error(err); process.exit(1); });
