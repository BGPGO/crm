/**
 * Read-only script: acha contatos com nome semelhante e mostra estado de cada um
 * (deal aberto, stage, createdAt, email, phone). Uso pontual para merges manuais.
 *
 * Uso:
 *   npx tsx src/scripts/findDuplicate.ts "daniela zanatto"
 */

import 'dotenv/config';
import prisma from '../lib/prisma';

async function main() {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('Uso: npx tsx src/scripts/findDuplicate.ts "<nome>"');
    process.exit(1);
  }

  console.log(`\n🔎 Buscando contatos com nome contendo "${query}"...\n`);

  const contacts = await prisma.contact.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (contacts.length === 0) {
    console.log('Nenhum contato encontrado.');
    return;
  }

  for (const c of contacts) {
    const deals = await prisma.deal.findMany({
      where: { contactId: c.id },
      include: { stage: { select: { name: true, order: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const org = c.organizationId
      ? await prisma.organization.findUnique({ where: { id: c.organizationId }, select: { name: true } })
      : null;

    console.log('─'.repeat(72));
    console.log(`Contact ID : ${c.id}`);
    console.log(`Name       : ${c.name}`);
    console.log(`Email      : ${c.email ?? '(vazio)'}`);
    console.log(`Phone      : ${c.phone ?? '(vazio)'}`);
    console.log(`Organization: ${org?.name ?? '(sem org)'}`);
    console.log(`Created    : ${c.createdAt.toISOString()}`);
    console.log(`Updated    : ${c.updatedAt.toISOString()}`);
    console.log(`Deals (${deals.length}):`);
    for (const d of deals) {
      console.log(`  • ${d.id}  [${d.status}]  stage="${d.stage?.name}" (order ${d.stage?.order})  title="${d.title}"  created=${d.createdAt.toISOString()}`);
    }
  }
  console.log('─'.repeat(72));
  console.log(`\nTotal: ${contacts.length} contato(s) encontrado(s).\n`);
}

main()
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
