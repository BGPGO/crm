import { PrismaClient } from '@prisma/client';
import {
  htmlBoasVindas1,
  htmlBoasVindas2,
  htmlConversaRealizada,
  htmlReuniaoAgendada,
  htmlEnvioFeito,
  htmlAguardandoDados,
  htmlAguardandoAssinatura,
  compileFullHtml,
  buildJsonContent,
} from './emailAutomationTemplates';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getStageIdByName(name: string): Promise<string> {
  const stage = await prisma.pipelineStage.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!stage) throw new Error(`Stage "${name}" não encontrado`);
  return stage.id;
}

// ─── Definitions ─────────────────────────────────────────────────────────────

interface TemplateDef {
  name: string;
  subject: string;
  htmlFn: () => string;
}

interface StepDef {
  actionType: 'SEND_EMAIL' | 'WAIT';
  templateIndex?: number; // index into automation's templates array
  waitDuration?: number;
  waitUnit?: 'minutes' | 'hours' | 'days';
}

interface AutomationDef {
  name: string;
  stageName: string;
  templates: TemplateDef[];
  steps: StepDef[];
}

const AUTOMATION_DEFS: AutomationDef[] = [
  // ── 1. Contato Feito (Boas-vindas) ────────────────────────────────────────
  {
    name: 'Email Auto — Contato Feito (Boas-vindas)',
    stageName: 'Contato Feito',
    templates: [
      {
        name: 'Boas-vindas #1 — Contato Feito',
        subject: 'Bem-vindo(a) à BGP GO, *|PRIMEIRO_NOME|*!',
        htmlFn: htmlBoasVindas1,
      },
      {
        name: 'Boas-vindas #2 — Contato Feito',
        subject: 'Crescer sem controle financeiro é pilotar no escuro',
        htmlFn: htmlBoasVindas2,
      },
    ],
    // SEND_EMAIL[0] → WAIT 24h → SEND_EMAIL[1]
    steps: [
      { actionType: 'SEND_EMAIL', templateIndex: 0 },
      { actionType: 'WAIT', waitDuration: 24, waitUnit: 'hours' },
      { actionType: 'SEND_EMAIL', templateIndex: 1 },
    ],
  },

  // ── 2. Marcar Reunião ──────────────────────────────────────────────────────
  {
    name: 'Email Auto — Marcar Reunião',
    stageName: 'Marcar Reunião',
    templates: [
      {
        name: 'Conversa Realizada — Marcar Reunião',
        subject: 'Foi bom falar com você, *|PRIMEIRO_NOME|*!',
        htmlFn: htmlConversaRealizada,
      },
    ],
    steps: [{ actionType: 'SEND_EMAIL', templateIndex: 0 }],
  },

  // ── 3. Reunião Marcada ─────────────────────────────────────────────────────
  {
    name: 'Email Auto — Reunião Marcada',
    stageName: 'Reunião Marcada',
    templates: [
      {
        name: 'Reunião Agendada — Reunião Marcada',
        subject: 'Sua reunião está confirmada!',
        htmlFn: htmlReuniaoAgendada,
      },
    ],
    steps: [{ actionType: 'SEND_EMAIL', templateIndex: 0 }],
  },

  // ── 4. Proposta Enviada ────────────────────────────────────────────────────
  {
    name: 'Email Auto — Proposta Enviada',
    stageName: 'Proposta Enviada',
    templates: [
      {
        name: 'Envio Feito — Proposta Enviada',
        subject: 'Sua proposta personalizada chegou',
        htmlFn: htmlEnvioFeito,
      },
    ],
    steps: [{ actionType: 'SEND_EMAIL', templateIndex: 0 }],
  },

  // ── 5. Aguardando Dados ────────────────────────────────────────────────────
  {
    name: 'Email Auto — Aguardando Dados',
    stageName: 'Aguardando Dados',
    templates: [
      {
        name: 'Aguardando Dados — Etapa',
        subject: 'Só faltam alguns dados pra começar',
        htmlFn: htmlAguardandoDados,
      },
    ],
    steps: [{ actionType: 'SEND_EMAIL', templateIndex: 0 }],
  },

  // ── 6. Aguardando Assinatura ───────────────────────────────────────────────
  {
    name: 'Email Auto — Aguardando Assinatura',
    stageName: 'Aguardando Assinatura',
    templates: [
      {
        name: 'Aguardando Assinatura — Etapa',
        subject: 'Estamos a um passo de começar',
        htmlFn: htmlAguardandoAssinatura,
      },
    ],
    steps: [{ actionType: 'SEND_EMAIL', templateIndex: 0 }],
  },
];

// ─── Main Seed ────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Criando automações de email por etapa do funil...\n');

  let created = 0;
  let skipped = 0;
  const createdIds: string[] = [];

  for (const def of AUTOMATION_DEFS) {
    // Skip if automation already exists
    const existing = await prisma.automation.findFirst({
      where: { name: def.name },
    });

    if (existing) {
      console.log(`⏭  "${def.name}" já existe (id: ${existing.id}) — pulando`);
      skipped++;
      continue;
    }

    // Resolve stageId by name
    const stageId = await getStageIdByName(def.stageName);

    // Create EmailTemplates — persist both htmlContent (compileFullHtml) and
    // jsonContent ({design, bodyHtml}), same as the editor saves. jsonContent
    // is what the editor reads on load, so without it the editor falls back
    // to htmlContent (raw) and renders the outer layout tables inside the
    // contentEditable area — visually duplicating the background.
    const templateIds: string[] = [];
    for (const tmpl of def.templates) {
      const bodyHtml = tmpl.htmlFn();
      const emailTemplate = await prisma.emailTemplate.create({
        data: {
          name: tmpl.name,
          subject: tmpl.subject,
          htmlContent: compileFullHtml(bodyHtml),
          jsonContent: buildJsonContent(bodyHtml),
          isActive: true,
        },
      });
      templateIds.push(emailTemplate.id);
    }

    // Create Automation (NOT isCadence — avoids cadenceEnabled bloqueio).
    // kind='email-by-stage' permite que a UI agrupe essas automations numa
    // seção própria (separadas de cadências WhatsApp e automations regulares).
    const automation = await prisma.automation.create({
      data: {
        name: def.name,
        status: 'DRAFT',
        triggerType: 'STAGE_CHANGED',
        triggerConfig: {
          kind: 'email-by-stage',
          stageId,
          stageName: def.stageName,
        },
      },
    });

    // Create AutomationSteps
    const createdStepIds: string[] = [];
    let order = 1;

    for (const step of def.steps) {
      let config: Record<string, unknown>;

      if (step.actionType === 'SEND_EMAIL') {
        const templateId = templateIds[step.templateIndex!];
        config = { templateId };
      } else {
        config = {
          duration: step.waitDuration,
          unit: step.waitUnit,
        };
      }

      const createdStep = await prisma.automationStep.create({
        data: {
          order,
          actionType: step.actionType as any,
          config,
          automationId: automation.id,
        },
      });

      createdStepIds.push(createdStep.id);
      order++;
    }

    // Link steps sequentially via nextStepId
    for (let i = 0; i < createdStepIds.length - 1; i++) {
      await prisma.automationStep.update({
        where: { id: createdStepIds[i] },
        data: { nextStepId: createdStepIds[i + 1] },
      });
    }

    console.log(
      `✅ "${def.name}" criada — id: ${automation.id} | ${createdStepIds.length} steps | templates: [${templateIds.join(', ')}]`
    );
    created++;
    createdIds.push(automation.id);
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Resumo:`);
  console.log(`  Automações criadas : ${created}`);
  console.log(`  Automações puladas : ${skipped}`);
  if (createdIds.length > 0) {
    console.log(`  IDs gerados        : ${createdIds.join(', ')}`);
  }
  console.log(`\nAtive as automações na página de Automações do CRM quando os HTMLs estiverem prontos.`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}

export { seed };
