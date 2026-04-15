/**
 * Sincroniza triggerConfig.stageName com o name real da PipelineStage
 * (matching por stageId). Puramente cosmético — o engine já faz match
 * por stageId, mas stageName é usado para display.
 *
 * Run: npx tsx packages/api/src/seeds/fixStageNamesInTriggerConfig.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const automations = await prisma.automation.findMany({
    where: {
      triggerConfig: { path: ['kind'], equals: 'email-by-stage' },
    },
    select: { id: true, name: true, triggerConfig: true },
  });

  let fixed = 0;
  for (const a of automations) {
    const cfg = (a.triggerConfig as Record<string, unknown>) || {};
    const stageId = cfg.stageId as string | undefined;
    if (!stageId) continue;

    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: { name: true },
    });
    if (!stage) continue;

    if (cfg.stageName === stage.name) continue;

    await prisma.automation.update({
      where: { id: a.id },
      data: {
        triggerConfig: { ...cfg, stageName: stage.name } as any,
      },
    });
    console.log(`✅ "${a.name}": stageName "${cfg.stageName}" → "${stage.name}"`);
    fixed++;
  }
  console.log(`\nCorrigidos: ${fixed}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
