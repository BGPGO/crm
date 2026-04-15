/**
 * Smoke test final antes de ativar as 6 automações de email por etapa.
 *
 * Verifica:
 * 1. As 6 automations existem no banco
 * 2. Todas estão como DRAFT (não ativadas ainda)
 * 3. triggerConfig correto: kind='email-by-stage', isCadence ausente/false
 * 4. Steps são APENAS SEND_EMAIL ou WAIT (nenhum MARK_LOST, MOVE_PIPELINE_STAGE, ADD_TAG)
 * 5. stageId das automations existe e corresponde ao stageName
 * 6. Todos os templates referenciados existem e têm htmlContent
 * 7. Nenhuma automação com isCadence=true acidental que tenha kind='email-by-stage'
 *
 * Run: npx tsx packages/api/src/seeds/preActivationSmokeTest.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPECTED_NAMES = [
  'Email Auto — Contato Feito (Boas-vindas)',
  'Email Auto — Marcar Reunião',
  'Email Auto — Reunião Marcada',
  'Email Auto — Proposta Enviada',
  'Email Auto — Aguardando Dados',
  'Email Auto — Aguardando Assinatura',
];

const SAFE_ACTION_TYPES = new Set(['SEND_EMAIL', 'WAIT']);
const DANGEROUS_ACTION_TYPES = new Set([
  'MARK_LOST',
  'MOVE_PIPELINE_STAGE',
  'ADD_TAG',
  'REMOVE_TAG',
  'UPDATE_FIELD',
  'SEND_WHATSAPP',
  'SEND_WHATSAPP_AI',
  'SEND_WA_TEMPLATE',
  'WAIT_FOR_RESPONSE',
  'CONDITION',
]);

interface Issue {
  level: 'error' | 'warn';
  automation: string;
  msg: string;
}

async function run() {
  const issues: Issue[] = [];
  const info: string[] = [];

  console.log('🔎 Smoke test — pré-ativação dos emails por etapa\n');

  // ─── 1. Automations ─────────────────────────────────────────────────────
  for (const name of EXPECTED_NAMES) {
    const a = await prisma.automation.findFirst({
      where: { name },
      include: {
        steps: { orderBy: { order: 'asc' } },
      },
    });

    if (!a) {
      issues.push({ level: 'error', automation: name, msg: 'NÃO ENCONTRADA no banco' });
      continue;
    }

    const cfg = (a.triggerConfig as Record<string, unknown>) || {};

    // 2. Status DRAFT
    if (a.status !== 'DRAFT') {
      issues.push({
        level: 'warn',
        automation: name,
        msg: `status='${a.status}' (já está ativa — se foi intencional, ignore)`,
      });
    }

    // 3. triggerType = STAGE_CHANGED
    if (a.triggerType !== 'STAGE_CHANGED') {
      issues.push({
        level: 'error',
        automation: name,
        msg: `triggerType='${a.triggerType}' (esperado STAGE_CHANGED)`,
      });
    }

    // 4. kind = email-by-stage
    if (cfg.kind !== 'email-by-stage') {
      issues.push({
        level: 'error',
        automation: name,
        msg: `triggerConfig.kind='${cfg.kind}' (esperado 'email-by-stage' — isolamento quebra!)`,
      });
    }

    // 5. isCadence AUSENTE ou false
    if (cfg.isCadence === true) {
      issues.push({
        level: 'error',
        automation: name,
        msg: `isCadence=true 🔴 CRÍTICO: isso faria o deal ser marcado LOST quando completar!`,
      });
    }

    // 6. stageId existe
    const stageId = cfg.stageId as string | undefined;
    if (!stageId) {
      issues.push({ level: 'error', automation: name, msg: 'triggerConfig.stageId ausente' });
    } else {
      const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
      if (!stage) {
        issues.push({ level: 'error', automation: name, msg: `stageId=${stageId} não existe mais` });
      } else if (stage.name !== cfg.stageName) {
        issues.push({
          level: 'warn',
          automation: name,
          msg: `stageName no config ('${cfg.stageName}') difere do banco ('${stage.name}')`,
        });
      }
    }

    // 7. Steps seguros
    const actionTypes = a.steps.map((s) => s.actionType);
    const dangerous = actionTypes.filter((at) => DANGEROUS_ACTION_TYPES.has(at));
    if (dangerous.length > 0) {
      issues.push({
        level: 'error',
        automation: name,
        msg: `Action type perigoso: ${dangerous.join(', ')} — pode alterar o deal!`,
      });
    }
    const unknownTypes = actionTypes.filter((at) => !SAFE_ACTION_TYPES.has(at) && !DANGEROUS_ACTION_TYPES.has(at));
    if (unknownTypes.length > 0) {
      issues.push({
        level: 'warn',
        automation: name,
        msg: `Action type desconhecido: ${unknownTypes.join(', ')}`,
      });
    }

    // 8. Templates referenciados existem + têm conteúdo
    for (const step of a.steps) {
      if (step.actionType !== 'SEND_EMAIL') continue;
      const cfgStep = step.config as Record<string, unknown>;
      const tmplId = cfgStep?.templateId as string | undefined;
      if (!tmplId) {
        issues.push({
          level: 'error',
          automation: name,
          msg: `Step SEND_EMAIL order=${step.order} sem templateId`,
        });
        continue;
      }
      const tmpl = await prisma.emailTemplate.findUnique({
        where: { id: tmplId },
        select: { id: true, name: true, subject: true, htmlContent: true },
      });
      if (!tmpl) {
        issues.push({
          level: 'error',
          automation: name,
          msg: `Template ${tmplId} não existe`,
        });
      } else if (!tmpl.htmlContent || tmpl.htmlContent.length < 100) {
        issues.push({
          level: 'error',
          automation: name,
          msg: `Template "${tmpl.name}" tem htmlContent vazio ou curto demais`,
        });
      } else if (!tmpl.subject) {
        issues.push({
          level: 'warn',
          automation: name,
          msg: `Template "${tmpl.name}" sem subject`,
        });
      }
    }

    info.push(
      `  • "${a.name}" — ${a.status}, ${a.steps.length} step(s) [${actionTypes.join(' → ')}]`
    );
  }

  // ─── 9. Outras automations com kind='email-by-stage' não previstas ──────
  const rogueEmailByStage = await prisma.automation.findMany({
    where: {
      triggerConfig: { path: ['kind'], equals: 'email-by-stage' },
      name: { notIn: EXPECTED_NAMES },
    },
    select: { id: true, name: true, status: true },
  });
  if (rogueEmailByStage.length > 0) {
    for (const a of rogueEmailByStage) {
      issues.push({
        level: 'warn',
        automation: a.name,
        msg: `Automação extra com kind='email-by-stage' (não prevista) status=${a.status}`,
      });
    }
  }

  // ─── 10. Automations isCadence=true com kind='email-by-stage' ───────────
  const conflictAutomations = await prisma.automation.findMany({
    where: {
      AND: [
        { triggerConfig: { path: ['isCadence'], equals: true } },
        { triggerConfig: { path: ['kind'], equals: 'email-by-stage' } },
      ],
    },
    select: { id: true, name: true },
  });
  if (conflictAutomations.length > 0) {
    for (const a of conflictAutomations) {
      issues.push({
        level: 'error',
        automation: a.name,
        msg: `CRÍTICO: isCadence=true E kind='email-by-stage' — config conflitante!`,
      });
    }
  }

  // ─── Report ─────────────────────────────────────────────────────────────
  console.log('📋 Automations:');
  info.forEach((line) => console.log(line));

  console.log('\n──────────────────────────────────────────');

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  if (errors.length === 0 && warns.length === 0) {
    console.log('\n✅ TODOS OS CHECKS PASSARAM — seguro para ativar');
  } else {
    if (warns.length > 0) {
      console.log(`\n⚠️  Warnings (${warns.length}):`);
      warns.forEach((w) => console.log(`  • [${w.automation}] ${w.msg}`));
    }
    if (errors.length > 0) {
      console.log(`\n🔴 ERRORS (${errors.length}) — BLOQUEIAM ativação segura:`);
      errors.forEach((e) => console.log(`  • [${e.automation}] ${e.msg}`));
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
