/**
 * Seed: Automações WABA para cadências de follow-up
 *
 * Cria:
 * 1. "Cadência Etapa 3 — Marcar reunião WABA" (7 templates + MARK_LOST)
 * 2. "Confirmação — Reunião agendada" (1 template)
 *
 * Executar: cd packages/api && npx tsx src/scripts/seedWabaAutomations.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StepDef {
  order: number;
  actionType: string;
  config: Record<string, unknown>;
  label?: string;
}

function waTemplate(order: number, templateName: string, label: string): StepDef {
  return {
    order,
    actionType: 'SEND_WA_TEMPLATE',
    config: { templateName, language: 'pt_BR', _label: label },
    label,
  };
}

function wait(order: number, duration: number, unit: 'minutes' | 'hours' | 'days'): StepDef {
  return {
    order,
    actionType: 'WAIT',
    config: { duration, unit },
    label: `Aguardar ${duration} ${unit === 'hours' ? 'hora(s)' : unit === 'days' ? 'dia(s)' : 'min'}`,
  };
}

// ─── Cadência Marcar Reunião WABA ──────────────────────────────────────────

function buildMarcarReuniaoSteps(): StepDef[] {
  const steps: StepDef[] = [];
  let o = 1;

  // WAIT 1d — dá tempo para a Bia agendar via conversa
  steps.push(wait(o++, 1, 'days'));

  // D1
  steps.push(waTemplate(o++, 'reuniao_d1_abertura', 'D1 — Abertura agendamento'));
  steps.push(wait(o++, 1, 'days'));

  // D2
  steps.push(waTemplate(o++, 'reuniao_d2_facilitar', 'D2 — Facilitar horários'));
  steps.push(wait(o++, 1, 'days'));

  // D3
  steps.push(waTemplate(o++, 'reuniao_d3_oque_acontece', 'D3 — O que acontece na reunião'));
  steps.push(wait(o++, 1, 'days'));

  // D4
  steps.push(waTemplate(o++, 'reuniao_d4_resultado', 'D4 — Resultado real'));
  steps.push(wait(o++, 1, 'days'));

  // D5
  steps.push(waTemplate(o++, 'reuniao_d5_objecao', 'D5 — Quebra de objeção'));
  steps.push(wait(o++, 1, 'days'));

  // D6
  steps.push(waTemplate(o++, 'reuniao_d6_urgencia', 'D6 — Urgência'));
  steps.push(wait(o++, 1, 'days'));

  // D7
  steps.push(waTemplate(o++, 'reuniao_d7_encerramento', 'D7 — Encerramento'));

  // MARK_LOST
  steps.push({
    order: o++,
    actionType: 'MARK_LOST',
    config: { _label: 'Marcar como perdido' },
    label: 'Marcar como perdido',
  });

  return steps;
}

// ─── Confirmação Reunião Agendada ──────────────────────────────────────────

function buildReuniaoAgendadaSteps(): StepDef[] {
  return [
    waTemplate(1, 'confirmacao_reuniao', 'Confirmação de reunião agendada'),
  ];
}

// ─── Seed ──────────────────────────────────────────────────────────────────

interface AutomationDef {
  name: string;
  description: string;
  stageName: string;
  steps: StepDef[];
}

async function findStageId(stageName: string): Promise<string | null> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!pipeline) return null;
  const stage = pipeline.stages.find(
    s => s.name.toLowerCase().includes(stageName.toLowerCase())
  );
  return stage?.id || null;
}

async function seed() {
  console.log('Criando automações WABA...\n');

  const marcarReuniaoId = await findStageId('marcar reuni');
  const reuniaoAgendadaId = await findStageId('agendada');

  if (!marcarReuniaoId) {
    console.error('❌ Etapa "Marcar reunião" não encontrada no pipeline');
    return;
  }
  if (!reuniaoAgendadaId) {
    console.error('❌ Etapa "Reunião agendada" não encontrada no pipeline');
    return;
  }

  const automations: Array<AutomationDef & { stageId: string }> = [
    {
      name: 'Cadência Etapa 3 — Marcar reunião WABA',
      description: '7 dias · 7 templates WhatsApp · Ativada quando lead precisa agendar reunião (WABA Cloud API). Espera 24h para Bia tentar agendar antes de iniciar templates.',
      stageName: 'Marcar reunião',
      stageId: marcarReuniaoId,
      steps: buildMarcarReuniaoSteps(),
    },
    {
      name: 'Confirmação — Reunião agendada',
      description: '1 template de confirmação · Ativada quando reunião é marcada',
      stageName: 'Reunião agendada',
      stageId: reuniaoAgendadaId,
      steps: buildReuniaoAgendadaSteps(),
    },
  ];

  for (const automation of automations) {
    // Verifica se já existe
    const existing = await prisma.automation.findFirst({
      where: { name: automation.name },
    });

    if (existing) {
      console.log(`⏭  "${automation.name}" já existe (id: ${existing.id}) — pulando`);
      continue;
    }

    // Cria automação
    const created = await prisma.automation.create({
      data: {
        name: automation.name,
        description: automation.description,
        status: 'DRAFT', // Começa desativada
        triggerType: 'STAGE_CHANGED',
        triggerConfig: {
          stageId: automation.stageId,
          stageName: automation.stageName,
          isCadence: true,
        },
      },
    });

    // Cria steps com linking sequencial
    const createdSteps: Array<{ id: string; order: number }> = [];

    for (const step of automation.steps) {
      const s = await prisma.automationStep.create({
        data: {
          order: step.order,
          actionType: step.actionType as any,
          config: {
            ...step.config,
            ...(step.label ? { _label: step.label } : {}),
          },
          automationId: created.id,
        },
      });
      createdSteps.push({ id: s.id, order: s.order });
    }

    // Linka steps sequencialmente
    for (let i = 0; i < createdSteps.length - 1; i++) {
      await prisma.automationStep.update({
        where: { id: createdSteps[i].id },
        data: { nextStepId: createdSteps[i + 1].id },
      });
    }

    console.log(`✅ "${automation.name}" criada com ${createdSteps.length} etapas (status: DRAFT)`);
  }

  console.log('\nAutomações WABA criadas! Ative-as na página de Automações.');
}

seed()
  .catch((err) => {
    console.error('Erro ao criar automações:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
