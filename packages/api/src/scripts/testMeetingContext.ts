import 'dotenv/config';
import prisma from '../lib/prisma';
import { buildMeetingContext } from '../services/wa/meetingContext';

/**
 * Validação read-only do buildMeetingContext contra casos reais da análise
 * BIA 30d (2026-07-07). Não escreve nada; só imprime o bloco gerado.
 * Uso: npx tsx src/scripts/testMeetingContext.ts
 */

const CASOS: { conv: string; rotulo: string }[] = [
  { conv: 'cmr8nm06619h8fw7a6e33ozoy', rotulo: 'Carlos — reunião FUTURA (09/07 15h30)' },
  { conv: 'cmnoh769j003212k8vgfu3lwb', rotulo: 'Theo — reunião passada (03/07), pediu link 5x' },
  { conv: 'cmptasnd21720l59h3pi24lvs', rotulo: 'Chicken Supremo — reunião velha (02/06), loop bot-vs-bot' },
  { conv: 'cmqn4brnw0g6rw7mjlw9i1i64', rotulo: 'Vende Rapido — 2 no-shows' },
  { conv: 'cmqwuh86k00k9pa8f9aghpooj', rotulo: 'M. Amanda — pediu reagendar 2x' },
  { conv: 'cmqw8ngvd2d1sv4p1u6gyen0i', rotulo: 'W Freitas — reagendamento teatro' },
];

async function main() {
  for (const caso of CASOS) {
    console.log('\n' + '='.repeat(70));
    console.log(`CASO: ${caso.rotulo}`);
    const conv = await prisma.waConversation.findUnique({
      where: { id: caso.conv },
      select: { contactId: true, pushName: true },
    });
    if (!conv?.contactId) {
      console.log('  (conversa sem contactId — bloco vazio, comportamento atual)');
      continue;
    }
    const deal = await prisma.deal.findFirst({
      where: { contactId: conv.contactId, status: 'OPEN' },
      select: { noShow: true, noShowAt: true, stage: { select: { name: true } } },
    });
    console.log(`  contato=${conv.contactId} | etapa=${deal?.stage?.name ?? '(sem deal aberto)'} | noShow=${deal?.noShow ?? '-'}`);
    const bloco = await buildMeetingContext(conv.contactId, deal ?? null);
    console.log(bloco ? bloco : '  → bloco VAZIO (contexto idêntico ao atual)');
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
