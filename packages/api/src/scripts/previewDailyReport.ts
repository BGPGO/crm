import { buildDailyReportHtml } from '../services/dailyReport';
import * as fs from 'fs';

async function main() {
  const html = await buildDailyReportHtml();
  const path = '/tmp/preview-relatorio.html';
  fs.writeFileSync(path, html);
  console.log('Preview salvo em', path);
}
main().catch(console.error);
