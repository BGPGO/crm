/**
 * Disparo manual do relatório mensal da BIA.
 *
 *   npx tsx src/scripts/runBiaMonthlyReport.ts                 → dry-run (gera HTML local, não envia nada)
 *   npx tsx src/scripts/runBiaMonthlyReport.ts --send          → envia de verdade (email + demanda FinHub)
 *   npx tsx src/scripts/runBiaMonthlyReport.ts --send --to=x@y → envia só pro(s) email(s) informado(s)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runBiaMonthlyReport } from '../services/biaMonthlyReport';

async function main() {
  const args = process.argv.slice(2);
  const send = args.includes('--send');
  const toArg = args.find((a) => a.startsWith('--to='));
  const recipients = toArg ? toArg.slice(5).split(',').map((e) => e.trim()).filter(Boolean) : undefined;

  const result = await runBiaMonthlyReport({ dryRun: !send, recipients });

  if (!send) {
    const out = path.join(process.cwd(), 'bia-report-preview.html');
    fs.writeFileSync(out, result.html, 'utf8');
    console.log(`[dry-run] Período: ${result.periodLabel}`);
    console.log(`[dry-run] Prévia gravada em: ${out}`);
    console.log('[dry-run] Nada foi enviado. Use --send pra disparar de verdade.');
  } else {
    console.log(`Enviado — email ${result.emailId}, demanda FinHub ${result.finhubDemandId}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit());
