/**
 * Seed: Cadência de Reaquecimento pós No-Show — BGP
 *
 * Cria a Tag "no-show" + a Automation que dispara quando essa tag é
 * aplicada ao contato. O endpoint POST /api/deals/:id/no-show aplica
 * a tag automaticamente quando o vendedor marca um deal como no-show.
 *
 * Pausa/cancelamento (modelo padrão de cadência):
 * - Lead remarca (deal volta pra "Reunião Agendada"): STAGE_CHANGED
 *   dispara interruptCadenceOnStageChange → cancela enrollment
 *   (triggerConfig.isCadence=true, stageId diferente do novo).
 * - Lead responde no WhatsApp: interruptCadenceOnResponse → pausa.
 * - Chega no último step: enrollment vai pra COMPLETED naturalmente.
 *
 * Uso: npm run seed:no-show-cadence --workspace=packages/api
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Configuração ─────────────────────────────────────────────────────────────

const TAG_NAME = 'no-show';
const TAG_COLOR = '#F59E0B'; // amber-500 — alerta visual

const AUTOMATION_NAME = 'Cadência No-Show — BGP';
const AUTOMATION_DESCRIPTION =
  '7 dias · 5 mensagens WhatsApp · Reaquecimento de leads que não compareceram à reunião. Disparada via tag "no-show" aplicada pelo endpoint /deals/:id/no-show. Pausa quando lead remarca (volta pra Reunião Agendada) ou responde.';

// Contexto pra IA gerar mensagens humanizadas mas mantendo a estrutura
// definida no docx CADENCIA NO SHOW.
const NO_SHOW_AI_CONTEXT = `CONTEXTO IMPORTANTE:
- O lead estava agendado para uma reunião (Diagnóstico Financeiro de 20-30 min sobre o GoBI / GoControladoria) e NÃO compareceu.
- O deal foi automaticamente movido pra etapa "Marcar Reunião" e flagged como no-show.
- Este é o reaquecimento pós no-show — tom respeitoso, sem cobrança, sem culpar o lead.
- Mensagem CURTA (1-3 linhas no máximo), em WhatsApp, direta ao ponto.
- Use o primeiro nome do lead naturalmente.
- Sem emojis. Sem markdown. Sem "olá" formal — vá direto.
- Adapte ao setor do contato se houver, senão genérico.`;

interface StepDef {
  order: number;
  actionType: 'SEND_WHATSAPP_AI' | 'WAIT';
  config: Record<string, unknown>;
  label: string;
}

function waMsg(order: number, day: string, label: string, prompt: string): StepDef {
  return {
    order,
    actionType: 'SEND_WHATSAPP_AI',
    config: {
      objective: `No-Show ${day} — ${label}`,
      prompt: `${prompt}\n\n${NO_SHOW_AI_CONTEXT}`,
    },
    label: `${day} — ${label}`,
  };
}

function wait(order: number, duration: number, unit: 'minutes' | 'hours' | 'days', label: string): StepDef {
  return {
    order,
    actionType: 'WAIT',
    config: { duration, unit },
    label,
  };
}

function buildSteps(): StepDef[] {
  let o = 1;
  const steps: StepDef[] = [];

  // D1 — até 2h após reunião perdida
  steps.push(
    waMsg(
      o++,
      'D1',
      'Reabertura imediata',
      `Mensagem de reabertura suave, sem cobrança. Use exatamente esta estrutura adaptando o nome:
"Oi {primeiro_nome}, tudo bem? Vi que você não conseguiu falar com a gente hoje. Quando seria um bom momento pra você?"

Pode personalizar levemente o tom mantendo a essência. NÃO mencione "você não veio" ou "você sumiu". Tom de quem se preocupou, não de quem cobra.`,
    ),
  );
  steps.push(wait(o++, 22, 'hours', 'Aguardar até manhã do D2'));

  // D2 — manhã, abordagem de valor
  steps.push(
    waMsg(
      o++,
      'D2',
      'Abordagem de valor',
      `Aborde a dor do negócio mostrando empatia e propondo retomar o agendamento. Use esta estrutura adaptando ao setor (se houver) e ao nome:
"{primeiro_nome}, muitos gestores que a gente atende enfrentam dificuldade em ter visibilidade real dos números do negócio. Vale tentarmos novamente 30 min pra ver se faz sentido pra você?"

Se setor preenchido, troque "muitos gestores que a gente atende" por linguagem do setor (ex: "muitos donos de [setor] enfrentam..."). Mantém CTA de 30 min de retomada.`,
    ),
  );
  steps.push(wait(o++, 1, 'days', 'Aguardar 1 dia até D3'));

  // D3 — mudança de ângulo, prova social
  steps.push(
    waMsg(
      o++,
      'D3',
      'Prova social setor',
      `Use prova social ou resultado de cliente similar. Estrutura adaptando ao setor e nome:
"Um cliente do mesmo segmento que o seu reduziu em mais de 30% o tempo gasto com fechamento financeiro em 60 dias. Posso te mostrar como em uma reunião rápida?"

Se setor preenchido, mencione o setor especificamente. Se não, "do seu segmento" funciona genérico. Mantém CTA pra reunião rápida.`,
    ),
  );
  steps.push(wait(o++, 2, 'days', 'Aguardar 2 dias até D5'));

  // D5 — ligação manual + WhatsApp (vendedor liga em paralelo, mensagem é o follow)
  steps.push(
    waMsg(
      o++,
      'D5',
      'Ligação + follow WA',
      `O vendedor acabou de ligar (ou tentou ligar). Use esta estrutura adaptando ao nome:
"{primeiro_nome}, tentei te ligar agora. Queria entender se ainda faz sentido a gente conversar e remarcar aquela reunião. Me fala quando tiver um minuto?"

Tom respeitoso, sem pressão, abre porta pra retomada. NÃO insistir.`,
    ),
  );
  steps.push(wait(o++, 2, 'days', 'Aguardar 2 dias até D7'));

  // D7 — encerramento / breakup
  steps.push(
    waMsg(
      o++,
      'D7',
      'Breakup respeitoso',
      `Mensagem de encerramento da cadência. Tom de breakup respeitoso, porta aberta. Estrutura:
"{primeiro_nome}, entendi que talvez não seja a prioridade ter o controle total dos números do seu negócio agora... Não quero tomar seu tempo se não for o momento certo. Se mudar de ideia, é só falar, fico à disposição."

Adapte sutilmente sem perder o tom. NÃO insista, NÃO pergunte de novo, NÃO ofereça mais reuniões — é o breakup. Última mensagem da cadência.`,
    ),
  );

  return steps;
}

// ─── Main seed ────────────────────────────────────────────────────────────────

async function main() {
  console.log('[no-show-cadence] iniciando...');

  // 1. Garante tag "no-show"
  const tag = await prisma.tag.upsert({
    where: { name: TAG_NAME },
    create: { name: TAG_NAME, color: TAG_COLOR, brand: 'BGP' },
    update: { brand: 'BGP' },
  });
  console.log(`[no-show-cadence] Tag "${TAG_NAME}" (id=${tag.id}, brand=${tag.brand})`);

  // 2. Pega stage "Marcar reunião" do pipeline BGP padrão
  const defaultPipeline = await prisma.pipeline.findFirst({
    where: { isDefault: true, brand: 'BGP' },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  if (!defaultPipeline) throw new Error('Pipeline BGP default não encontrado');

  const marcarReuniaoStage = defaultPipeline.stages.find((s) =>
    s.name.toLowerCase().includes('marcar reuni'),
  );
  if (!marcarReuniaoStage) throw new Error('Stage "Marcar reunião" não encontrado no pipeline BGP');
  console.log(`[no-show-cadence] Stage "${marcarReuniaoStage.name}" id=${marcarReuniaoStage.id}`);

  // 3. Verifica se automation já existe — se sim, pula (idempotente)
  const existing = await prisma.automation.findFirst({
    where: { name: AUTOMATION_NAME },
  });
  if (existing) {
    console.log(`[no-show-cadence] Automação "${AUTOMATION_NAME}" já existe (id=${existing.id}, status=${existing.status}) — pulando criação`);
    console.log('[no-show-cadence] Para recriar, delete a automação existente primeiro.');
    return;
  }

  // 4. Cria automation
  const automation = await prisma.automation.create({
    data: {
      name: AUTOMATION_NAME,
      description: AUTOMATION_DESCRIPTION,
      status: 'DRAFT', // Inicia desativada — admin ativa manualmente
      triggerType: 'TAG_ADDED',
      triggerConfig: {
        tagId: tag.id,
        tagName: TAG_NAME,
        isCadence: true,
        isNoShow: true,
        // stageId aqui serve pro interruptCadenceOnStageChange:
        // quando deal sai de "Marcar reunião" pra outra etapa
        // (ex: "Reunião Agendada" porque remarcaram), a cadência é
        // automaticamente cancelada.
        stageId: marcarReuniaoStage.id,
        stageName: marcarReuniaoStage.name,
      },
      brand: 'BGP',
    },
  });
  console.log(`[no-show-cadence] Automation criada (id=${automation.id})`);

  // 5. Cria steps
  const stepDefs = buildSteps();
  const createdSteps: Array<{ id: string; order: number }> = [];

  for (const step of stepDefs) {
    const created = await prisma.automationStep.create({
      data: {
        order: step.order,
        actionType: step.actionType as any,
        config: {
          ...step.config,
          _label: step.label,
        },
        automationId: automation.id,
      },
    });
    createdSteps.push({ id: created.id, order: created.order });
  }

  // 6. Linka steps sequencialmente via nextStepId
  for (let i = 0; i < createdSteps.length - 1; i++) {
    await prisma.automationStep.update({
      where: { id: createdSteps[i].id },
      data: { nextStepId: createdSteps[i + 1].id },
    });
  }

  console.log(`[no-show-cadence] ${createdSteps.length} steps criados e linkados`);
  console.log('');
  console.log(`✅ Cadência No-Show criada com sucesso!`);
  console.log(`   Status: DRAFT (inativa)`);
  console.log(`   Trigger: Tag "${TAG_NAME}" aplicada ao contato`);
  console.log(`   Brand: BGP`);
  console.log(`   Pausa: lead volta pra "Reunião Agendada" OU responde no WhatsApp`);
  console.log(`   Encerra: chega no D7 (breakup) OU é interrompida`);
  console.log('');
  console.log(`👉 Pra ativar: vá em /automations no painel e mude status pra ACTIVE.`);
}

main()
  .catch((e) => {
    console.error('[no-show-cadence] erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
