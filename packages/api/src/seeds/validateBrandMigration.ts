import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [
    contactTotal, contactBgp,
    dealTotal, dealBgp,
    pipelineTotal, pipelineBgp,
    emailCampaignTotal, emailCampaignBgp,
    emailTemplateTotal, emailTemplateBgp,
    automationTotal, automationBgp,
    tagTotal, tagBgp,
    segmentTotal, segmentBgp,
    waBroadcastTotal, waBroadcastBgp,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { brand: 'BGP' } }),
    prisma.deal.count(),
    prisma.deal.count({ where: { brand: 'BGP' } }),
    prisma.pipeline.count(),
    prisma.pipeline.count({ where: { brand: 'BGP' } }),
    prisma.emailCampaign.count(),
    prisma.emailCampaign.count({ where: { brand: 'BGP' } }),
    prisma.emailTemplate.count(),
    prisma.emailTemplate.count({ where: { brand: 'BGP' } }),
    prisma.automation.count(),
    prisma.automation.count({ where: { brand: 'BGP' } }),
    prisma.tag.count(),
    prisma.tag.count({ where: { brand: 'BGP' } }),
    prisma.segment.count(),
    prisma.segment.count({ where: { brand: 'BGP' } }),
    prisma.waBroadcast.count(),
    prisma.waBroadcast.count({ where: { brand: 'BGP' } }),
  ]);

  const rows = [
    ['Contact',       contactTotal,       contactBgp],
    ['Deal',          dealTotal,          dealBgp],
    ['Pipeline',      pipelineTotal,      pipelineBgp],
    ['EmailCampaign', emailCampaignTotal, emailCampaignBgp],
    ['EmailTemplate', emailTemplateTotal, emailTemplateBgp],
    ['Automation',    automationTotal,    automationBgp],
    ['Tag',           tagTotal,           tagBgp],
    ['Segment',       segmentTotal,       segmentBgp],
    ['WaBroadcast',   waBroadcastTotal,   waBroadcastBgp],
  ];

  console.log('\n┌─────────────────┬─────────┬──────────┬──────────┐');
  console.log('│ Model           │  Total  │  =BGP    │  Status  │');
  console.log('├─────────────────┼─────────┼──────────┼──────────┤');
  let allOk = true;
  for (const [name, total, bgp] of rows) {
    const ok = total === bgp;
    if (!ok) allOk = false;
    console.log(
      `│ ${String(name).padEnd(15)} │ ${String(total).padStart(7)} │ ${String(bgp).padStart(8)} │ ${ok ? '   ✅   ' : '  ❌    '} │`
    );
  }
  console.log('└─────────────────┴─────────┴──────────┴──────────┘\n');

  if (allOk) {
    console.log('✅ Migration aplicada corretamente. Todos os registros existentes têm brand=BGP.\n');
  } else {
    console.log('❌ ATENÇÃO: alguns registros têm brand != BGP. Investigar.\n');
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
