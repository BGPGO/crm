/**
 * Marca as 6 automations criadas por emailAutomationSeed como kind='email-by-stage'
 * no triggerConfig, pra UI agrupar numa seção separada.
 *
 * Idempotente. Safe rerun.
 * Run: npx tsx packages/api/src/seeds/markEmailByStageAutomations.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NAMES = [
  'Email Auto — Contato Feito (Boas-vindas)',
  'Email Auto — Marcar Reunião',
  'Email Auto — Reunião Marcada',
  'Email Auto — Proposta Enviada',
  'Email Auto — Aguardando Dados',
  'Email Auto — Aguardando Assinatura',
];

async function run() {
  let updated = 0;
  for (const name of NAMES) {
    const a = await prisma.automation.findFirst({
      where: { name },
      select: { id: true, triggerConfig: true },
    });
    if (!a) {
      console.warn(`⚠️  "${name}" não encontrada`);
      continue;
    }
    const cfg = (a.triggerConfig as Record<string, unknown>) || {};
    if (cfg.kind === 'email-by-stage') {
      console.log(`• "${name}" já marcada`);
      continue;
    }
    await prisma.automation.update({
      where: { id: a.id },
      data: { triggerConfig: { ...cfg, kind: 'email-by-stage' } },
    });
    console.log(`✅ "${name}" marcada com kind='email-by-stage'`);
    updated++;
  }
  console.log(`\nAtualizadas: ${updated}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
