/**
 * Checa status do template cadencia_d1_confirmacao_utility — DB + Meta tempo real.
 */
import 'dotenv/config';
import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

async function main() {
  const NAME = 'cadencia_d1_confirmacao_utility';

  const local = await prisma.cloudWaTemplate.findFirst({
    where: { name: NAME },
    select: {
      name: true, status: true, category: true, metaTemplateId: true,
      qualityScore: true, rejectedReason: true, updatedAt: true, createdAt: true,
    },
  });
  console.log('─── DB local ───');
  console.log(JSON.stringify(local, null, 2));

  console.log('\n─── Meta tempo real ───');
  try {
    const client = await WhatsAppCloudClient.fromDB();
    const meta = local?.metaTemplateId
      ? await client.getTemplate(local.metaTemplateId)
      : (await client.listTemplates({ name: NAME })).data.find((t: any) => t.name === NAME);
    if (!meta) {
      console.log('Template não encontrado na Meta');
    } else {
      console.log(JSON.stringify(meta, null, 2));
    }

    if (meta && local && meta.status !== local.status) {
      console.log(`\n⚠️  Drift: DB=${local.status} Meta=${meta.status} — vou sincronizar`);
      await prisma.cloudWaTemplate.update({
        where: { id: (await prisma.cloudWaTemplate.findFirst({ where: { name: NAME }, select: { id: true }}))!.id },
        data: {
          status: meta.status as any,
          category: meta.category as any,
          qualityScore: meta.quality_score?.score || null,
          rejectedReason: meta.rejected_reason || null,
        },
      });
      console.log('✓ Sincronizado');
    }
  } catch (err: any) {
    console.error('Erro Meta:', err.response?.data || err.message);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
