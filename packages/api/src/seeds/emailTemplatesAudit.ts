/**
 * Audit-only script (DRY RUN): list all EmailTemplate rows and classify them
 * by the state of jsonContent vs htmlContent. Used to decide which templates
 * need the "bodyHtml backfill" migration.
 *
 * Run: npx tsx packages/api/src/seeds/emailTemplatesAudit.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Row {
  id: string;
  name: string;
  hasHtml: boolean;
  hasJson: boolean;
  jsonParsed: boolean;
  jsonHasBodyHtml: boolean;
  jsonKeys: string[];
  htmlLen: number;
  jsonLen: number;
}

async function run() {
  const templates = await prisma.emailTemplate.findMany({
    select: { id: true, name: true, htmlContent: true, jsonContent: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const rows: Row[] = [];
  for (const t of templates) {
    const row: Row = {
      id: t.id,
      name: t.name,
      hasHtml: !!t.htmlContent && t.htmlContent.length > 0,
      hasJson: !!t.jsonContent && t.jsonContent.length > 0,
      jsonParsed: false,
      jsonHasBodyHtml: false,
      jsonKeys: [],
      htmlLen: t.htmlContent?.length ?? 0,
      jsonLen: t.jsonContent?.length ?? 0,
    };

    if (t.jsonContent) {
      try {
        const parsed = JSON.parse(t.jsonContent);
        row.jsonParsed = true;
        row.jsonKeys = Object.keys(parsed || {});
        row.jsonHasBodyHtml = typeof parsed?.bodyHtml === 'string' && parsed.bodyHtml.length > 0;
      } catch {
        row.jsonParsed = false;
      }
    }
    rows.push(row);
  }

  console.log(`Total templates: ${rows.length}\n`);

  const broken = rows.filter((r) => r.hasHtml && !r.jsonHasBodyHtml);
  const ok = rows.filter((r) => r.jsonHasBodyHtml);

  console.log(`🔴 Sem jsonContent.bodyHtml (provável duplicação no editor): ${broken.length}`);
  for (const r of broken) {
    console.log(
      `   • "${r.name}" id=${r.id}  hasJson=${r.hasJson} keys=[${r.jsonKeys.join(',')}]  html=${r.htmlLen}b`
    );
  }
  console.log(`\n🟢 OK (tem jsonContent.bodyHtml): ${ok.length}`);
  for (const r of ok) {
    console.log(`   • "${r.name}" id=${r.id}  html=${r.htmlLen}b json=${r.jsonLen}b`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
