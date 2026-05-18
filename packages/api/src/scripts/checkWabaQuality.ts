/**
 * Checa qualidade WABA: DB local vs Meta em tempo real
 * Uso: cd packages/api && npx tsx src/scripts/checkWabaQuality.ts
 */
import 'dotenv/config';
import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

async function main() {
  const config = await prisma.cloudWaConfig.findFirst();
  if (!config) {
    console.log('Sem CloudWaConfig no banco');
    return;
  }

  console.log('─── DB (cache) ───');
  console.log('phoneNumberId   :', config.phoneNumberId);
  console.log('wabaId          :', config.wabaId);
  console.log('isActive        :', config.isActive);
  console.log('qualityRating   :', config.qualityRating);
  console.log('messagingTier   :', config.messagingTier);
  console.log('phoneStatus     :', config.phoneStatus);
  console.log('updatedAt       :', config.updatedAt);

  console.log('\n─── Meta (tempo real) ───');
  try {
    const client = await WhatsAppCloudClient.fromDB();
    const status = await client.getPhoneStatus();
    console.log(JSON.stringify(status, null, 2));

    const drift =
      status.quality_rating !== config.qualityRating ||
      status.status !== config.phoneStatus ||
      status.messaging_limit_tier !== config.messagingTier;
    console.log('\n─── Diff ───');
    console.log('quality_rating cache=', config.qualityRating, ' meta=', status.quality_rating);
    console.log('status         cache=', config.phoneStatus,   ' meta=', status.status);
    console.log('messaging_tier cache=', config.messagingTier, ' meta=', status.messaging_limit_tier);
    console.log('Drift?', drift);

    if (process.argv.includes('--sync')) {
      await prisma.cloudWaConfig.update({
        where: { id: config.id },
        data: {
          qualityRating: status.quality_rating || config.qualityRating,
          messagingTier: status.messaging_limit_tier || config.messagingTier,
          phoneStatus: status.status || config.phoneStatus,
        },
      });
      console.log('\n✓ Cache sincronizado com Meta');
    } else {
      console.log('\n(rode com --sync pra atualizar o cache do banco)');
    }
  } catch (err: any) {
    console.error('Erro ao consultar Meta:', err.response?.data || err.message);
  }

  await prisma.$disconnect();
}

main();
