/**
 * findLegacyTemplateSenders_2026_05_18.ts
 *
 * Script de INVESTIGAÇÃO (somente leitura) — descobre a origem dos envios
 * dos 6 templates legacy nos últimos 14 dias.
 *
 * Rodar com: npx tsx src/scripts/findLegacyTemplateSenders_2026_05_18.ts
 */

import prisma from '../lib/prisma';
import { execSync } from 'child_process';
import path from 'path';

const LEGACY_TEMPLATES = [
  'cadencia_d4_prova',
  'cadencia_d1_abertura',
  'cadencia_d3_followup',
  'cadencia_d7_encerramento',
  'bgp_no_show_d3_prova_social',
  'bgp_no_show_d2_valor',
] as const;

type LegacyTemplate = (typeof LEGACY_TEMPLATES)[number];

// Utilitário de separador
function sep(title: string) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(70));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 1 — Detalhamento dos envios reais (últimos 14d)
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao1() {
  sep('Verificação 1 — Detalhamento dos envios reais (últimos 14d)');

  const mensagens = await prisma.waMessage.findMany({
    where: {
      templateName: { in: [...LEGACY_TEMPLATES] },
      direction: 'OUTBOUND',
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    include: {
      conversation: {
        include: { contact: true },
      },
      senderUser: true,
    },
    orderBy: [{ templateName: 'asc' }, { createdAt: 'asc' }],
  });

  if (mensagens.length === 0) {
    console.log('\n  Nenhuma WaMessage encontrada com esses templates nos últimos 14 dias.');
    return;
  }

  let currentTemplate = '';
  for (const m of mensagens) {
    if (m.templateName !== currentTemplate) {
      currentTemplate = m.templateName ?? '';
      console.log(`\n  ── Template: ${currentTemplate} ──`);
    }
    const contato = m.conversation?.contact?.name ?? '(sem contato)';
    const telefone = m.conversation?.phone ?? '(sem telefone)';
    const remetente = m.senderUser ? `usuário:${m.senderUser.name}(${m.senderUser.email})` : '(automação/sistema)';
    console.log(
      `    [${m.createdAt.toISOString()}] status=${m.status} ` +
        `errorCode=${m.errorCode ?? '-'} ` +
        `senderType=${m.senderType} ` +
        `senderUserId=${m.senderUserId ?? 'null'} ` +
        `conversationId=${m.conversationId} ` +
        `phone=${telefone} ` +
        `contato="${contato}" ` +
        `remetente=${remetente}`
    );
  }

  console.log(`\n  TOTAL: ${mensagens.length} mensagens encontradas.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 2 — Origem por senderType
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao2() {
  sep('Verificação 2 — Agregação por template + senderType (últimos 14d)');

  type AggRow = { templateName: string; senderType: string; total: bigint };

  const rows = await prisma.$queryRaw<AggRow[]>`
    SELECT "templateName", "senderType", COUNT(*) as total
    FROM "WaMessage"
    WHERE "templateName" IN (${LEGACY_TEMPLATES[0]}, ${LEGACY_TEMPLATES[1]}, ${LEGACY_TEMPLATES[2]}, ${LEGACY_TEMPLATES[3]}, ${LEGACY_TEMPLATES[4]}, ${LEGACY_TEMPLATES[5]})
      AND direction = 'OUTBOUND'
      AND "createdAt" >= NOW() - INTERVAL '14 days'
    GROUP BY "templateName", "senderType"
    ORDER BY "templateName", total DESC
  `;

  if (rows.length === 0) {
    console.log('\n  Nenhum resultado encontrado.');
    return;
  }

  let curTemplate = '';
  for (const row of rows) {
    if (row.templateName !== curTemplate) {
      curTemplate = row.templateName;
      console.log(`\n  Template: ${curTemplate}`);
    }
    console.log(`    senderType=${row.senderType}  total=${row.total}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 3 — Enrollments que dispararam os envios
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao3() {
  sep('Verificação 3 — Enrollments correlacionados via AutomationLog (±5min)');

  // Busca todas as WaMessages dos templates legacy nos últimos 14d
  const mensagens = await prisma.waMessage.findMany({
    where: {
      templateName: { in: [...LEGACY_TEMPLATES] },
      direction: 'OUTBOUND',
      createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      waMessageId: true,
      templateName: true,
      createdAt: true,
      conversationId: true,
    },
  });

  if (mensagens.length === 0) {
    console.log('\n  Nenhuma mensagem para correlacionar.');
    return;
  }

  console.log(`\n  Correlacionando ${mensagens.length} mensagens com AutomationLog...`);

  let encontrados = 0;
  const resumo: Record<string, { automationId: string; automationName: string; automationStatus: string; stepOrder: number; stepTemplateName: string; count: number }> = {};

  for (const msg of mensagens) {
    const janelaBaixo = new Date(msg.createdAt.getTime() - 5 * 60 * 1000);
    const janelaCima = new Date(msg.createdAt.getTime() + 5 * 60 * 1000);

    // Procura por AutomationLog executado dentro da janela de ±5min
    type LogRow = {
      enrollmentId: string;
      automationId: string;
      automationName: string;
      automationStatus: string;
      stepId: string;
      stepOrder: number;
      stepConfig: any;
      result: any;
      executedAt: Date;
    };

    const logs = await prisma.$queryRaw<LogRow[]>`
      SELECT
        al."enrollmentId",
        ae."automationId",
        a."name" as "automationName",
        a."status" as "automationStatus",
        al."stepId",
        ast."order" as "stepOrder",
        ast."config" as "stepConfig",
        al."result",
        al."executedAt"
      FROM "AutomationLog" al
      JOIN "AutomationEnrollment" ae ON ae.id = al."enrollmentId"
      JOIN "Automation" a ON a.id = ae."automationId"
      JOIN "AutomationStep" ast ON ast.id = al."stepId"
      WHERE al."executedAt" BETWEEN ${janelaBaixo} AND ${janelaCima}
        AND al."actionType" = 'SEND_WA_TEMPLATE'
      LIMIT 20
    `;

    for (const log of logs) {
      encontrados++;
      const cfg = log.stepConfig && typeof log.stepConfig === 'object' ? log.stepConfig : {};
      const stepTemplate = cfg.templateName ?? '(desconhecido)';
      const key = `${log.automationId}::step${log.stepOrder}`;
      if (!resumo[key]) {
        resumo[key] = {
          automationId: log.automationId,
          automationName: log.automationName,
          automationStatus: log.automationStatus,
          stepOrder: log.stepOrder,
          stepTemplateName: stepTemplate,
          count: 0,
        };
      }
      resumo[key].count++;

      const resultStr = log.result ? JSON.stringify(log.result).substring(0, 200) : 'null';
      console.log(
        `\n    WaMessage ${msg.id} (template=${msg.templateName}) → ` +
          `AutomationLog em ${log.executedAt.toISOString()}`
      );
      console.log(
        `      enrollment=${log.enrollmentId} | automation="${log.automationName}" (${log.automationId}) ` +
          `status=${log.automationStatus}`
      );
      console.log(
        `      step.order=${log.stepOrder} | step.config.templateName="${stepTemplate}" | result=${resultStr}`
      );
    }
  }

  if (encontrados === 0) {
    console.log('\n  Nenhum AutomationLog correlacionado na janela de ±5min.');
    console.log('  Isso sugere que os envios NÃO vieram do AutomationEngine (ou o log não foi gravado).');
  } else {
    console.log('\n  ── Resumo dos automations que geraram envios ──');
    for (const v of Object.values(resumo)) {
      console.log(
        `    automation="${v.automationName}" (${v.automationId}) ` +
          `status=${v.automationStatus} | step${v.stepOrder} templateName="${v.stepTemplateName}" ` +
          `| correlações=${v.count}`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 4 — Steps que ainda apontam pros templates legacy
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao4() {
  sep('Verificação 4 — AutomationSteps que ainda apontam pra templates legacy');

  type StepRow = {
    stepId: string;
    stepOrder: number;
    stepConfig: any;
    automationId: string;
    automationName: string;
    automationStatus: string;
  };

  const rows = await prisma.$queryRaw<StepRow[]>`
    SELECT
      s.id as "stepId",
      s."order" as "stepOrder",
      s."config" as "stepConfig",
      a.id as "automationId",
      a."name" as "automationName",
      a."status" as "automationStatus"
    FROM "AutomationStep" s
    JOIN "Automation" a ON a.id = s."automationId"
    WHERE s."actionType" = 'SEND_WA_TEMPLATE'
      AND (
        s."config"->>'templateName' IN (
          'cadencia_d4_prova',
          'cadencia_d1_abertura',
          'cadencia_d3_followup',
          'cadencia_d7_encerramento',
          'bgp_no_show_d3_prova_social',
          'bgp_no_show_d2_valor'
        )
      )
    ORDER BY a."name", s."order"
  `;

  if (rows.length === 0) {
    console.log('\n  Nenhum AutomationStep encontrado apontando para templates legacy. Migração de steps foi completa.');
  } else {
    console.log(`\n  ATENCAO: ${rows.length} step(s) ainda apontam pra templates legacy!`);
    for (const r of rows) {
      const cfg = r.stepConfig && typeof r.stepConfig === 'object' ? r.stepConfig : {};
      console.log(
        `\n    Step ${r.stepId} (order=${r.stepOrder}) da automation "${r.automationName}" (${r.automationId}) ` +
          `status=${r.automationStatus}`
      );
      console.log(`    config.templateName="${cfg.templateName}"`);
      console.log(`    config completo: ${JSON.stringify(cfg)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 5 — Broadcasts usando esses templates
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao5() {
  sep('Verificação 5 — WaBroadcasts usando templates legacy');

  const broadcasts = await prisma.waBroadcast.findMany({
    where: {
      template: {
        name: { in: [...LEGACY_TEMPLATES] },
      },
    },
    include: {
      template: true,
      createdBy: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (broadcasts.length === 0) {
    console.log('\n  Nenhum WaBroadcast encontrado vinculado a templates legacy.');
  } else {
    console.log(`\n  ${broadcasts.length} broadcast(s) encontrado(s) usando templates legacy:`);
    for (const b of broadcasts) {
      console.log(`\n    Broadcast: "${b.name}" (${b.id})`);
      console.log(`    status=${b.status} | template="${b.template?.name ?? 'null'}" (${b.templateId})`);
      console.log(
        `    createdAt=${b.createdAt.toISOString()} | ` +
          `startedAt=${b.startedAt?.toISOString() ?? 'null'} | ` +
          `completedAt=${b.completedAt?.toISOString() ?? 'null'}`
      );
      console.log(
        `    totalContacts=${b.totalContacts} | sentCount=${b.sentCount} | ` +
          `failedCount=${b.failedCount} | deliveredCount=${b.deliveredCount}`
      );
      if (b.createdBy) {
        console.log(`    criador: ${b.createdBy.name} (${b.createdBy.email})`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 6 — Busca no código por hardcoded
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao6() {
  sep('Verificação 6 — Busca no código por nomes legacy hardcoded');

  const pattern = LEGACY_TEMPLATES.join('|');
  const searchRoot = path.resolve(__dirname, '../..');

  const filesToCheck = [
    'src/services/automationEngine.ts',
    'src/services/wa/messageRouter.ts',
    'src/services/wa/messageService.ts',
    'src/services/wa/botService.ts',
    'src/routes/cloud-wa-templates.ts',
    'src/routes/wa-broadcasts.ts',
    'src/services/whatsappCloudClient.ts',
  ];

  let ocorrenciasEncontradas = 0;

  for (const relPath of filesToCheck) {
    const fullPath = path.join(searchRoot, relPath);
    try {
      const resultado = execSync(
        `grep -n "${pattern}" "${fullPath}" 2>/dev/null || true`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      if (resultado.trim()) {
        console.log(`\n  ENCONTRADO em ${relPath}:`);
        console.log(resultado.trim());
        ocorrenciasEncontradas++;
      } else {
        console.log(`  OK (sem ocorrências): ${relPath}`);
      }
    } catch {
      console.log(`  (não encontrado/inacessível): ${relPath}`);
    }
  }

  // Busca no diretório web/src/app/waba (se existir)
  const wabaWebDir = path.resolve(searchRoot, '../../packages/web/src/app/waba');
  console.log(`\n  Buscando em packages/web/src/app/waba/...`);
  try {
    const resultado = execSync(
      `grep -rn "${pattern}" "${wabaWebDir}" 2>/dev/null || true`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (resultado.trim()) {
      console.log(`\n  ENCONTRADO no frontend waba/:`);
      console.log(resultado.trim());
      ocorrenciasEncontradas++;
    } else {
      console.log(`  OK (sem ocorrências): packages/web/src/app/waba/`);
    }
  } catch {
    console.log(`  (diretório não encontrado): packages/web/src/app/waba/`);
  }

  // Também busca nos seeds e scripts (excluindo os de migração óbvios)
  console.log(`\n  Buscando em src/seeds/ (excluindo arquivos de seed/migração)...`);
  try {
    const resultado = execSync(
      `grep -rn --include="*.ts" "${pattern}" "${path.join(searchRoot, 'src/seeds')}" 2>/dev/null | grep -v "noShowTemplatesSeed\\|activateNoShowCadence\\|deleteRejectedNoShow" || true`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    if (resultado.trim()) {
      console.log(`\n  ENCONTRADO em src/seeds/ (inesperado):`);
      console.log(resultado.trim());
      ocorrenciasEncontradas++;
    } else {
      console.log(`  OK (sem ocorrências inesperadas): src/seeds/`);
    }
  } catch {
    console.log(`  (erro ao buscar): src/seeds/`);
  }

  console.log(`\n  Total de arquivos com ocorrências hardcoded (excluindo scripts de migração): ${ocorrenciasEncontradas}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação 7 — Migração — checar se rodou completo
// ─────────────────────────────────────────────────────────────────────────────
async function verificacao7() {
  sep('Verificação 7 — Status da migração de 13/maio e enrollments residuais');

  // 7a — Contar enrollments ATIVOS por automation (para as 3 automações migradas)
  const automationIds = ['waba_cad_cf', 'cmnfj0071000013sor2cblyyh', 'cmosrxwk30001gyeu6elv7380'];

  type EnrollRow = { automationId: string; automationName: string; status: string; total: bigint };
  const enrollCount = await prisma.$queryRaw<EnrollRow[]>`
    SELECT
      ae."automationId",
      a."name" as "automationName",
      ae."status",
      COUNT(*) as total
    FROM "AutomationEnrollment" ae
    JOIN "Automation" a ON a.id = ae."automationId"
    WHERE ae."automationId" IN (${automationIds[0]}, ${automationIds[1]}, ${automationIds[2]})
    GROUP BY ae."automationId", a."name", ae."status"
    ORDER BY ae."automationId", ae."status"
  `;

  console.log('\n  Contagem de enrollments por automation e status:');
  if (enrollCount.length === 0) {
    console.log('  (nenhum enrollment encontrado para essas automações)');
  } else {
    let curAuto = '';
    for (const row of enrollCount) {
      if (row.automationId !== curAuto) {
        curAuto = row.automationId;
        console.log(`\n    Automation "${row.automationName}" (${row.automationId}):`);
      }
      console.log(`      status=${row.status} total=${row.total}`);
    }
  }

  // 7b — Enrollments ATIVOS cujo currentStep ainda aponta para template legacy
  console.log('\n  Enrollments ATIVOS cujo currentStep ainda usa template legacy:');

  type ActiveEnrollLegacy = {
    enrollmentId: string;
    automationId: string;
    automationName: string;
    stepId: string;
    stepOrder: number;
    stepConfig: any;
    nextActionAt: Date | null;
    enrolledAt: Date;
  };

  const activeLegacy = await prisma.$queryRaw<ActiveEnrollLegacy[]>`
    SELECT
      ae.id as "enrollmentId",
      ae."automationId",
      a."name" as "automationName",
      ast.id as "stepId",
      ast."order" as "stepOrder",
      ast."config" as "stepConfig",
      ae."nextActionAt",
      ae."enrolledAt"
    FROM "AutomationEnrollment" ae
    JOIN "Automation" a ON a.id = ae."automationId"
    JOIN "AutomationStep" ast ON ast.id = ae."currentStepId"
    WHERE ae."status" = 'ACTIVE'
      AND ast."actionType" = 'SEND_WA_TEMPLATE'
      AND (
        ast."config"->>'templateName' IN (
          'cadencia_d4_prova',
          'cadencia_d1_abertura',
          'cadencia_d3_followup',
          'cadencia_d7_encerramento',
          'bgp_no_show_d3_prova_social',
          'bgp_no_show_d2_valor'
        )
      )
    ORDER BY ae."nextActionAt" ASC
    LIMIT 50
  `;

  if (activeLegacy.length === 0) {
    console.log('  Nenhum enrollment ATIVO encontrado com currentStep apontando para template legacy.');
    console.log('  Isso indica que a migração de enrollments foi bem-sucedida (ou os enrollments avançaram).');
  } else {
    console.log(`\n  ATENCAO: ${activeLegacy.length} enrollment(s) ATIVOS ainda em step com template legacy!`);
    for (const e of activeLegacy) {
      const cfg = e.stepConfig && typeof e.stepConfig === 'object' ? e.stepConfig : {};
      console.log(
        `\n    Enrollment ${e.enrollmentId} | automation="${e.automationName}" | ` +
          `enrolledAt=${e.enrolledAt.toISOString()}`
      );
      console.log(
        `    step.order=${e.stepOrder} | templateName="${cfg.templateName}" | ` +
          `nextActionAt=${e.nextActionAt?.toISOString() ?? 'null'}`
      );
    }
  }

  // 7c — Checar se há metadata de migração nos enrollments
  console.log('\n  Amostra de metadata de enrollments (buscando flag "migrated"):');
  type MetaRow = { enrollmentId: string; automationId: string; metadata: any; enrolledAt: Date };
  const withMeta = await prisma.$queryRaw<MetaRow[]>`
    SELECT ae.id as "enrollmentId", ae."automationId", ae."metadata", ae."enrolledAt"
    FROM "AutomationEnrollment" ae
    WHERE ae."metadata" IS NOT NULL
      AND ae."automationId" IN (${automationIds[0]}, ${automationIds[1]}, ${automationIds[2]})
      AND ae."metadata"::text LIKE '%migrat%'
    LIMIT 10
  `;

  if (withMeta.length === 0) {
    console.log('  Nenhum enrollment com metadata de migração encontrado.');
    console.log('  (O script de migração não gravou flag "migrated" nos enrollments — migrou apenas os steps)');
  } else {
    console.log(`  ${withMeta.length} enrollment(s) com metadata de migração:`);
    for (const m of withMeta) {
      console.log(
        `    enrollment=${m.enrollmentId} | automationId=${m.automationId} | ` +
          `enrolledAt=${m.enrolledAt.toISOString()} | metadata=${JSON.stringify(m.metadata)}`
      );
    }
  }

  // 7d — Checar WaFollowUpState com flag migrated
  type FuState = { id: string; conversationId: string; paused: boolean; followUpCount: number; updatedAt: Date };
  const fups = await prisma.$queryRaw<FuState[]>`
    SELECT id, "conversationId", "paused", "followUpCount", "updatedAt"
    FROM "WaFollowUpState"
    ORDER BY "updatedAt" DESC
    LIMIT 5
  `;
  console.log(`\n  Últimos 5 WaFollowUpState (amostral):`);
  if (fups.length === 0) {
    console.log('  (nenhum encontrado)');
  } else {
    for (const f of fups) {
      console.log(
        `    id=${f.id} | conversationId=${f.conversationId} | paused=${f.paused} | ` +
          `followUpCount=${f.followUpCount} | updatedAt=${f.updatedAt.toISOString()}`
      );
    }
  }

  // 7e — Verificar templates legacy: status atual no banco
  console.log('\n  Status atual dos 6 templates legacy no banco:');
  const templates = await prisma.cloudWaTemplate.findMany({
    where: { name: { in: [...LEGACY_TEMPLATES] } },
    select: { id: true, name: true, status: true, failRate7d: true, sentCount7d: true, updatedAt: true },
  });

  if (templates.length === 0) {
    console.log('  Nenhum template legacy encontrado no banco local. Podem ter sido deletados.');
  } else {
    for (const t of templates) {
      console.log(
        `    "${t.name}" | status=${t.status} | failRate7d=${(t.failRate7d * 100).toFixed(1)}% | ` +
          `sentCount7d=${t.sentCount7d} | updatedAt=${t.updatedAt.toISOString()}`
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Conclusão final
// ─────────────────────────────────────────────────────────────────────────────
async function conclusao() {
  sep('CONCLUSÃO FINAL — Análise e Recomendações');

  // Coleta dados agregados para a análise
  type AggSimple = { templateName: string; senderType: string; total: bigint };
  const agg = await prisma.$queryRaw<AggSimple[]>`
    SELECT "templateName", "senderType", COUNT(*) as total
    FROM "WaMessage"
    WHERE "templateName" IN (${LEGACY_TEMPLATES[0]}, ${LEGACY_TEMPLATES[1]}, ${LEGACY_TEMPLATES[2]}, ${LEGACY_TEMPLATES[3]}, ${LEGACY_TEMPLATES[4]}, ${LEGACY_TEMPLATES[5]})
      AND direction = 'OUTBOUND'
      AND "createdAt" >= NOW() - INTERVAL '14 days'
    GROUP BY "templateName", "senderType"
    ORDER BY total DESC
  `;

  const totalEnvios = agg.reduce((acc, r) => acc + Number(r.total), 0);
  const porSenderType: Record<string, number> = {};
  for (const r of agg) {
    porSenderType[r.senderType] = (porSenderType[r.senderType] ?? 0) + Number(r.total);
  }

  // Steps ainda legacy
  type StepCount = { total: bigint };
  const [stepsLegacyCount] = await prisma.$queryRaw<StepCount[]>`
    SELECT COUNT(*) as total
    FROM "AutomationStep" s
    WHERE s."actionType" = 'SEND_WA_TEMPLATE'
      AND s."config"->>'templateName' IN (
        'cadencia_d4_prova', 'cadencia_d1_abertura', 'cadencia_d3_followup',
        'cadencia_d7_encerramento', 'bgp_no_show_d3_prova_social', 'bgp_no_show_d2_valor'
      )
  `;

  // Enrollments ativos legacy
  type EnrollCount = { total: bigint };
  const [enrollsAtivosLegacy] = await prisma.$queryRaw<EnrollCount[]>`
    SELECT COUNT(*) as total
    FROM "AutomationEnrollment" ae
    JOIN "AutomationStep" ast ON ast.id = ae."currentStepId"
    WHERE ae."status" = 'ACTIVE'
      AND ast."actionType" = 'SEND_WA_TEMPLATE'
      AND ast."config"->>'templateName' IN (
        'cadencia_d4_prova', 'cadencia_d1_abertura', 'cadencia_d3_followup',
        'cadencia_d7_encerramento', 'bgp_no_show_d3_prova_social', 'bgp_no_show_d2_valor'
      )
  `;

  console.log('\n  ── SUMÁRIO DOS DADOS ──');
  console.log(`  Total de envios legacy nos últimos 14 dias: ${totalEnvios}`);
  console.log('  Distribuição por senderType:');
  for (const [tipo, qtd] of Object.entries(porSenderType)) {
    console.log(`    ${tipo}: ${qtd} envios`);
  }
  console.log(`  Steps de automação ainda apontando para legacy: ${stepsLegacyCount?.total ?? 0}`);
  console.log(`  Enrollments ATIVOS com currentStep legacy: ${enrollsAtivosLegacy?.total ?? 0}`);

  console.log('\n  ── ANÁLISE ──');

  const waBot = porSenderType['WA_BOT'] ?? 0;
  const waHuman = porSenderType['WA_HUMAN'] ?? 0;
  const waSystem = porSenderType['WA_SYSTEM'] ?? 0;
  const stepsRestantes = Number(stepsLegacyCount?.total ?? 0);
  const enrollsRestantes = Number(enrollsAtivosLegacy?.total ?? 0);

  if (waBot > 0) {
    console.log(
      `\n  1. FONTE PRINCIPAL PROVÁVEL — AutomationEngine (senderType=WA_BOT): ${waBot} envios.`
    );
    console.log(
      '     O AutomationEngine usa o nome do template gravado no AutomationStep.config.templateName.'
    );
    if (stepsRestantes > 0) {
      console.log(
        `     ALERTA: ${stepsRestantes} step(s) AINDA apontam para templates legacy. ` +
          'Esses steps disparam mensagens com o nome legacy mesmo após a migração.'
      );
    }
    if (enrollsRestantes > 0) {
      console.log(
        `     ALERTA: ${enrollsRestantes} enrollment(s) ativos com currentStep legacy. ` +
          'Quando o timer disparar, esses contatos vão receber o template legacy.'
      );
    }
    if (stepsRestantes === 0 && enrollsRestantes > 0) {
      console.log(
        '     HIPOTESE: Os steps já foram migrados, mas enrollments que estavam em PAUSED ' +
          'ou aguardando timer foram REATIVADOS após a migração e retomaram no passo anterior ' +
          '(com o nome antigo já executado no contexto do engine). ' +
          'Verifique se o engine usa o config do step no momento do disparo ou o config gravado no enrollment.'
      );
    }
  }

  if (waHuman > 0) {
    console.log(
      `\n  2. ENVIO MANUAL via UI (senderType=WA_HUMAN): ${waHuman} envios.`
    );
    console.log(
      '     Um usuário humano enviou manualmente o template legacy pelo inbox do CRM. ' +
        'O senderUserId identifica quem foi. Verificar se a UI de templates ainda mostra templates DISABLED.'
    );
  }

  if (waSystem > 0) {
    console.log(
      `\n  3. ENVIO SYSTEM (senderType=WA_SYSTEM): ${waSystem} envios.`
    );
    console.log(
      '     Pode ser broadcast, cron job direto, ou outro serviço sistêmico não relacionado ao AutomationEngine.'
    );
  }

  if (totalEnvios === 0) {
    console.log(
      '\n  Nenhum envio encontrado nos últimos 14 dias nas tabelas WaMessage. ' +
        'Verificar se os dados estão na tabela CloudWaMessageLog (sistema legado Z-API) ' +
        'ou se o período deve ser ampliado.'
    );
  }

  console.log('\n  ── MIGRAÇÃO DE 13/MAIO — COBERTURA ──');
  console.log(
    '  O script migrateCadenceTemplatesV2_2026_05_13.ts fez 3 coisas:'
  );
  console.log('    (a) Criou 17 templates novos (v2) na Meta + banco local.');
  console.log('    (b) Atualizou o config.templateName dos AutomationSteps das 3 cadências.');
  console.log('    (c) Marcou os 15 templates antigos como DISABLED no banco local.');
  console.log(
    '  O que NÃO foi feito: não migrou o templateName nos logs de AutomationLog já gravados, ' +
      'nem garantiu que enrollments que estavam em execução seriam reiniciados com o novo nome.'
  );
  if (stepsRestantes > 0) {
    console.log(
      `\n  LACUNA DETECTADA: ${stepsRestantes} step(s) de automações não cobertas pelos 3 IDs da migração ` +
        'ainda apontam para templates legacy. Pode ser uma automação DIFERENTE das 3 mapeadas (ex: automação de teste, ' +
        'cópia de cadência, ou automação criada manualmente sem o sufixo).'
    );
  } else {
    console.log(
      '\n  Steps migrados com sucesso (zero steps legacy nos 6 templates investigados).'
    );
  }

  console.log('\n  ── TOP 3 AÇÕES CORRETIVAS ──');
  console.log(
    '\n  1. [URGENTE — se stepsRestantes > 0] Identificar as automações com steps legacy ' +
      'restantes (retornados na Verificação 4) e atualizar manualmente o config.templateName ' +
      'para o nome v2/v3 correspondente. Isso impede novos disparos com o nome queimado.'
  );
  console.log(
    '\n  2. [URGENTE — se enrollsRestantes > 0] Para cada enrollment ATIVO com currentStep legacy, ' +
      'decidir entre: (a) avançar o enrollment para o próximo step via UPDATE, ' +
      '(b) pausar o enrollment para evitar o disparo com template queimado, ' +
      'ou (c) re-enfileirar no step equivalente v2/v3.'
  );
  console.log(
    '\n  3. [MÉDIO PRAZO] Auditar a UI do inbox/templates do CRM para garantir que templates com status ' +
      'DISABLED não apareçam na lista de envio manual. Se WA_HUMAN envios foram detectados, ' +
      'adicionar filtro `status: { not: DISABLED }` na rota que lista templates para envio avulso.'
  );

  console.log('\n  ── FIM DA ANÁLISE ──\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(70));
  console.log('  findLegacyTemplateSenders_2026_05_18 — Investigação de origem');
  console.log('  Templates legacy com envios nos últimos 14 dias');
  console.log('  Data de execução: ' + new Date().toISOString());
  console.log('═'.repeat(70));

  try {
    await verificacao1();
    await verificacao2();
    await verificacao3();
    await verificacao4();
    await verificacao5();
    await verificacao6();
    await verificacao7();
    await conclusao();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nERRO FATAL:', err);
  process.exit(1);
});
