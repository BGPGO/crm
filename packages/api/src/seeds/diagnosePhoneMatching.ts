/**
 * Diagnóstico: bug de matching de phone na rota /deals/:id/whatsapp-conversation
 *
 * A rota usa `findFirst({ where: { phone: normalizePhone(contact.phone) }})`.
 * Esse método compara apenas UMA variante (a normalizada). Se o Contact
 * foi salvo com formato A e a WaConversation com formato B (ex: com vs
 * sem o 9 no celular), o lookup falha mesmo com a conversa existindo.
 *
 * Esse script audita TODOS os deals e identifica quantos teriam a
 * conversa "perdida" no fluxo da rota mas seriam encontrados via
 * phoneVariants (busca robusta usada em outras partes do CRM).
 *
 * Uso: tsx src/seeds/diagnosePhoneMatching.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { phoneVariants, normalizePhone } from '../utils/phoneNormalize';

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Diagnóstico — bug de phone matching');
  console.log('═══════════════════════════════════════════════════════\n');

  // Foca nos deals no-show (universo do problema reportado)
  const deals = await prisma.deal.findMany({
    where: { noShow: true },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
    },
  });

  let semPhone = 0;
  let okPorContactId = 0;
  let okPorPhoneNormalizado = 0;
  let okSoPorVariantes = 0; // ← bug: rota atual NÃO encontra, mas deveria
  let semConversa = 0;

  const bugs: Array<{ deal: string; contact: string; phoneContact: string; normalized: string; foundPhones: string[] }> = [];

  for (const deal of deals) {
    if (!deal.contact?.phone) {
      semPhone++;
      continue;
    }

    const contactId = deal.contact.id;
    const phone = deal.contact.phone;
    const normalized = normalizePhone(phone);
    const variants = phoneVariants(phone);

    // 1. Por contactId (primeira tentativa da rota)
    const byContactId = await prisma.waConversation.findFirst({
      where: { contactId },
      select: { id: true, phone: true },
    });
    if (byContactId) {
      okPorContactId++;
      continue;
    }

    // 2. Por phone normalizado (fallback da rota)
    const byNormalized = await prisma.waConversation.findFirst({
      where: { phone: normalized },
      select: { id: true, phone: true },
    });
    if (byNormalized) {
      okPorPhoneNormalizado++;
      continue;
    }

    // 3. Por variantes (busca robusta — não usada na rota)
    const byVariants = await prisma.waConversation.findMany({
      where: { phone: { in: variants } },
      select: { id: true, phone: true },
    });
    if (byVariants.length > 0) {
      okSoPorVariantes++;
      bugs.push({
        deal: deal.title,
        contact: deal.contact.name,
        phoneContact: phone,
        normalized,
        foundPhones: byVariants.map((c) => c.phone),
      });
      continue;
    }

    semConversa++;
  }

  console.log(`Total deals no-show analisados: ${deals.length}\n`);
  console.log('┌────────────────────────────────────────────────────┬────────┐');
  console.log(`│ Sem phone no contato                               │ ${String(semPhone).padStart(6)} │`);
  console.log(`│ Conversa OK via contactId (rota encontra)          │ ${String(okPorContactId).padStart(6)} │`);
  console.log(`│ Conversa OK via phone normalizado (rota encontra)  │ ${String(okPorPhoneNormalizado).padStart(6)} │`);
  console.log(`│ ❌ Conversa SÓ por variants (rota PERDE — BUG)     │ ${String(okSoPorVariantes).padStart(6)} │`);
  console.log(`│ Sem conversa em nenhum formato                     │ ${String(semConversa).padStart(6)} │`);
  console.log('└────────────────────────────────────────────────────┴────────┘\n');

  if (bugs.length > 0) {
    console.log('▸ Casos do BUG (conversa existe mas rota atual não encontra):\n');
    for (const b of bugs.slice(0, 25)) {
      console.log(`  • ${b.deal}`);
      console.log(`      contact: "${b.contact}" — phone: "${b.phoneContact}"`);
      console.log(`      normalizePhone retorna: "${b.normalized}"`);
      console.log(`      WaConversation salva com phone: ${b.foundPhones.map((p) => `"${p}"`).join(', ')}`);
      console.log('');
    }
    if (bugs.length > 25) console.log(`  ... e mais ${bugs.length - 25} casos.`);
  } else {
    console.log('✅ Nenhum caso de bug — todos os matchings da rota funcionam.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
