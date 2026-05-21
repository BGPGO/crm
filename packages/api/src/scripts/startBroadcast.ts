/**
 * Inicia um broadcast WABA por ID — uso primário: Coolify Scheduled Task.
 *
 * Usa optimistic lock pra evitar dupla execução (concorrência com a API).
 * Roda a loop síncrona via services/wa/broadcastExecutor → não precisa de HTTP/auth.
 *
 * Uso: node dist/scripts/startBroadcast.js <broadcastId>
 */
import 'dotenv/config';
import prisma from '../lib/prisma';
import { runBroadcastLoop } from '../services/wa/broadcastExecutor';

async function main() {
  const broadcastId = process.argv[2];
  if (!broadcastId) {
    console.error('Uso: node dist/scripts/startBroadcast.js <broadcastId>');
    process.exit(1);
  }

  const broadcast = await prisma.waBroadcast.findUnique({
    where: { id: broadcastId },
    include: { template: { select: { name: true, status: true, category: true } } },
  });
  if (!broadcast) {
    console.error(`Broadcast ${broadcastId} não encontrado`);
    process.exit(1);
  }

  console.log(`[startBroadcast] ${broadcast.name} — status=${broadcast.status}, template=${broadcast.template?.name}`);

  if (broadcast.status === 'WA_SENDING') {
    console.error('Broadcast já está em execução em outro processo');
    process.exit(1);
  }
  if (broadcast.status === 'WA_COMPLETED') {
    console.error('Broadcast já foi concluído');
    process.exit(1);
  }
  if (!broadcast.template || broadcast.template.status !== 'APPROVED') {
    console.error(`Template não aprovado (status=${broadcast.template?.status})`);
    process.exit(1);
  }

  // Bloqueio MARKETING fora de GREEN (mesmo guard da rota)
  if (broadcast.template.category === 'MARKETING') {
    const config = await prisma.cloudWaConfig.findFirst({ select: { qualityRating: true } });
    if (config?.qualityRating !== 'GREEN') {
      console.error(`Bloqueado: qualityRating=${config?.qualityRating} (precisa GREEN pra MARKETING)`);
      process.exit(1);
    }
  }

  // Optimistic lock — só transiciona se ainda não está em SENDING
  const claimed = await prisma.waBroadcast.updateMany({
    where: { id: broadcastId, status: { not: 'WA_SENDING' } },
    data: { status: 'WA_SENDING', startedAt: new Date(), pausedAt: null },
  });
  if (claimed.count === 0) {
    console.error('Não conseguiu travar o broadcast (outro processo pegou primeiro)');
    process.exit(1);
  }

  console.log(`[startBroadcast] ${broadcastId} marcado como WA_SENDING. Iniciando loop...`);

  try {
    const result = await runBroadcastLoop(broadcastId);
    console.log(`[startBroadcast] CONCLUÍDO: ${result.sentCount} enviadas, status=${result.finalStatus}`);
    await prisma.$disconnect();
    process.exit(0);
  } catch (err: any) {
    console.error(`[startBroadcast] ERRO no loop:`, err?.message || err);
    await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: { status: 'WA_PAUSED', pausedAt: new Date() },
    });
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
