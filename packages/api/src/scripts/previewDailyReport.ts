import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { buildDailyReportHtml } from '../services/dailyReport';
import * as fs from 'fs';

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

function parseDateArg(): Date | undefined {
  const arg = process.argv[2];
  if (!arg) return undefined;
  const [y, m, d] = arg.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - BRT_OFFSET_MS);
}

async function main() {
  const refDate = parseDateArg();
  const html = await buildDailyReportHtml(refDate);
  const tag = refDate ? refDate.toISOString().slice(0, 10) : 'yesterday';
  const out = `/tmp/preview-relatorio-${tag}.html`;
  fs.writeFileSync(out, html);
  console.log('Preview salvo em', out, '·', html.length, 'bytes');
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
