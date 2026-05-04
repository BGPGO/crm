/**
 * Seed: AIMO Brand Setup
 *
 * Provisiona infra mínima para a marca AIMO no CRM:
 *   - Pipeline AIMO (isDefault=false, brand=AIMO) com as 7 stages padrão
 *   - Tag "AIMO" (brand=AIMO)
 *   - Segment "AIMO Leads" filtrando contatos com tagId da Tag AIMO
 *
 * Idempotente: pode rodar quantas vezes quiser. Não toca em registros BGP.
 *
 * IMPORTANTE: isDefault=false no Pipeline é obrigatório — webhooks BGP
 * jamais devem rotear para o pipeline AIMO.
 *
 * Uso: npm run seed:aimo --workspace=packages/api
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PIPELINE_ID = 'aimo-pipeline-default';
const SEGMENT_ID = 'aimo-segment-leads';
const TAG_NAME = 'AIMO';

const STAGES: Array<{ name: string; order: number; color: string }> = [
  { name: 'Lead',              order: 0, color: '#1E3FFF' },
  { name: 'Contato Feito',     order: 1, color: '#2563EB' },
  { name: 'Marcar Reunião',    order: 2, color: '#3B82F6' },
  { name: 'Reunião Agendada',  order: 3, color: '#60A5FA' },
  { name: 'Proposta Enviada',  order: 4, color: '#8B5CF6' },
  { name: 'Cliente Desligado', order: 5, color: '#9CA3AF' },
  { name: 'Ganho Fechado',     order: 6, color: '#10B981' },
];

async function main(): Promise<void> {
  console.log('[aimoBrandSetup] iniciando...');

  // 1. Pipeline AIMO
  const pipeline = await prisma.pipeline.upsert({
    where: { id: PIPELINE_ID },
    create: {
      id: PIPELINE_ID,
      name: 'AIMO',
      brand: 'AIMO',
      isDefault: false, // CRÍTICO — não pode quebrar roteamento de webhooks BGP
      stages: {
        create: STAGES,
      },
    },
    update: {}, // se já existe, não sobrescreve nada
    include: { stages: true },
  });

  console.log(
    `[aimoBrandSetup] Pipeline "${pipeline.name}" (id=${pipeline.id}) — stages: ${pipeline.stages.length}`,
  );

  // 2. Tag AIMO
  const tag = await prisma.tag.upsert({
    where: { name: TAG_NAME },
    create: { name: TAG_NAME, color: '#1E3FFF', brand: 'AIMO' },
    update: { brand: 'AIMO' }, // garante brand correto se Tag pré-existente
  });

  console.log(`[aimoBrandSetup] Tag "${tag.name}" (id=${tag.id}) brand=${tag.brand}`);

  // 3. Segment "AIMO Leads"
  const aimoTag = await prisma.tag.findUniqueOrThrow({ where: { name: TAG_NAME } });

  const segment = await prisma.segment.upsert({
    where: { id: SEGMENT_ID },
    create: {
      id: SEGMENT_ID,
      name: 'AIMO Leads',
      description: 'Toda a base de leads AIMO',
      brand: 'AIMO',
      filters: [
        { field: 'tagId', operator: 'EQUALS', value: aimoTag.id },
      ],
    },
    update: {},
  });

  console.log(`[aimoBrandSetup] Segment "${segment.name}" (id=${segment.id})`);

  // 4. Contagens finais
  const [pipelineCount, tagCount, segmentCount] = await Promise.all([
    prisma.pipeline.count({ where: { brand: 'AIMO' } }),
    prisma.tag.count({ where: { brand: 'AIMO' } }),
    prisma.segment.count({ where: { brand: 'AIMO' } }),
  ]);

  console.log('[aimoBrandSetup] resumo brand=AIMO:');
  console.log(`  pipelines: ${pipelineCount}`);
  console.log(`  tags:      ${tagCount}`);
  console.log(`  segments:  ${segmentCount}`);
  console.log('[aimoBrandSetup] concluído com sucesso.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[aimoBrandSetup] FALHOU:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
