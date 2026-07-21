import 'dotenv/config';
import prisma from '../lib/prisma';
import { buildMeetingContext } from '../services/wa/meetingContext';

/**
 * Validação read-only do fix de contatos-irmãos por telefone (caso Sardis 21/07).
 * O evento Calendly está no contato antigo (cmrmzzo66…); o contexto só aparece
 * pro Sardis Jr (cmrtb8ys…) se a busca por telefone normalizado funcionar.
 * Uso: npx tsx src/scripts/testMeetingContextSardis.ts
 */
const CASOS = [
  { id: 'cmrmzzo66fa685ci674kz', rotulo: 'Sardis (contato da conversa — dono do evento pós-correção)' },
  { id: 'cmrtb8ys92sleq3qnjqg4vy7o', rotulo: 'Sardis Jr (duplicado — só acha via telefone-irmão)' },
];

async function main() {
  for (const caso of CASOS) {
    console.log(`\n═══ ${caso.rotulo} ═══`);
    const bloco = await buildMeetingContext(caso.id, null);
    console.log(bloco || '  → bloco VAZIO');
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
