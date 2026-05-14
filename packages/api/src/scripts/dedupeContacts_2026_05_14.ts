/**
 * Dedupe de Contacts duplicados no funil ativo — 2026-05-14.
 *
 * 3 ações:
 * 1. Lisiane: merge cmp0ezs2o7vsolasg7uxx (Fischer, novo) → 65c9f31236feff000134fe70 (Freitas, antigo)
 * 2. Kelven: merge cmp12s05h35c4zea1fk0j (keosgfa) → cmp12tbul00n7ie3s1vp127kd (Kelven Elien)
 * 3. Deletar 5 leads de teste (phone fake 12-3-1231-2312)
 *
 * Merge: move todas as relações do secundário pro principal em transação,
 * trata conflitos de unique (ContactTag, DealContact, LeadScore), depois
 * deleta o Contact secundário.
 *
 * Rodar: npx tsx src/scripts/dedupeContacts_2026_05_14.ts
 */

import prisma from '../lib/prisma';

const MERGES = [
  {
    label: 'Lisiane',
    primaryId: '65c9f31236feff000134fe70',   // Lisiane Freitas (2024, mais histórico)
    secondaryId: 'cmp0ezs2o7vsolasg7uxx',     // Lisiane Fischer (10/05/2026)
  },
  {
    label: 'Kelven',
    primaryId: 'cmp12tbul00n7ie3s1vp127kd',   // Kelven Elien (nome real)
    secondaryId: 'cmp12s05h35c4zea1fk0j',     // keosgfa@gmail.com (email como nome)
  },
];

const TEST_CONTACTS_TO_DELETE = [
  'cmorrby3x01dn128f4ca1fo0i', // Pro
  'cmorr9lgq005t128fo10cipc6', // Studio360
  'cmorrd8eg023f128fbkrl33hw', // Faff
  'cmorrdcwc0260128f4m8x7kjq', // 123123
  'cmorrddmx026g128fqn2rey71', // 23123
];

async function mergeContacts(primaryId: string, secondaryId: string, label: string) {
  console.log(`\n══════ Merge ${label}: ${secondaryId} → ${primaryId} ══════`);
  await prisma.$transaction(async (tx) => {
    // Verificar que ambos existem
    const primary = await tx.contact.findUnique({ where: { id: primaryId }, select: { name: true, email: true } });
    const secondary = await tx.contact.findUnique({ where: { id: secondaryId }, select: { name: true, email: true } });
    if (!primary || !secondary) throw new Error('Um dos contatos não existe');
    console.log(`  primary: ${primary.name} <${primary.email}>`);
    console.log(`  secondary: ${secondary.name} <${secondary.email}>`);

    // 1. Deal
    const dealsUpdated = await tx.deal.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ Deal: ${dealsUpdated.count} atualizados`);

    // 2. Task
    const tasksUpdated = await tx.task.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ Task: ${tasksUpdated.count}`);

    // 3. Activity
    const actsUpdated = await tx.activity.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ Activity: ${actsUpdated.count}`);

    // 4. CustomFieldValue
    const cfvUpdated = await tx.customFieldValue.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }).catch(() => ({ count: 0 }));
    console.log(`  ✓ CustomFieldValue: ${cfvUpdated.count}`);

    // 5. LeadTracking
    const ltUpdated = await tx.leadTracking.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ LeadTracking: ${ltUpdated.count}`);

    // 6. DealContact — tratar unique (dealId, contactId)
    const dcs = await tx.dealContact.findMany({ where: { contactId: secondaryId } });
    let dcMoved = 0, dcDeleted = 0;
    for (const dc of dcs) {
      const exists = await tx.dealContact.findFirst({ where: { dealId: dc.dealId, contactId: primaryId } });
      if (exists) {
        await tx.dealContact.delete({ where: { id: dc.id } });
        dcDeleted++;
      } else {
        await tx.dealContact.update({ where: { id: dc.id }, data: { contactId: primaryId } });
        dcMoved++;
      }
    }
    console.log(`  ✓ DealContact: ${dcMoved} movidos, ${dcDeleted} duplicados removidos`);

    // 7. ContactTag — tratar unique (contactId, tagId)
    const tags = await tx.contactTag.findMany({ where: { contactId: secondaryId } });
    let tgMoved = 0, tgDeleted = 0;
    for (const t of tags) {
      const exists = await tx.contactTag.findFirst({ where: { tagId: t.tagId, contactId: primaryId } });
      if (exists) {
        await tx.contactTag.delete({ where: { id: t.id } });
        tgDeleted++;
      } else {
        await tx.contactTag.update({ where: { id: t.id }, data: { contactId: primaryId } });
        tgMoved++;
      }
    }
    console.log(`  ✓ ContactTag: ${tgMoved} movidos, ${tgDeleted} duplicados removidos`);

    // 8. LeadScore (1-1) — manter o do principal se existir
    const secLeadScore = await tx.leadScore.findUnique({ where: { contactId: secondaryId } }).catch(() => null);
    if (secLeadScore) {
      const primLeadScore = await tx.leadScore.findUnique({ where: { contactId: primaryId } }).catch(() => null);
      if (primLeadScore) {
        await tx.leadScore.delete({ where: { contactId: secondaryId } });
        console.log(`  ✓ LeadScore: deletado do secundário (principal já tinha)`);
      } else {
        await tx.leadScore.update({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
        console.log(`  ✓ LeadScore: movido pro principal`);
      }
    }

    // 9. EmailSend — unique (emailCampaignId, contactId)
    const emails = await tx.emailSend.findMany({ where: { contactId: secondaryId } });
    let emMoved = 0, emDeleted = 0;
    for (const es of emails) {
      if (es.emailCampaignId) {
        const exists = await tx.emailSend.findFirst({
          where: { emailCampaignId: es.emailCampaignId, contactId: primaryId },
        });
        if (exists) {
          await tx.emailSend.delete({ where: { id: es.id } });
          emDeleted++;
          continue;
        }
      }
      await tx.emailSend.update({ where: { id: es.id }, data: { contactId: primaryId } });
      emMoved++;
    }
    console.log(`  ✓ EmailSend: ${emMoved} movidos, ${emDeleted} duplicados removidos`);

    // 10. AutomationEnrollment
    const aeUpdated = await tx.automationEnrollment.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ AutomationEnrollment: ${aeUpdated.count}`);

    // 11. WhatsAppConversation
    const zapUpdated = await tx.whatsAppConversation.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ WhatsAppConversation: ${zapUpdated.count}`);

    // 12. WaConversation
    const waUpdated = await tx.waConversation.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } });
    console.log(`  ✓ WaConversation: ${waUpdated.count}`);

    // 13. CalendlyEvent
    const calUpdated = await tx.calendlyEvent.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }).catch(() => ({ count: 0 }));
    console.log(`  ✓ CalendlyEvent: ${calUpdated.count}`);

    // 14. Delete secundário
    await tx.contact.delete({ where: { id: secondaryId } });
    console.log(`  ✓ Contact ${secondaryId} deletado`);
  });
}

async function deleteTestContact(contactId: string, label: string) {
  console.log(`\n▸ Deletando teste ${label} (${contactId})`);
  await prisma.$transaction(async (tx) => {
    await tx.deal.deleteMany({ where: { contactId } });
    await tx.task.deleteMany({ where: { contactId } });
    await tx.activity.deleteMany({ where: { contactId } });
    await tx.customFieldValue.deleteMany({ where: { contactId } }).catch(() => 0);
    await tx.leadTracking.deleteMany({ where: { contactId } });
    await tx.dealContact.deleteMany({ where: { contactId } });
    await tx.contactTag.deleteMany({ where: { contactId } });
    await tx.leadScore.deleteMany({ where: { contactId } }).catch(() => 0);
    await tx.emailSend.deleteMany({ where: { contactId } }).catch(() => 0);
    await tx.automationEnrollment.deleteMany({ where: { contactId } });
    await tx.whatsAppConversation.deleteMany({ where: { contactId } });
    await tx.waConversation.deleteMany({ where: { contactId } });
    await tx.calendlyEvent.deleteMany({ where: { contactId } }).catch(() => 0);
    await tx.contact.delete({ where: { id: contactId } });
  });
  console.log(`  ✓ Deletado`);
}

async function main() {
  console.log('═══ Dedupe Contacts 2026-05-14 ═══');

  for (const m of MERGES) {
    await mergeContacts(m.primaryId, m.secondaryId, m.label);
  }

  console.log('\n══════ Deletar 5 leads de teste ══════');
  for (const id of TEST_CONTACTS_TO_DELETE) {
    const c = await prisma.contact.findUnique({ where: { id }, select: { name: true } });
    await deleteTestContact(id, c?.name || '?');
  }

  console.log('\n✓ Dedupe concluído.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
