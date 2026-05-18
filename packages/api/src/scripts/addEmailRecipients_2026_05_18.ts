/**
 * Adiciona joao.lopes e vicenza.porto às listas de emails de:
 *  - novo lead       (lead_created_emails)
 *  - reuniao marcada (meeting_booked_emails)
 *
 * Preserva os emails já existentes. DRY-RUN por padrão; --apply pra gravar.
 */
import 'dotenv/config';
import prisma from '../lib/prisma';

const DEFAULTS: Record<string, string> = {
  lead_created_emails: 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br,joao.lopes@bertuzzipatrimonial.com.br',
  meeting_booked_emails: 'oliver@bertuzzipatrimonial.com.br,vitor@bertuzzipatrimonial.com.br',
};

const TO_ADD = [
  'joao.lopes@bertuzzipatrimonial.com.br',
  'vicenza.porto@bertuzzipatrimonial.com.br',
];

const KEYS = ['lead_created_emails', 'meeting_booked_emails'];

function merge(existing: string, toAdd: string[]): { result: string; added: string[]; alreadyPresent: string[] } {
  const current = existing.split(',').map((e) => e.trim()).filter(Boolean);
  const currentLower = new Set(current.map((e) => e.toLowerCase()));
  const added: string[] = [];
  const alreadyPresent: string[] = [];
  for (const email of toAdd) {
    if (currentLower.has(email.toLowerCase())) {
      alreadyPresent.push(email);
    } else {
      current.push(email);
      added.push(email);
    }
  }
  return { result: current.join(','), added, alreadyPresent };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '═══ APPLY MODE ═══' : '═══ DRY RUN — use --apply pra gravar ═══');

  for (const key of KEYS) {
    const row = await prisma.notificationConfig.findUnique({ where: { key } });
    const current = row?.value ?? DEFAULTS[key];
    const source = row ? 'banco' : 'DEFAULT (não está no banco ainda)';

    console.log(`\n── ${key} ──`);
    console.log(`Atual (${source}): ${current}`);

    const { result, added, alreadyPresent } = merge(current, TO_ADD);
    console.log(`Novo:            ${result}`);
    if (added.length) console.log(`✓ Adicionar: ${added.join(', ')}`);
    if (alreadyPresent.length) console.log(`= Já presente: ${alreadyPresent.join(', ')}`);

    if (apply && added.length > 0) {
      await prisma.notificationConfig.upsert({
        where: { key },
        create: { key, value: result },
        update: { value: result },
      });
      console.log('✓ Gravado');
    } else if (apply) {
      console.log('= Sem mudança — pulando upsert');
    }
  }

  if (apply) {
    console.log('\n─── Estado final ───');
    for (const key of KEYS) {
      const row = await prisma.notificationConfig.findUnique({ where: { key } });
      console.log(`${key}: ${row?.value}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
