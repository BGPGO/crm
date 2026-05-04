import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  VALIDAÇÃO DE ISOLAMENTO AIMO/BGP');
  console.log('══════════════════════════════════════════════════════\n');

  // ─── 1. CONTAGENS ───────────────────────────────────────────────
  const [
    contactBgp, contactAimo,
    dealBgp, dealAimo,
    pipelineBgp, pipelineAimo,
    tagBgp, tagAimo,
    segmentBgp, segmentAimo,
    templateBgp, templateAimo,
    automationBgp, automationAimo,
  ] = await Promise.all([
    prisma.contact.count({ where: { brand: 'BGP' }}),
    prisma.contact.count({ where: { brand: 'AIMO' }}),
    prisma.deal.count({ where: { brand: 'BGP' }}),
    prisma.deal.count({ where: { brand: 'AIMO' }}),
    prisma.pipeline.count({ where: { brand: 'BGP' }}),
    prisma.pipeline.count({ where: { brand: 'AIMO' }}),
    prisma.tag.count({ where: { brand: 'BGP' }}),
    prisma.tag.count({ where: { brand: 'AIMO' }}),
    prisma.segment.count({ where: { brand: 'BGP' }}),
    prisma.segment.count({ where: { brand: 'AIMO' }}),
    prisma.emailTemplate.count({ where: { brand: 'BGP' }}),
    prisma.emailTemplate.count({ where: { brand: 'AIMO' }}),
    prisma.automation.count({ where: { brand: 'BGP' }}),
    prisma.automation.count({ where: { brand: 'AIMO' }}),
  ]);

  console.log('┌─────────────────┬─────────┬─────────┐');
  console.log('│ Model           │   BGP   │  AIMO   │');
  console.log('├─────────────────┼─────────┼─────────┤');
  const rows: [string, number, number][] = [
    ['Contact',       contactBgp,       contactAimo],
    ['Deal',          dealBgp,          dealAimo],
    ['Pipeline',      pipelineBgp,      pipelineAimo],
    ['Tag',           tagBgp,           tagAimo],
    ['Segment',       segmentBgp,       segmentAimo],
    ['EmailTemplate', templateBgp,      templateAimo],
    ['Automation',    automationBgp,    automationAimo],
  ];
  for (const [name, bgp, aimo] of rows) {
    console.log(`│ ${name.padEnd(15)} │ ${String(bgp).padStart(7)} │ ${String(aimo).padStart(7)} │`);
  }
  console.log('└─────────────────┴─────────┴─────────┘\n');

  // ─── 2. SMOKE: campanha BGP "Todos os contatos" ──────────────
  console.log('▸ SMOKE 1 — campanha BGP "Todos os contatos" (modo "all")');
  const bgpAllRecipients = await prisma.contact.count({
    where: { email: { not: null }, brand: 'BGP' },
  });
  const totalRecipients = await prisma.contact.count({
    where: { email: { not: null } },
  });
  const aimoLeak = totalRecipients - bgpAllRecipients;
  console.log(`  destinatários BGP (com email): ${bgpAllRecipients}`);
  console.log(`  total c/ email no DB:          ${totalRecipients}`);
  console.log(`  diferença (deve = ${contactAimo}, caso inclua AIMO com email):  ${aimoLeak}`);
  if (aimoLeak === contactAimo) {
    console.log(`  ✅ filtro brand=BGP exclui exatamente os ${contactAimo} contatos AIMO\n`);
  } else if (aimoLeak === 0 && contactAimo === 0) {
    console.log(`  ✅ sem AIMO ainda, sem vazamento possível\n`);
  } else {
    console.log(`  ⚠️ inesperado — investigar\n`);
  }

  // ─── 3. SMOKE: kanban BGP (Funil Padrão) não inclui Deals AIMO ──
  console.log('▸ SMOKE 2 — Kanban BGP (Funil Padrão)');
  const defaultPipeline = await prisma.pipeline.findFirst({ where: { isDefault: true }});
  if (defaultPipeline) {
    const dealsBgpDefault = await prisma.deal.count({
      where: { pipelineId: defaultPipeline.id, brand: 'BGP' },
    });
    const dealsAimoInDefault = await prisma.deal.count({
      where: { pipelineId: defaultPipeline.id, brand: 'AIMO' },
    });
    console.log(`  Pipeline default: "${defaultPipeline.name}" (brand=${defaultPipeline.brand})`);
    console.log(`  Deals BGP no default:  ${dealsBgpDefault}`);
    console.log(`  Deals AIMO no default: ${dealsAimoInDefault}`);
    if (dealsAimoInDefault === 0) {
      console.log(`  ✅ Funil Padrão BGP isolado — zero deals AIMO\n`);
    } else {
      console.log(`  ❌ ALERTA: deals AIMO vazaram pro Funil Padrão!\n`);
    }
  }

  // ─── 4. SMOKE: Pipeline AIMO existe e tem 7 stages ──────────────
  console.log('▸ SMOKE 3 — Pipeline AIMO infra');
  const aimoPipeline = await prisma.pipeline.findUnique({
    where: { id: 'aimo-pipeline-default' },
    include: { stages: { orderBy: { order: 'asc' }}, _count: { select: { deals: true }}},
  });
  if (aimoPipeline) {
    console.log(`  Pipeline AIMO: ${aimoPipeline.name} (brand=${aimoPipeline.brand}, isDefault=${aimoPipeline.isDefault})`);
    console.log(`  Stages: ${aimoPipeline.stages.map(s => s.name).join(' → ')}`);
    console.log(`  Deals atrelados: ${aimoPipeline._count.deals}`);
    if (!aimoPipeline.isDefault && aimoPipeline.brand === 'AIMO' && aimoPipeline.stages.length === 7) {
      console.log(`  ✅ Pipeline AIMO OK\n`);
    } else {
      console.log(`  ⚠️ Pipeline AIMO com config inesperada\n`);
    }
  } else {
    console.log(`  ❌ Pipeline AIMO não encontrado\n`);
  }

  // ─── 5. SMOKE: contacts AIMO têm tag AIMO aplicada ──────────────
  console.log('▸ SMOKE 4 — Tag AIMO aplicada em contacts AIMO');
  const aimoTag = await prisma.tag.findUnique({ where: { name: 'AIMO' }});
  if (aimoTag) {
    const taggedAimo = await prisma.contactTag.count({
      where: { tagId: aimoTag.id },
    });
    console.log(`  Contacts com tag AIMO: ${taggedAimo} (esperado >= ${contactAimo})`);
    if (taggedAimo >= contactAimo && contactAimo > 0) {
      console.log(`  ✅ Todos contatos AIMO importados receberam a tag\n`);
    }
  }

  // ─── 6. SMOKE: Segment "AIMO Leads" retorna os contacts ─────────
  console.log('▸ SMOKE 5 — Segment "AIMO Leads"');
  const aimoSegment = await prisma.segment.findUnique({
    where: { id: 'aimo-segment-leads' },
  });
  if (aimoSegment) {
    console.log(`  Segment: "${aimoSegment.name}" (brand=${aimoSegment.brand})`);
    const segmentContacts = await prisma.contact.count({
      where: {
        brand: 'AIMO',
        tags: { some: { tagId: aimoTag?.id }},
        email: { not: null },
      },
    });
    console.log(`  Contacts que matcheriam o filtro (brand=AIMO + tag=AIMO + email != null): ${segmentContacts}`);
    if (segmentContacts === contactAimo) {
      console.log(`  ✅ Segment cobre todos os ${contactAimo} contatos AIMO\n`);
    }
  }

  // ─── 7. SMOKE: nenhuma automation AIMO existe ──────────────────
  console.log('▸ SMOKE 6 — Nenhuma automation AIMO ativa (deve ficar parado)');
  console.log(`  Automations AIMO no DB: ${automationAimo}`);
  if (automationAimo === 0) {
    console.log(`  ✅ Nenhuma automation AIMO criada — base AIMO fica completamente parada\n`);
  } else {
    console.log(`  ℹ Existem ${automationAimo} automations AIMO. Confirme se eram esperadas.\n`);
  }

  console.log('══════════════════════════════════════════════════════');
  console.log('  VALIDAÇÃO CONCLUÍDA');
  console.log('══════════════════════════════════════════════════════\n');
}

main()
  .catch(e => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
