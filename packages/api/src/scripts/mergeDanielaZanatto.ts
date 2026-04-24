/**
 * Script pontual: merge manual Daniela Zanatto
 *
 *   Keep   : cmodapajj16f1136tym25wv2v  (email correto, deal Reunião agendada)
 *   Remove : cmnzy1hv959khux2ye0q6      (email com typo)
 *
 * Complementos em B:
 *   - phone: "54 99625-7415" (vem de A)
 *   - organizationId: org "MeuFluxo" (vem de A)
 *
 * Deal antigo de A (Marcar reunião) é migrado pro B e imediatamente fechado
 * como LOST com motivo "Duplicado — consolidado no deal <id-novo>".
 *
 * Tudo roda dentro de uma transação.
 */

import 'dotenv/config';
import prisma from '../lib/prisma';

const KEEP_ID = 'cmodapajj16f1136tym25wv2v';
const REMOVE_ID = 'cmnzy1hv959khux2ye0q6';
const OLD_DEAL_ID = 'cmnzy1iolhu6t535berm6'; // deal que vai ser LOST
const NEW_DEAL_ID = 'cmodapara16f3136t36l5bfkx'; // deal que fica OPEN

const LOST_REASON_NAME = 'Duplicado';

async function main() {
  console.log('\n🔧 Iniciando merge Daniela Zanatto...\n');

  // Pré-validação fora da transação (idempotência)
  const [keep, remove, oldDeal, newDeal] = await Promise.all([
    prisma.contact.findUnique({ where: { id: KEEP_ID } }),
    prisma.contact.findUnique({ where: { id: REMOVE_ID } }),
    prisma.deal.findUnique({ where: { id: OLD_DEAL_ID } }),
    prisma.deal.findUnique({ where: { id: NEW_DEAL_ID } }),
  ]);

  if (!keep) throw new Error(`Contato keep ${KEEP_ID} não encontrado`);
  if (!remove) throw new Error(`Contato remove ${REMOVE_ID} não encontrado`);
  if (!oldDeal) throw new Error(`Deal antigo ${OLD_DEAL_ID} não encontrado`);
  if (!newDeal) throw new Error(`Deal novo ${NEW_DEAL_ID} não encontrado`);

  console.log('✓ Pré-validação OK — ambos os contatos e deals existem.');

  // Garante LostReason "Duplicado"
  let lostReason = await prisma.lostReason.findFirst({
    where: { name: { equals: LOST_REASON_NAME, mode: 'insensitive' } },
  });
  if (!lostReason) {
    lostReason = await prisma.lostReason.create({ data: { name: LOST_REASON_NAME } });
    console.log(`✓ LostReason "${LOST_REASON_NAME}" criada (${lostReason.id})`);
  } else {
    console.log(`✓ LostReason "${LOST_REASON_NAME}" já existe (${lostReason.id})`);
  }

  // === Transação ===
  const result = await prisma.$transaction(async (tx) => {
    // 1. Complementar dados do keep (B) com os do remove (A)
    const patch: Record<string, unknown> = {};
    if (!keep.phone && remove.phone) patch.phone = remove.phone;
    if (!keep.organizationId && remove.organizationId) patch.organizationId = remove.organizationId;
    if (Object.keys(patch).length > 0) {
      await tx.contact.update({ where: { id: KEEP_ID }, data: patch });
      console.log(`✓ Contact keep complementado:`, patch);
    }

    // 2. Mover relacionamentos (com try/catch por tabela pra tolerar unique constraints)
    const tables = [
      'deal',
      'dealContact',
      'whatsAppConversation',
      'waConversation',
      'automationEnrollment',
      'activity',
      'calendlyEvent',
      'leadTracking',
      'emailSend',
    ] as const;

    for (const table of tables) {
      try {
        const res = await (tx[table] as any).updateMany({
          where: { contactId: REMOVE_ID },
          data: { contactId: KEEP_ID },
        });
        if (res.count > 0) console.log(`  • ${table}: ${res.count} row(s) movidas`);
      } catch (err) {
        console.warn(`  • ${table}: conflito (unique?) — pulado. ${(err as Error).message}`);
      }
    }

    // 3. Tags: evita duplicatas
    try {
      const existingTagIds = new Set(
        (await tx.contactTag.findMany({ where: { contactId: KEEP_ID }, select: { tagId: true } }))
          .map((t) => t.tagId),
      );
      if (existingTagIds.size > 0) {
        await tx.contactTag.deleteMany({
          where: { contactId: REMOVE_ID, tagId: { in: [...existingTagIds] } },
        });
      }
      const tagRes = await tx.contactTag.updateMany({
        where: { contactId: REMOVE_ID },
        data: { contactId: KEEP_ID },
      });
      if (tagRes.count > 0) console.log(`  • contactTag: ${tagRes.count} row(s) movidas`);
    } catch (err) {
      console.warn(`  • contactTag: erro — ${(err as Error).message}`);
    }

    // 4. Fechar deal antigo como LOST
    await tx.deal.update({
      where: { id: OLD_DEAL_ID },
      data: {
        status: 'LOST',
        closedAt: new Date(),
        lostReasonId: lostReason!.id,
      },
    });
    console.log(`✓ Deal antigo ${OLD_DEAL_ID} fechado como LOST (reason: Duplicado)`);

    // 5. Limpeza final do contato REMOVE
    await tx.$executeRawUnsafe(`DELETE FROM "EmailSend" WHERE "contactId" = $1`, REMOVE_ID);
    await tx.$executeRawUnsafe(`DELETE FROM "ContactTag" WHERE "contactId" = $1`, REMOVE_ID);
    await tx.$executeRawUnsafe(`DELETE FROM "LeadScore" WHERE "contactId" = $1`, REMOVE_ID);
    await tx.contact.delete({ where: { id: REMOVE_ID } });
    console.log(`✓ Contato ${REMOVE_ID} deletado`);

    return { mergedInto: KEEP_ID, removed: REMOVE_ID, oldDealLost: OLD_DEAL_ID };
  });

  console.log('\n✅ Merge concluído:', result);

  // Estado final pra auditoria
  const final = await prisma.contact.findUnique({
    where: { id: KEEP_ID },
    include: {
      deals: {
        select: { id: true, title: true, status: true, stage: { select: { name: true } } },
      },
    },
  });
  console.log('\nEstado final do contato keep:');
  console.log(JSON.stringify(final, null, 2));
}

main()
  .catch((err) => {
    console.error('\n❌ Erro no merge:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
