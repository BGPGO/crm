/**
 * Opt-out manual de 6 contatos frios — decisão 2026-05-14.
 *
 * Contatos identificados na auditoria dos enrollments PAUSED da No-Show:
 * - Nunca responderam ativamente E pegaram erros 131049 (5 contatos)
 * - OU só enviaram auto-respostas, sem engajamento real (1 contato)
 *
 * Ação:
 * 1. Marca WaConversation.optedOut=true + optedOutAt=now (dual-model: também
 *    WhatsAppConversation se existir)
 * 2. Status da conversa → WA_CLOSED
 * 3. Enrollments dos contatos: status → COMPLETED com metadata clara
 *    pra reversão futura caso necessário
 *
 * Reversível: basta filtrar por metadata.deactivatedReason e reverter.
 *
 * Rodar: npx tsx src/scripts/optOutColdContacts_2026_05_14.ts
 */

import prisma from '../lib/prisma';

const TARGETS = [
  { name: 'Lisiane', phoneLast10: '5194070790', note: 'never_responded_2_err131049' },
  { name: 'Augusto', phoneLast10: '4198840536', note: 'never_responded_3_err131049' },
  { name: 'Ruy Moura', phoneLast10: '8198150711', note: 'never_responded_2_err131049' },
  { name: 'Wilian', phoneLast10: '4899117553', note: 'never_responded_1_err131049' },
  { name: 'David Amorim', phoneLast10: '7198526974', note: 'never_responded_4_err131049' },
  { name: 'Eric Schatz', phoneLast10: '4199897009', note: 'autoreply_only_no_engagement' },
];

const DEACTIVATED_AT = new Date().toISOString();

async function main() {
  console.log(`═══ Opt-out de 6 contatos frios — ${DEACTIVATED_AT} ═══\n`);

  for (const t of TARGETS) {
    console.log(`▸ ${t.name} (phone ending ${t.phoneLast10})`);

    // WABA Cloud conversation
    const waConvs = await prisma.waConversation.findMany({
      where: { phone: { contains: t.phoneLast10.slice(-9) } }, // tolerar variações
      select: { id: true, phone: true, optedOut: true, contactId: true, status: true },
    });
    if (waConvs.length === 0) {
      console.log('  ⚠️  Sem WaConversation encontrada');
    }
    for (const c of waConvs) {
      if (c.optedOut) {
        console.log(`  • WaConversation ${c.phone} já está optedOut — pulando`);
      } else {
        await prisma.waConversation.update({
          where: { id: c.id },
          data: { optedOut: true, optedOutAt: new Date(), status: 'WA_CLOSED' },
        });
        console.log(`  ✓ WaConversation ${c.phone}: optedOut + status=WA_CLOSED`);
      }

      // Cancelar follow-ups WABA pendentes
      const cancelledFus = await prisma.waFollowUpState.updateMany({
        where: { conversationId: c.id, paused: false } as any,
        data: { paused: true } as any,
      }).catch(() => ({ count: 0 }));
      if (cancelledFus.count > 0) {
        console.log(`  ✓ ${cancelledFus.count} WaFollowUpState pausados`);
      }
    }

    // Z-API legacy conversation
    const zapConvs = await prisma.whatsAppConversation.findMany({
      where: { phone: { contains: t.phoneLast10.slice(-9) } },
      select: { id: true, phone: true, optedOut: true, contactId: true },
    });
    for (const c of zapConvs) {
      if (c.optedOut) {
        console.log(`  • WhatsAppConversation ${c.phone} já está optedOut`);
      } else {
        await prisma.whatsAppConversation.update({
          where: { id: c.id },
          data: { optedOut: true, optedOutAt: new Date(), status: 'closed' },
        });
        console.log(`  ✓ WhatsAppConversation ${c.phone}: optedOut + closed`);
      }
    }

    // Identificar contactId via conversação
    const contactIds = new Set<string>();
    for (const c of waConvs) if (c.contactId) contactIds.add(c.contactId);
    for (const c of zapConvs) if (c.contactId) contactIds.add(c.contactId);

    if (contactIds.size === 0) {
      console.log('  ⚠️  Nenhum contactId vinculado');
      console.log('');
      continue;
    }

    // Completar todos enrollments ACTIVE/PAUSED desses contatos
    for (const contactId of contactIds) {
      const enrollments = await prisma.automationEnrollment.findMany({
        where: {
          contactId,
          status: { in: ['ACTIVE', 'PAUSED'] },
        },
        select: { id: true, automationId: true, status: true, metadata: true },
      });
      for (const e of enrollments) {
        const existingMeta = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
          ? (e.metadata as Record<string, unknown>)
          : {};
        await prisma.automationEnrollment.update({
          where: { id: e.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata: {
              ...existingMeta,
              deactivatedBy: 'COLD_CONTACT_CLEANUP_2026_05_14',
              deactivatedAt: DEACTIVATED_AT,
              deactivatedReason: t.note,
              previousStatus: e.status,
            },
          },
        });
        console.log(`  ✓ Enrollment ${e.id.slice(0, 16)}… (${e.status} → COMPLETED) — automation ${e.automationId.slice(0, 16)}`);
      }
    }
    console.log('');
  }

  console.log('✓ Concluído. Os 6 contatos não receberão mais mensagens automáticas.');
  console.log('Pra reverter caso de erro: buscar metadata.deactivatedBy=COLD_CONTACT_CLEANUP_2026_05_14');

  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
