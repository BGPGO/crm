/**
 * Update script: re-writes htmlContent AND jsonContent of the 7 email
 * automation templates so they load cleanly in the editor (no duplicated
 * outer layout tables visible inside the contentEditable area).
 *
 * Safe to run multiple times — only UPDATES by template name.
 * Run with: npx tsx packages/api/src/seeds/emailAutomationUpdate.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  htmlBoasVindas1,
  htmlBoasVindas2,
  htmlConversaRealizada,
  htmlReuniaoAgendada,
  htmlEnvioFeito,
  htmlAguardandoDados,
  htmlAguardandoAssinatura,
  compileFullHtml,
  buildJsonContent,
} from './emailAutomationTemplates';

const prisma = new PrismaClient();

const UPDATES: Array<{ name: string; body: () => string }> = [
  { name: 'Boas-vindas #1 — Contato Feito', body: htmlBoasVindas1 },
  { name: 'Boas-vindas #2 — Contato Feito', body: htmlBoasVindas2 },
  { name: 'Conversa Realizada — Marcar Reunião', body: htmlConversaRealizada },
  { name: 'Reunião Agendada — Reunião Marcada', body: htmlReuniaoAgendada },
  { name: 'Envio Feito — Proposta Enviada', body: htmlEnvioFeito },
  { name: 'Aguardando Dados — Etapa', body: htmlAguardandoDados },
  { name: 'Aguardando Assinatura — Etapa', body: htmlAguardandoAssinatura },
];

async function run() {
  let updated = 0;
  let notFound = 0;
  for (const { name, body } of UPDATES) {
    const template = await prisma.emailTemplate.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!template) {
      console.warn(`⚠️  Template "${name}" não encontrado — pulando`);
      notFound++;
      continue;
    }
    const bodyHtml = body();
    await prisma.emailTemplate.update({
      where: { id: template.id },
      data: {
        htmlContent: compileFullHtml(bodyHtml),
        jsonContent: buildJsonContent(bodyHtml),
      },
    });
    console.log(`✅ "${name}" atualizado (id: ${template.id})`);
    updated++;
  }
  console.log('\n────────────────────────────────────────');
  console.log(`Atualizados: ${updated}  |  Não encontrados: ${notFound}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
