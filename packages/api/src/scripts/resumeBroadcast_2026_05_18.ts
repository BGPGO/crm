/**
 * Reprocessa última campanha "contato feito e marcar reuniao":
 *  --reenviar-caphit  → remove tag wa-cap-hit dos 4 + reenvia bi_mobile_com_ia
 *  --adiantar-held    → seta holdUntil=now nos 28 + roda job de release manual
 *  (sem flags = dry-run mostrando o que faria)
 */
import 'dotenv/config';
import prisma from '../lib/prisma';
import { WaMessageService } from '../services/wa/messageService';
import { runReleaseHeldBroadcastContacts } from '../jobs/releaseHeldBroadcastContacts';

const BROADCAST_ID = 'cmpbdf81338w6mmagbttvgmcv';
const CAP_HIT_PHONES = ['5592991143020', '5541988405364', '5598992220830', '5581981507111'];

async function main() {
  const doCapHit = process.argv.includes('--reenviar-caphit');
  const doHeld = process.argv.includes('--adiantar-held');
  const dryRun = !doCapHit && !doHeld;
  if (dryRun) console.log('═══ DRY RUN — use --reenviar-caphit e/ou --adiantar-held pra aplicar ═══\n');

  const broadcast = await prisma.waBroadcast.findUnique({
    where: { id: BROADCAST_ID },
    include: { template: true },
  });
  if (!broadcast || !broadcast.template) { console.error('Broadcast/template não encontrado'); return; }
  console.log(`Broadcast: "${broadcast.name}" | Template: ${broadcast.template.name} (${broadcast.template.category})\n`);

  // ─── PARTE 1: cap-hit reenvio ────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PARTE 1 — Reenvio cap-hit                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const capHitContacts = await prisma.waBroadcastContact.findMany({
    where: { broadcastId: BROADCAST_ID, phone: { in: CAP_HIT_PHONES }, status: 'WA_BC_SKIPPED' as any },
    select: { id: true, phone: true, contactId: true, templateParams: true },
  });
  console.log(`Encontrados ${capHitContacts.length} broadcast contacts SKIPPED com phone em cap-hit\n`);

  for (const bc of capHitContacts) {
    const conv = await prisma.waConversation.findFirst({
      where: { phone: bc.phone },
      select: { id: true, contactId: true },
    });
    const cid = bc.contactId || conv?.contactId || null;
    const contact = cid ? await prisma.contact.findUnique({
      where: { id: cid },
      select: { id: true, name: true, tags: { where: { tag: { name: 'wa-cap-hit' }}, select: { id: true, tagId: true }}},
    }) : null;
    const hasTag = (contact?.tags?.length ?? 0) > 0;
    console.log(`  ${bc.phone}  ${(contact?.name || '?').slice(0,25).padEnd(27)}  tag=${hasTag ? 'SIM' : 'NÃO'}  conv=${conv ? 'ok' : 'FALTA'}`);

    if (!doCapHit) continue;
    if (!conv) { console.log('     ⚠ pulando — sem WaConversation'); continue; }

    try {
      // 1. Remover tag wa-cap-hit
      if (contact && contact.tags.length > 0) {
        await prisma.contactTag.deleteMany({
          where: { contactId: contact.id, tag: { name: 'wa-cap-hit' }},
        });
        console.log('     ✓ tag wa-cap-hit removida');
      }

      // 2. Montar components (replicar lógica do releaseHeldBroadcastContacts:135-154)
      const rawParams = bc.templateParams || broadcast.templateParams;
      const components: any[] = rawParams
        ? Array.isArray(rawParams) ? [...rawParams] : [rawParams as any]
        : [];
      const buttons = broadcast.template.buttons as Array<{ type: string; url?: string }> | null;
      const hasUrlButton = buttons?.some((b) => b.type === 'URL' && b.url?.includes('{{1}}'));
      if (hasUrlButton) {
        const buttonIdx = buttons!.findIndex((b) => b.type === 'URL');
        components.push({
          type: 'button', sub_type: 'url',
          index: buttonIdx >= 0 ? buttonIdx : 0,
          parameters: [{ type: 'text', text: bc.id }],
        });
      }

      // 3. Enviar
      const msg = await WaMessageService.sendTemplate(
        conv.id,
        broadcast.template.name,
        broadcast.template.language || 'pt_BR',
        components,
        { senderType: 'WA_SYSTEM' },
        { isBroadcast: true },
      );

      await prisma.waBroadcastContact.update({
        where: { id: bc.id },
        data: {
          status: 'WA_BC_SENT' as any,
          sentAt: new Date(),
          waMessageId: msg?.waMessageId || null,
          error: null,
          contactId: conv.contactId || bc.contactId,
        },
      });
      await prisma.waBroadcast.update({
        where: { id: BROADCAST_ID },
        data: { sentCount: { increment: 1 }},
      });
      console.log(`     ✓ ENVIADO — waMessageId=${msg?.waMessageId}`);
    } catch (err: any) {
      const errorMsg = (err?.message || 'Erro').slice(0, 200);
      await prisma.waBroadcastContact.update({
        where: { id: bc.id },
        data: { status: 'WA_BC_FAILED' as any, error: errorMsg, failedAt: new Date() },
      });
      console.error(`     ✗ FALHOU: ${errorMsg}`);
    }

    await new Promise((r) => setTimeout(r, 500)); // delay anti-rate
  }

  // ─── PARTE 2: adiantar HELD ──────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PARTE 2 — Adiantar HELD                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const held = await prisma.waBroadcastContact.findMany({
    where: { broadcastId: BROADCAST_ID, status: 'WA_BC_HELD' as any },
    select: { id: true, phone: true, holdUntil: true },
    orderBy: { holdUntil: 'asc' },
  });
  console.log(`${held.length} HELD encontrados`);
  const now = new Date();
  let dueWithin12h = 0, dueWithin24h = 0, dueLater = 0;
  for (const h of held) {
    const hours = h.holdUntil ? (h.holdUntil.getTime() - now.getTime()) / 3600_000 : 0;
    if (hours < 12) dueWithin12h++;
    else if (hours < 24) dueWithin24h++;
    else dueLater++;
  }
  console.log(`  < 12h: ${dueWithin12h}  |  12-24h: ${dueWithin24h}  |  > 24h: ${dueLater}`);

  if (doHeld && held.length > 0) {
    const result = await prisma.waBroadcastContact.updateMany({
      where: { broadcastId: BROADCAST_ID, status: 'WA_BC_HELD' as any },
      data: { holdUntil: now },
    });
    console.log(`✓ holdUntil setado pra ${now.toISOString()} em ${result.count} contatos`);

    console.log('\n→ Rodando runReleaseHeldBroadcastContacts() manualmente...\n');
    const r = await runReleaseHeldBroadcastContacts();
    console.log(`\n✓ Resultado: candidates=${r.candidates} sent=${r.sent} rehold=${r.rehold} failed=${r.failed}`);

    if (r.rehold > 0) {
      console.log(`  (${r.rehold} foram re-segurados porque receberam OUTRA MARKETING durante o hold de hoje)`);
    }
  }

  // ─── Estado final ────────────────────────────────────────────────────────
  console.log('\n─── Estado final do broadcast ───');
  const final = await prisma.waBroadcast.findUnique({
    where: { id: BROADCAST_ID },
    select: { sentCount: true, deliveredCount: true, readCount: true, failedCount: true, totalContacts: true },
  });
  const dist = await prisma.waBroadcastContact.groupBy({
    by: ['status'],
    where: { broadcastId: BROADCAST_ID },
    _count: { id: true },
  });
  console.log(`sentCount: ${final?.sentCount}  deliv: ${final?.deliveredCount}  read: ${final?.readCount}  fail: ${final?.failedCount}`);
  for (const d of dist) console.log(`  ${d.status}: ${d._count.id}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
