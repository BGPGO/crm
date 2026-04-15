/**
 * Backfill: for every EmailTemplate whose jsonContent lacks a `bodyHtml` key,
 * extract the body from the stored htmlContent via stripOuterWrapper() and
 * write `{ design, bodyHtml, ...existingJsonKeys }` into jsonContent.
 *
 * This fixes legacy templates that render with a duplicated background inside
 * the web editor (the editor falls back to raw htmlContent when bodyHtml is
 * missing, which shows the outer layout tables inside the contentEditable).
 *
 * Preserves any unknown keys (e.g. `sections`, `globalStyle` from other
 * editors) by merging into the existing jsonContent instead of overwriting.
 *
 * Run: npx tsx packages/api/src/seeds/emailTemplatesBackfillJson.ts
 */

import { PrismaClient } from '@prisma/client';
import { stripOuterWrapper } from '../services/emailSender';
import { DEFAULT_TEMPLATE_DESIGN } from './emailAutomationTemplates';

const prisma = new PrismaClient();

async function run() {
  const templates = await prisma.emailTemplate.findMany({
    select: { id: true, name: true, htmlContent: true, jsonContent: true },
  });

  let backfilled = 0;
  let skippedOk = 0;
  let skippedNoHtml = 0;

  for (const t of templates) {
    // Parse existing jsonContent (if any)
    let existingJson: Record<string, unknown> = {};
    if (t.jsonContent) {
      try {
        const parsed = JSON.parse(t.jsonContent);
        if (parsed && typeof parsed === 'object') existingJson = parsed;
      } catch {
        // invalid JSON — treat as empty
      }
    }

    // If bodyHtml already present and non-empty, template is fine
    const currentBody = existingJson.bodyHtml;
    if (typeof currentBody === 'string' && currentBody.trim().length > 0) {
      skippedOk++;
      continue;
    }

    // Need htmlContent to extract body
    if (!t.htmlContent || t.htmlContent.length === 0) {
      console.warn(`⚠️  "${t.name}" (${t.id}): sem htmlContent — pulando`);
      skippedNoHtml++;
      continue;
    }

    // Extract the inner body by stripping DOCTYPE/html/body + outer layout tables
    const bodyHtml = stripOuterWrapper(t.htmlContent);

    // Merge: keep existing keys, add/overwrite design + bodyHtml
    const merged = {
      ...existingJson,
      design: existingJson.design ?? DEFAULT_TEMPLATE_DESIGN,
      bodyHtml,
    };

    await prisma.emailTemplate.update({
      where: { id: t.id },
      data: { jsonContent: JSON.stringify(merged) },
    });

    const preservedKeys = Object.keys(existingJson).filter((k) => k !== 'bodyHtml' && k !== 'design');
    console.log(
      `✅ "${t.name}" (${t.id}) — bodyHtml backfilled (${bodyHtml.length}b)` +
        (preservedKeys.length > 0 ? ` [preservadas: ${preservedKeys.join(',')}]` : '')
    );
    backfilled++;
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Backfilled : ${backfilled}`);
  console.log(`Já OK      : ${skippedOk}`);
  console.log(`Sem html   : ${skippedNoHtml}`);
  console.log(`Total      : ${templates.length}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
