import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  AUDITORIA — automações disparadas em AIMO?');
  console.log('══════════════════════════════════════════════\n');

  const aimoContacts = await prisma.contact.findMany({
    where: { brand: 'AIMO' },
    select: { id: true, name: true, email: true },
  });

  console.log(`Contacts AIMO no banco: ${aimoContacts.length}\n`);
  for (const c of aimoContacts) {
    console.log(`  ${c.id} — ${c.name} (${c.email})`);
  }

  // Enrollments em automações BGP por contatos AIMO
  const enrollments = await prisma.automationEnrollment.findMany({
    where: {
      contactId: { in: aimoContacts.map(c => c.id) },
    },
    include: {
      automation: { select: { id: true, name: true, brand: true, status: true } },
      contact: { select: { id: true, name: true, brand: true } },
    },
  });

  console.log(`\nEnrollments em automações por contatos AIMO: ${enrollments.length}`);
  if (enrollments.length === 0) {
    console.log(`✅ Nenhuma automação foi disparada — base AIMO está parada como esperado.\n`);
  } else {
    console.log(`\n⚠️ ATENÇÃO — enrollments encontrados:\n`);
    for (const e of enrollments) {
      console.log(`  enrollment ${e.id}`);
      console.log(`    automation: "${e.automation.name}" (brand=${e.automation.brand}, status=${e.automation.status})`);
      console.log(`    contact:    ${e.contact.name} (brand=${e.contact.brand})`);
      console.log(`    status:     ${e.status}, enrolledAt=${e.enrolledAt.toISOString()}`);
    }
  }

  // Sends de email para contatos AIMO (verifica se cron antigo enviou algo antes do dispatcher fix)
  const sends = await prisma.emailSend.findMany({
    where: {
      contactId: { in: aimoContacts.map(c => c.id) },
    },
    include: {
      emailCampaign: { select: { id: true, name: true, brand: true, status: true } },
    },
  });

  console.log(`\nEmail sends para contatos AIMO: ${sends.length}`);
  if (sends.length === 0) {
    console.log(`✅ Nenhum email enviado/queued pra contatos AIMO.\n`);
  } else {
    console.log(`\n⚠️ Sends encontrados:\n`);
    for (const s of sends) {
      console.log(`  send ${s.id} — campanha "${s.emailCampaign.name}" (brand=${s.emailCampaign.brand}) status=${s.status}`);
    }
  }

  // WaConversations / WhatsAppConversations para contatos AIMO
  const [waCount, waLegacyCount] = await Promise.all([
    prisma.waConversation.count({ where: { contactId: { in: aimoContacts.map(c => c.id) } } }),
    prisma.whatsAppConversation.count({ where: { contactId: { in: aimoContacts.map(c => c.id) } } }),
  ]);
  console.log(`\nConversas WhatsApp (cloud) para AIMO: ${waCount}`);
  console.log(`Conversas WhatsApp (legacy) para AIMO: ${waLegacyCount}`);

  // ScheduledFollowUp pra deals AIMO
  const aimoDeals = await prisma.deal.findMany({
    where: { brand: 'AIMO' },
    select: { id: true },
  });
  const followUps = await prisma.scheduledFollowUp.count({
    where: { dealId: { in: aimoDeals.map(d => d.id) } },
  });
  console.log(`Follow-ups agendados pra deals AIMO: ${followUps}`);

  console.log('\n══════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
