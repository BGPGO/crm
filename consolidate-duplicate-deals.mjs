/**
 * Consolida deals duplicados gerados por re-entrada via webhook GreatPages.
 *
 * Estratégia (NÃO-DESTRUTIVA):
 *   - Identifica contatos com >1 deal OPEN.
 *   - "Deal vivo" = o de maior stage.order; empate → mais antigo (workflow em andamento).
 *   - "Deals zumbis" = os outros.
 *   - Migra Activity/Task/ScheduledFollowUp/SentDocument/CalendlyEvent/ReadAiMeeting dos
 *     zumbis → vivo (re-aponta dealId).
 *   - Marca os zumbis como status=LOST, lostReasonId=<"Deal duplicado">, closedAt=now.
 *     Nada é deletado — se der merda, dá pra reverter.
 *
 * Uso:
 *   node consolidate-duplicate-deals.mjs --dry-run   # só imprime o que faria
 *   node consolidate-duplicate-deals.mjs             # executa de verdade
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const LOST_REASON_NAME = 'Deal duplicado (re-entrada LP)';
const SALES_PIPELINE_ID = '64fb7516ea4eb400219457de'; // pipeline "Vendas"

async function main() {
  console.log(`\n═══ Consolidação de deals duplicados ${DRY ? '(DRY RUN)' : '(EXECUTANDO)'} ═══\n`);

  let lostReason = await prisma.lostReason.findFirst({ where: { name: LOST_REASON_NAME } });
  if (!lostReason) {
    if (DRY) {
      console.log(`[dry] criaria LostReason "${LOST_REASON_NAME}"`);
      lostReason = { id: '<would-be-created>', name: LOST_REASON_NAME };
    } else {
      lostReason = await prisma.lostReason.create({ data: { name: LOST_REASON_NAME } });
      console.log(`✓ Criada LostReason "${lostReason.name}" (id ${lostReason.id})`);
    }
  } else {
    console.log(`✓ LostReason "${lostReason.name}" já existe (id ${lostReason.id})`);
  }

  // contatos com >1 deal OPEN no pipeline Vendas
  const dupGroups = await prisma.$queryRawUnsafe(`
    SELECT "contactId", COUNT(*)::int AS n
    FROM "Deal"
    WHERE status = 'OPEN'
      AND "contactId" IS NOT NULL
      AND "pipelineId" = '${SALES_PIPELINE_ID}'
    GROUP BY "contactId"
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `);

  console.log(`\nContatos com múltiplos deals OPEN: ${dupGroups.length}\n`);

  let totalMerged = 0;
  let totalActivitiesMoved = 0;
  let totalTasksMoved = 0;
  let totalScheduledMoved = 0;
  let totalSentDocsMoved = 0;
  let totalCalendlyMoved = 0;
  let totalReadAiMoved = 0;

  for (const g of dupGroups) {
    const deals = await prisma.deal.findMany({
      where: { contactId: g.contactId, status: 'OPEN', pipelineId: SALES_PIPELINE_ID },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        stage: { select: { name: true, order: true } },
        contact: { select: { name: true, email: true } },
      },
      orderBy: [{ stage: { order: 'desc' } }, { createdAt: 'asc' }],
    });

    const [alive, ...zombies] = deals;
    const c = alive.contact;

    console.log(`🔸 ${c?.name} <${c?.email ?? '—'}>  (contactId ${g.contactId})`);
    console.log(`   VIVO:   [${alive.stage.order}] ${alive.stage.name.padEnd(22)} | ${alive.id} | criado ${alive.createdAt.toISOString()}`);
    for (const z of zombies) {
      console.log(`   ZUMBI:  [${z.stage.order}] ${z.stage.name.padEnd(22)} | ${z.id} | criado ${z.createdAt.toISOString()}`);
    }

    const zombieIds = zombies.map((z) => z.id);
    if (zombieIds.length === 0) continue;

    const [actCount, taskCount, schedCount, sentDocCount, calCount, readAiCount] = await Promise.all([
      prisma.activity.count({ where: { dealId: { in: zombieIds } } }),
      prisma.task.count({ where: { dealId: { in: zombieIds } } }),
      prisma.scheduledFollowUp.count({ where: { dealId: { in: zombieIds } } }),
      prisma.sentDocument.count({ where: { dealId: { in: zombieIds } } }),
      prisma.calendlyEvent.count({ where: { dealId: { in: zombieIds } } }),
      prisma.readAiMeeting.count({ where: { dealId: { in: zombieIds } } }),
    ]);

    console.log(`   → mover: ${actCount} activities, ${taskCount} tasks, ${schedCount} scheduledFollowUps, ${sentDocCount} sentDocuments, ${calCount} calendlyEvents, ${readAiCount} readAiMeetings`);

    if (DRY) {
      console.log(`   [dry] marcaria ${zombieIds.length} zumbis como LOST e reapontaria dependências\n`);
      totalMerged += zombieIds.length;
      totalActivitiesMoved += actCount;
      totalTasksMoved += taskCount;
      totalScheduledMoved += schedCount;
      totalSentDocsMoved += sentDocCount;
      totalCalendlyMoved += calCount;
      totalReadAiMoved += readAiCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      // migra referências
      const moves = await Promise.all([
        tx.activity.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
        tx.task.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
        tx.scheduledFollowUp.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
        tx.sentDocument.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
        tx.calendlyEvent.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
        tx.readAiMeeting.updateMany({ where: { dealId: { in: zombieIds } }, data: { dealId: alive.id } }),
      ]);
      totalActivitiesMoved += moves[0].count;
      totalTasksMoved += moves[1].count;
      totalScheduledMoved += moves[2].count;
      totalSentDocsMoved += moves[3].count;
      totalCalendlyMoved += moves[4].count;
      totalReadAiMoved += moves[5].count;

      // marca zumbis como LOST
      const closedAt = new Date();
      for (const z of zombies) {
        await tx.deal.update({
          where: { id: z.id },
          data: {
            status: 'LOST',
            lostReasonId: lostReason.id,
            lostAtStage: z.stage.name,
            closedAt,
            updatedAt: closedAt,
          },
        });
      }

      // activity de trilha no deal vivo
      await tx.activity.create({
        data: {
          type: 'NOTE',
          content: `Consolidado: ${zombies.length} deal(s) duplicado(s) marcado(s) como LOST (motivo "${LOST_REASON_NAME}"). IDs: ${zombieIds.join(', ')}.`,
          userId: alive.id === alive.id ? await getAdminUserId() : (undefined),
          contactId: g.contactId,
          dealId: alive.id,
          metadata: { merged: zombieIds, reason: LOST_REASON_NAME },
        },
      });

      totalMerged += zombies.length;
    });

    console.log(`   ✓ consolidado\n`);
  }

  console.log('\n═══ Resumo ═══');
  console.log(`Deals zumbis processados: ${totalMerged}`);
  console.log(`Activities migradas:      ${totalActivitiesMoved}`);
  console.log(`Tasks migradas:           ${totalTasksMoved}`);
  console.log(`ScheduledFollowUps:       ${totalScheduledMoved}`);
  console.log(`SentDocuments:            ${totalSentDocsMoved}`);
  console.log(`CalendlyEvents:           ${totalCalendlyMoved}`);
  console.log(`ReadAiMeetings:           ${totalReadAiMoved}`);
  console.log(DRY ? '\n(dry-run — nada foi alterado)\n' : '\n(alterações aplicadas)\n');
}

let _adminUserId;
async function getAdminUserId() {
  if (_adminUserId) return _adminUserId;
  const admin =
    (await prisma.user.findFirst({ where: { email: 'oliver@bertuzzipatrimonial.com.br' }, select: { id: true } })) ??
    (await prisma.user.findFirst({ select: { id: true } }));
  _adminUserId = admin?.id;
  return _adminUserId;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
