/**
 * Teste READ-ONLY da extração de atributos — não escreve nada no banco.
 * Uso: npx tsx --env-file=.env src/scripts/testAttributeExtraction.ts
 */

import prisma from '../lib/prisma';
import {
  classifyGenderByFirstName,
  extractAttributesFromText,
  gatherContactText,
} from '../services/contactAttributeExtractor';

async function main() {
  // 1. Gênero por nome — amostra real da base
  const sample = await prisma.contact.findMany({
    where: { brand: 'BGP' },
    select: { name: true },
    take: 25,
    orderBy: { createdAt: 'desc' },
  });
  const firstNames = [...new Set(sample.map(c => c.name.trim().split(/\s+/)[0]?.toLowerCase()).filter(Boolean))] as string[];
  console.log('── Gênero por primeiro nome ──');
  const genders = await classifyGenderByFirstName(firstNames);
  for (const n of firstNames) console.log(`  ${n}: ${genders.get(n) ?? 'null (ambíguo)'}`);

  // 2. Extração de conversas/reuniões — 3 contatos com reunião
  const meetings = await prisma.readAiMeeting.findMany({
    where: { contactId: { not: null }, transcript: { not: null } },
    select: { contactId: true },
    distinct: ['contactId'],
    take: 3,
    orderBy: { meetingDate: 'desc' },
  });

  for (const m of meetings) {
    const contact = await prisma.contact.findUnique({
      where: { id: m.contactId! },
      select: { id: true, name: true },
    });
    if (!contact) continue;
    const text = await gatherContactText(contact.id);
    if (!text) { console.log(`\n${contact.name}: sem material`); continue; }
    console.log(`\n── ${contact.name} (${Math.round(text.length / 1000)}k chars de material) ──`);
    const result = await extractAttributesFromText(contact.name, text);
    console.log(JSON.stringify(result, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
