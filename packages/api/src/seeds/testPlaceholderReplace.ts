/**
 * Teste do replace de *|PRIMEIRO_NOME|* nos 7 templates da automação.
 *
 * Carrega cada template do DB, simula o contato "João da Silva", aplica o
 * mesmo replace que o automationActions.ts executa no envio, e reporta
 * quantos placeholders existiam ANTES e quantos sobraram DEPOIS.
 *
 * Se ficarem placeholders, algo está escrito fora do padrão esperado.
 *
 * Run: npx tsx packages/api/src/seeds/testPlaceholderReplace.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATE_NAMES = [
  'Boas-vindas #1 — Contato Feito',
  'Boas-vindas #2 — Contato Feito',
  'Conversa Realizada — Marcar Reunião',
  'Reunião Agendada — Reunião Marcada',
  'Envio Feito — Proposta Enviada',
  'Aguardando Dados — Etapa',
  'Aguardando Assinatura — Etapa',
];

// Mesma lógica que automationActions.ts aplica no envio
function applyReplace(text: string, contactName: string): string {
  const firstName = contactName.split(' ')[0] || '';
  return text
    .replace(/\*\|PRIMEIRO_NOME\|\*/g, firstName)
    .replace(/\{\{primeiro_nome\}\}/g, firstName)
    .replace(/\{\{nome\}\}/g, contactName);
}

function countOccurrences(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

async function run() {
  const contactName = 'João da Silva';
  const firstName = contactName.split(' ')[0];
  const patterns = [/\*\|PRIMEIRO_NOME\|\*/g, /\{\{primeiro_nome\}\}/g, /\{\{nome\}\}/g];

  console.log(`Simulando envio para contact.name = "${contactName}"  →  firstName = "${firstName}"\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  let totalNameAppearances = 0;

  for (const name of TEMPLATE_NAMES) {
    const template = await prisma.emailTemplate.findFirst({
      where: { name },
      select: { id: true, name: true, subject: true, htmlContent: true },
    });
    if (!template) {
      console.warn(`⚠️  "${name}" não encontrado`);
      continue;
    }

    const beforeBody = patterns.reduce((sum, p) => sum + countOccurrences(template.htmlContent, p), 0);
    const beforeSubject = patterns.reduce((sum, p) => sum + countOccurrences(template.subject, p), 0);

    const afterBody = applyReplace(template.htmlContent, contactName);
    const afterSubject = applyReplace(template.subject, contactName);

    const leftoverBody = patterns.reduce((sum, p) => sum + countOccurrences(afterBody, p), 0);
    const leftoverSubject = patterns.reduce((sum, p) => sum + countOccurrences(afterSubject, p), 0);

    const appearsBody = countOccurrences(afterBody, new RegExp(firstName, 'g'));
    const appearsSubject = countOccurrences(afterSubject, new RegExp(firstName, 'g'));

    totalBefore += beforeBody + beforeSubject;
    totalAfter += leftoverBody + leftoverSubject;
    totalNameAppearances += appearsBody + appearsSubject;

    const status = leftoverBody + leftoverSubject === 0 ? '✅' : '🔴';
    console.log(
      `${status} "${name}"`
    );
    console.log(
      `    subject: "${template.subject}"  →  "${afterSubject}"  (placeholders: ${beforeSubject} → ${leftoverSubject})`
    );
    console.log(
      `    body: ${beforeBody} placeholder(s) → ${leftoverBody} restante(s)  |  "${firstName}" aparece ${appearsBody}x no body final`
    );
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Placeholders antes do replace   : ${totalBefore}`);
  console.log(`Placeholders depois (devem ser 0): ${totalAfter}`);
  console.log(`"${firstName}" aparece no HTML final: ${totalNameAppearances}x`);
  console.log(
    totalAfter === 0
      ? `\n✅ TUDO OK — todos os placeholders foram substituídos`
      : `\n🔴 FALHA — ${totalAfter} placeholder(s) não foram substituídos`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
