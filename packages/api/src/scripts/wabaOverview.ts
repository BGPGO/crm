/**
 * Panorama WABA: últimas conversas, mensagens, broadcasts, templates, erros.
 */
import 'dotenv/config';
import prisma from '../lib/prisma';

async function main() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today = new Date(now); today.setHours(0, 0, 0, 0);

  const totalLast7d = await prisma.waMessage.count({ where: { createdAt: { gte: last7d } } });
  const inbound24h = await prisma.waMessage.count({
    where: { createdAt: { gte: last24h }, direction: 'INBOUND' },
  });
  const outbound24h = await prisma.waMessage.count({
    where: { createdAt: { gte: last24h }, direction: 'OUTBOUND' },
  });
  const templates24h = await prisma.waMessage.count({
    where: { createdAt: { gte: last24h }, direction: 'OUTBOUND', type: 'TEMPLATE' },
  });
  const text24h = await prisma.waMessage.count({
    where: { createdAt: { gte: last24h }, direction: 'OUTBOUND', type: 'TEXT' },
  });
  const today_templates = await prisma.waMessage.count({
    where: { createdAt: { gte: today }, direction: 'OUTBOUND', type: 'TEMPLATE' },
  });

  console.log('═══ Volume 24h / 7d ═══');
  console.log(`Últimas 24h: ${inbound24h} recebidas, ${outbound24h} enviadas (${templates24h} templates, ${text24h} texto)`);
  console.log(`Templates hoje (business-initiated): ${today_templates}`);
  console.log(`Total últimos 7d: ${totalLast7d}`);

  const activeConvs = await prisma.waConversation.count({
    where: { lastMessageAt: { gte: last24h } },
  });
  const open = await prisma.waConversation.count({ where: { status: 'WA_OPEN' } });
  const optedOut = await prisma.waConversation.count({ where: { optedOut: true } });
  const needsAttention = await prisma.waConversation.count({ where: { needsHumanAttention: true } });
  const meetingBooked = await prisma.waConversation.count({ where: { meetingBooked: true } });

  console.log(`\n═══ Conversas ═══`);
  console.log(`Ativas últimas 24h: ${activeConvs}`);
  console.log(`Status OPEN: ${open}  |  OptedOut: ${optedOut}  |  Precisa humano: ${needsAttention}  |  Reunião agendada: ${meetingBooked}`);

  const latest = await prisma.waMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      direction: true, type: true, status: true, createdAt: true,
      templateName: true, body: true, errorCode: true, errorMessage: true,
      conversation: { select: { phone: true, pushName: true, contact: { select: { name: true } } } },
    },
  });
  console.log('\n═══ Últimas 15 mensagens ═══');
  for (const m of latest) {
    const dt = new Date(m.createdAt).toISOString().replace('T', ' ').slice(0, 16);
    const dir = m.direction === 'INBOUND' ? '←' : '→';
    const who = (m.conversation?.contact?.name || m.conversation?.pushName || m.conversation?.phone || '?').slice(0, 22);
    const content = m.type === 'TEMPLATE' ? `[${m.templateName}]` : (m.body || '').replace(/\s+/g, ' ').slice(0, 70);
    const status = (m.status || '-').replace('WA_', '');
    const err = m.errorCode ? `  ERR:${m.errorCode}` : '';
    console.log(`${dt}  ${dir} ${m.type.padEnd(8)} ${status.padEnd(10)} ${who.padEnd(24)} ${content}${err}`);
  }

  const failures = await prisma.waMessage.findMany({
    where: {
      direction: 'OUTBOUND',
      OR: [{ status: 'WA_FAILED' as any }, { errorCode: { not: null } }],
      createdAt: { gte: last7d },
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      createdAt: true, errorCode: true, errorMessage: true, templateName: true,
      conversation: { select: { phone: true, pushName: true, contact: { select: { name: true } } } },
    },
  });
  const totalFails = await prisma.waMessage.count({
    where: {
      direction: 'OUTBOUND',
      OR: [{ status: 'WA_FAILED' as any }, { errorCode: { not: null } }],
      createdAt: { gte: last7d },
    },
  });
  console.log(`\n═══ Falhas últimos 7d (total ${totalFails}) ═══`);
  for (const f of failures) {
    const dt = new Date(f.createdAt).toISOString().slice(0, 16).replace('T', ' ');
    const who = (f.conversation?.contact?.name || f.conversation?.pushName || f.conversation?.phone || '?').slice(0, 22);
    console.log(`${dt}  ${(f.errorCode || '-').toString().padEnd(8)} ${(f.templateName || '-').padEnd(28)} ${who.padEnd(22)} ${(f.errorMessage || '').slice(0, 50)}`);
  }

  // Erros agregados
  const errAgg = await prisma.$queryRaw<Array<{ errorCode: string; count: bigint }>>`
    SELECT "errorCode", COUNT(*)::bigint as count
    FROM "WaMessage"
    WHERE direction = 'OUTBOUND' AND "errorCode" IS NOT NULL
      AND "createdAt" >= ${last7d}
    GROUP BY "errorCode"
    ORDER BY count DESC
  `;
  console.log('\n═══ Distribuição de erros 7d ═══');
  for (const e of errAgg) console.log(`  ${e.errorCode}: ${e.count}`);

  const tmplGroup = await prisma.cloudWaTemplate.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  console.log('\n═══ Templates por status ═══');
  for (const t of tmplGroup) console.log(`  ${t.status}: ${t._count.id}`);

  const tmplLast = await prisma.cloudWaTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 12,
    select: { name: true, status: true, category: true, language: true, updatedAt: true, rejectedReason: true, healthFlag: true, failRate7d: true, sentCount7d: true },
  });
  console.log('\n═══ Templates mais recentes ═══');
  for (const t of tmplLast) {
    const dt = new Date(t.updatedAt).toISOString().slice(0, 10);
    const reason = t.rejectedReason ? `  ✗ ${t.rejectedReason}` : (t.healthFlag ? `  ⚠ ${t.healthFlag}` : '');
    console.log(`${dt}  ${t.name.padEnd(40)} ${t.status.padEnd(12)} ${t.category.padEnd(10)} ${t.language}${reason}`);
  }

  const broadcasts = await prisma.waBroadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  }).catch(() => []);
  console.log('\n═══ Broadcasts recentes ═══');
  for (const b of broadcasts as any[]) {
    const dt = new Date(b.createdAt).toISOString().slice(0, 10);
    console.log(`${dt}  ${(b.name || b.id).slice(0, 35).padEnd(36)} ${(b.status || '').padEnd(10)} env:${b.sentCount ?? '-'}/${b.recipientCount ?? '-'} entr:${b.deliveredCount ?? '-'} lid:${b.readCount ?? '-'} fail:${b.failedCount ?? '-'}`);
  }

  const followups = await prisma.waFollowUpState.groupBy({
    by: ['status'],
    _count: { id: true },
  }).catch(() => []);
  console.log('\n═══ FollowUpState (cadências) ═══');
  for (const f of followups as any[]) console.log(`  ${f.status}: ${f._count.id}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
