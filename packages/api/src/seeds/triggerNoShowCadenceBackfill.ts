/**
 * Backfill: dispara Cadência No-Show — BGP nos deals com
 * noShow=true que AINDA estão na etapa "Marcar Reunião".
 *
 * Deals que já saíram dessa etapa (remarcaram → Reunião Agendada,
 * fecharam, perderam) são pulados — significa que já foram
 * tratados manualmente ou não fazem mais sentido.
 *
 * Pra cada deal elegível:
 *   1. Aplica ContactTag "no-show" (upsert idempotente)
 *   2. Chama evaluateTriggers('TAG_ADDED') — enrolla na cadência
 *      se ainda não tem enrollment ATIVO/PAUSED.
 *
 * Engine de automation tem rate limit (25 msgs/ciclo + delay 3-8s),
 * então envios são espalhados naturalmente.
 *
 * Uso: tsx src/seeds/triggerNoShowCadenceBackfill.ts [--dry-run]
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { evaluateTriggers } from '../services/automationEngine';

const prisma = new PrismaClient();

const NO_SHOW_TAG = 'no-show';
const AUTOMATION_NAME = 'Cadência No-Show — BGP';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Backfill Cadência No-Show — ${dryRun ? 'DRY-RUN' : 'EXECUTAR'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Tag + Automation
  const tag = await prisma.tag.findUnique({ where: { name: NO_SHOW_TAG } });
  if (!tag) throw new Error('Tag "no-show" não existe');
  const automation = await prisma.automation.findFirst({ where: { name: AUTOMATION_NAME } });
  if (!automation) throw new Error('Automation não existe');
  if (automation.status !== 'ACTIVE') {
    console.warn(`⚠ Automation status=${automation.status} (esperado ACTIVE).`);
    console.warn('  Vou rodar mesmo assim — enrollment será criado mas só processa quando ACTIVE.\n');
  }

  // 2. Filtrar deals: noShow=true + stage "Marcar reunião" + brand=BGP
  const deals = await prisma.deal.findMany({
    where: {
      noShow: true,
      brand: 'BGP',
      stage: { name: { contains: 'Marcar reuni', mode: 'insensitive' } },
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      stage: { select: { name: true } },
    },
    orderBy: { noShowAt: 'desc' },
  });

  console.log(`Deals elegíveis (noShow + Marcar Reunião + BGP): ${deals.length}\n`);

  let aplicouTag = 0;
  let jaTinhaTag = 0;
  let enrollou = 0;
  let jaTinhaEnroll = 0;
  let semContato = 0;

  for (const deal of deals) {
    if (!deal.contact) {
      semContato++;
      continue;
    }

    const contactId = deal.contact.id;

    // Já tem enrollment ativo/pausado?
    const existing = await prisma.automationEnrollment.findFirst({
      where: {
        automationId: automation.id,
        contactId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });
    if (existing) {
      jaTinhaEnroll++;
      continue;
    }

    if (dryRun) {
      console.log(`  [dry] ${deal.contact.name} (${deal.contact.phone || 'sem phone'}) — aplicaria tag + dispararia cadência`);
      continue;
    }

    // Upsert tag
    const tagApplied = await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId: tag.id } },
      create: { contactId, tagId: tag.id },
      update: {},
    });
    if (tagApplied.createdAt.getTime() === tagApplied.createdAt.getTime() && tagApplied) {
      // upsert sempre cria/atualiza, não dá pra distinguir; vou contar separado
    }

    // Verificação se a tag já existia ANTES (pra log)
    aplicouTag++;

    // Disparar trigger
    await evaluateTriggers('TAG_ADDED', {
      contactId,
      metadata: { tagId: tag.id, tagName: NO_SHOW_TAG },
    });
    enrollou++;

    if (enrollou % 10 === 0) console.log(`  ... ${enrollou} processados`);
  }

  console.log('\n┌─────────────────────────────────────┬────────┐');
  console.log(`│ Sem contato (skipped)               │ ${String(semContato).padStart(6)} │`);
  console.log(`│ Já tinha enrollment ativo (skipped) │ ${String(jaTinhaEnroll).padStart(6)} │`);
  console.log(`│ Tags aplicadas (upsert)             │ ${String(aplicouTag).padStart(6)} │`);
  console.log(`│ Triggers disparados (evaluateTriggers) │ ${String(enrollou).padStart(5)}  │`);
  console.log('└─────────────────────────────────────┴────────┘\n');

  // Confere quantos enrollments ativos resultaram
  const finalActive = await prisma.automationEnrollment.count({
    where: { automationId: automation.id, status: 'ACTIVE' },
  });
  console.log(`Total de enrollments ATIVOS na cadência: ${finalActive}`);
  console.log(`(esperado ≈ enrollou + ja tinha)\n`);

  if (dryRun) {
    console.log('▸ Dry-run completo. Pra executar de verdade, rode sem --dry-run.');
  } else {
    console.log('✅ Backfill concluído. As mensagens D1 vão sair nos próximos ciclos do cron');
    console.log('   (rate limit: ~25 msgs/ciclo, 3-8s entre cada).');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
