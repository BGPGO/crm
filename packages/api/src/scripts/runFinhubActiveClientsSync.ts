import 'dotenv/config';
import { runFinhubActiveClientsSync } from '../services/finhubActiveClients';
import prisma from '../lib/prisma';

// Execução manual do sync de clientes ativos (FinHub → segmento do CRM).
// Uso: tsx src/scripts/runFinhubActiveClientsSync.ts
async function main() {
  const dryRun = process.argv.includes('--dry');
  const summary = await runFinhubActiveClientsSync({ dryRun });
  if (!summary) {
    console.log('Sync não executou (env ausente ou 0 clientes).');
    return;
  }
  console.log(`\n=== Resumo ${dryRun ? '(DRY-RUN — nada gravado)' : ''} ===`);
  console.log(`Ativos: ${summary.totalAtivos}`);
  console.log(`Com email (no segmento): ${summary.comEmail}`);
  console.log(`Sem email (gaps): ${summary.semEmail}`);
  console.log(`Desmarcados (saíram): ${summary.removidos}`);
  console.log('Por fonte:', summary.porFonte);
  if (summary.details) {
    const novos = summary.details.filter((d) => d.novo).length;
    console.log(`\nContatos: ${summary.details.length - novos} já existem, ${novos} seriam criados.`);
    console.log('\n--- Lista resolvida ---');
    for (const d of summary.details) {
      console.log(`${d.novo ? '[NOVO] ' : '       '}${d.name} → ${d.email} (${d.source})`);
    }
  }
  if (summary.gaps.length) console.log('\nGaps (sem email):', summary.gaps.join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
