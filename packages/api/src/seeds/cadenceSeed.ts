import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepDef {
  order: number;
  actionType: string;
  config: Record<string, unknown>;
  label?: string; // human-readable label for UI
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function waMsg(order: number, day: number, follow: string, tipo: string, prompt: string): StepDef {
  return {
    order,
    actionType: 'SEND_WHATSAPP_AI',
    config: {
      objective: `Cadência D${day} ${follow} — ${tipo}`,
      prompt,
    },
    label: `D${day} ${follow} — ${tipo}`,
  };
}

function emailMsg(order: number, day: number, tipo: string, subject: string, prompt: string): StepDef {
  return {
    order,
    actionType: 'SEND_EMAIL',
    config: {
      subject,
      prompt,
      isAIGenerated: true,
    },
    label: `D${day} Email — ${tipo}`,
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

// ─── Etapa 2: Contato feito (sem resposta) ──────────────────────────────────
// 12 dias · 18 msgs WA + 7 emails
// Todas as msgs WA do tipo SEND_WHATSAPP_AI com prompt inteligente
// Prompt inclui: "Se o contato tem setor preenchido ({{setor}}), adapte para o setor. Se não, use genérico."

const SECTOR_INSTRUCTION = `IMPORTANTE: Verifique o setor do contato.
- Se o setor está preenchido, adapte a mensagem especificamente para esse setor, mencionando dores e realidades daquele segmento.
- Se o setor NÃO está preenchido, use mensagem genérica sobre gestão financeira empresarial.
Produto principal: GoBI (BI financeiro). A reunião é de Diagnóstico Financeiro (20 min).
FORMATO: Mensagem curta de WhatsApp (1-3 linhas). Sem markdown. Tom profissional mas humanizado.`;

function buildEtapa2Steps(): StepDef[] {
  let o = 1;
  const steps: StepDef[] = [];

  // D1
  steps.push(waMsg(o++, 1, '1/2', 'Abertura genérico',
    `Primeira mensagem de apresentação. Quem somos e o que o BI revela sobre o negócio. CTA: agendar 20 minutos de Diagnóstico Financeiro.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 1, '2/2', 'Conteúdo setor-específico',
    `Mensagem sobre a dor do setor do lead. Conectar problema real do negócio ao BI.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 1, 'Abertura genérico', 'Clareza financeira para o seu negócio',
    'Apresentação formal. Quem somos, o que o GoBI faz, CTA para agendar diagnóstico.'));
  steps.push(wait(o++, 22, 'hours'));

  // D2
  steps.push(waMsg(o++, 2, '1/1', 'Cobrar avanço genérico',
    `Follow simples de reabertura. CTA direto para agendar. Tom leve.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 1, 'days'));

  // D3
  steps.push(waMsg(o++, 3, '1/2', 'Conteúdo setor-específico',
    `Insight ou dado do setor. Ancora problema no negócio do lead.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 3, '2/2', 'Cobrar avanço genérico',
    `Tom leve: "Posso te mostrar em 15 min o que o BI entrega." CTA direto.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 3, 'Conteúdo setor-específico', 'Como o BI transforma empresas do seu setor',
    'Caso de uso do BI no setor do lead. Se setor vazio, caso genérico.'));
  steps.push(wait(o++, 22, 'hours'));

  // D4
  steps.push(waMsg(o++, 4, '1/1', 'Conteúdo setor-específico',
    `Caso de uso do BI no setor (resultado genérico, sem citar cliente específico).\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 1, 'days'));

  // D5
  steps.push(waMsg(o++, 5, '1/2', 'Cobrar avanço genérico',
    `Sugestão de horário específico. Baixa fricção. Envie o link do Calendly.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 5, '2/2', 'Conteúdo setor-específico',
    `Dado ou problema recorrente do setor.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 5, 'Conteúdo genérico', 'Sinais de que sua empresa precisa de um BI',
    'Educativo: sinais de que o negócio precisa de um BI financeiro.'));
  steps.push(wait(o++, 22, 'hours'));

  // D6
  steps.push(waMsg(o++, 6, '1/1', 'Cobrar avanço genérico',
    `Reabertura: "Quer que eu mande um horário para você escolher?" Tom leve.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 1, 'days'));

  // D7
  steps.push(waMsg(o++, 7, '1/2', 'Conteúdo setor-específico',
    `Último conteúdo de valor do setor. Insight relevante.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 7, '2/2', 'Cobrar avanço genérico',
    `Tom descontraído: pergunta aberta sobre interesse. Sem pressão.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 7, 'Conteúdo setor-específico', 'Dado importante sobre o seu setor',
    'Dado ou insight do setor. Reancoragem na dor. Se setor vazio, dado genérico.'));
  steps.push(wait(o++, 22, 'hours'));

  // D8
  steps.push(waMsg(o++, 8, '1/1', 'Cobrar avanço genérico',
    `Reforço simples. Mantém o fio da conversa. Sem pressão.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 1, 'days'));

  // D9
  steps.push(waMsg(o++, 9, '1/2', 'Conteúdo setor-específico',
    `Insight adicional do setor. Reancoragem na dor.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 9, '2/2', 'Cobrar avanço genérico',
    `Sugestão de dois horários para escolha. CTA direto.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 9, 'Cobrar avanço genérico', 'Ainda podemos conversar?',
    'Reforço de valor + CTA para retomada.'));
  steps.push(wait(o++, 22, 'hours'));

  // D10
  steps.push(waMsg(o++, 10, '1/1', 'Cobrar avanço genérico',
    `Tom de última tentativa leve: deixa abertura para retomada.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 1, 'days'));

  // D11
  steps.push(waMsg(o++, 11, '1/2', 'Conteúdo setor-específico',
    `Último conteúdo antes do encerramento. Valor claro e direto.\n${SECTOR_INSTRUCTION}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 11, '2/2', 'Cobrar avanço genérico',
    `"Última vez por aqui. Quer que eu tente em outro momento?" Tom respeitoso.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 11, 'Conteúdo setor-específico', 'Último conteúdo de valor para você',
    'Último conteúdo de valor antes do encerramento. Se setor vazio, genérico.'));
  steps.push(wait(o++, 22, 'hours'));

  // D12
  steps.push(waMsg(o++, 12, '1/1', 'Encerramento genérico',
    `Encerramento cordial da cadência. Deixa porta aberta. Agradece o interesse. NÃO insista.\n${SECTOR_INSTRUCTION}`));
  steps.push(emailMsg(o++, 12, 'Encerramento genérico', 'Encerrando nosso contato',
    'Encerramento cordial. Porta aberta para retomada futura.'));

  return steps;
}

// ─── Etapa 3: Marcar reunião ────────────────────────────────────────────────
// 12 dias · 22 msgs WA + 7 emails

function buildEtapa3Steps(): StepDef[] {
  let o = 1;
  const steps: StepDef[] = [];
  const SI = SECTOR_INSTRUCTION;

  // D1
  steps.push(waMsg(o++, 1, '1/2', 'Cobrar avanço setor-específico',
    `Dor do setor + proposta de reunião rápida (20 min). CTA com opções de horário.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 1, '2/2', 'Cobrar avanço genérico',
    `Reforço do CTA. Tom direto e simples. Envie link do Calendly.\n${SI}`));
  steps.push(emailMsg(o++, 1, 'Conteúdo genérico', 'O que acontece na reunião de diagnóstico',
    'O que acontece na reunião: "Você sai com um raio-x financeiro do negócio."'));
  steps.push(wait(o++, 22, 'hours'));

  // D2
  steps.push(waMsg(o++, 2, '1/1', 'Cobrar avanço genérico',
    `Follow simples: "Ainda tem interesse?" + horário sugerido.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D3
  steps.push(waMsg(o++, 3, '1/3', 'Conteúdo setor-específico',
    `Dado ou problema real do setor. Ancora relevância.\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 3, '2/3', 'Cobrar avanço genérico',
    `"Posso reservar um horário para você hoje à tarde?" Direto.\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 3, '3/3', 'Conteúdo setor-específico',
    `Resultado de cliente do setor (genérico, sem nomear). CTA para agendar.\n${SI}`));
  steps.push(emailMsg(o++, 3, 'Conteúdo setor-específico', 'Resultados reais no seu setor',
    'Resultado de cliente do setor (genérico). CTA para agendar.'));
  steps.push(wait(o++, 22, 'hours'));

  // D4
  steps.push(waMsg(o++, 4, '1/1', 'Cobrar avanço genérico',
    `Tom descontraído: "Me diz um horário que funcione esta semana."\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D5
  steps.push(waMsg(o++, 5, '1/2', 'Conteúdo setor-específico',
    `Insight prático do setor. Reancoragem no negócio do lead.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 5, '2/2', 'Cobrar avanço genérico',
    `Reforço do valor da reunião em uma linha.\n${SI}`));
  steps.push(emailMsg(o++, 5, 'Cobrar avanço genérico', 'Vamos agendar?',
    'Reforço do valor da reunião. CTA direto.'));
  steps.push(wait(o++, 22, 'hours'));

  // D6
  steps.push(waMsg(o++, 6, '1/1', 'Cobrar avanço genérico',
    `"Deixa eu te mandar dois horários, você escolhe qual funciona."\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D7
  steps.push(waMsg(o++, 7, '1/3', 'Conteúdo setor-específico',
    `Ancoragem forte no setor. Conecta dor ao produto.\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 7, '2/3', 'Cobrar avanço genérico',
    `"Última tentativa por aqui. Quer que eu tente em outro momento?"\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 7, '3/3', 'Cobrar avanço genérico',
    `Pergunta aberta de baixa fricção.\n${SI}`));
  steps.push(emailMsg(o++, 7, 'Conteúdo setor-específico', 'Como o BI resolve a dor do seu setor',
    'Caso de uso do BI no setor. Ancora relevância.'));
  steps.push(wait(o++, 22, 'hours'));

  // D8
  steps.push(waMsg(o++, 8, '1/1', 'Conteúdo setor-específico',
    `Novo ângulo do setor. Mantém relevância.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D9
  steps.push(waMsg(o++, 9, '1/2', 'Cobrar avanço genérico',
    `Sugestão de dois horários para escolha.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 9, '2/2', 'Conteúdo setor-específico',
    `Insight adicional. Tom consultivo.\n${SI}`));
  steps.push(emailMsg(o++, 9, 'Cobrar avanço genérico', 'Dois horários para você escolher',
    'Reforço de horário + CTA de baixa fricção.'));
  steps.push(wait(o++, 22, 'hours'));

  // D10
  steps.push(waMsg(o++, 10, '1/1', 'Cobrar avanço genérico',
    `Reabertura leve: pergunta sobre momento do lead.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D11
  steps.push(waMsg(o++, 11, '1/2', 'Conteúdo setor-específico',
    `Último conteúdo de valor do setor antes do encerramento.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 11, '2/2', 'Cobrar avanço genérico',
    `"Última vez que entro em contato. Quer que eu retome depois?"\n${SI}`));
  steps.push(emailMsg(o++, 11, 'Conteúdo setor-específico', 'Último conteúdo antes de encerrar',
    'Último conteúdo de valor antes do encerramento.'));
  steps.push(wait(o++, 22, 'hours'));

  // D12
  steps.push(waMsg(o++, 12, '1/3', 'Cobrar avanço setor-específico',
    `Última ancoragem no setor. Tom de encerramento.\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 12, '2/3', 'Cobrar avanço genérico',
    `Pergunta direta: "Ainda faz sentido conversarmos?"\n${SI}`));
  steps.push(wait(o++, 1, 'hours'));
  steps.push(waMsg(o++, 12, '3/3', 'Encerramento genérico',
    `Encerramento cordial. Deixa porta aberta. NÃO insista.\n${SI}`));
  steps.push(emailMsg(o++, 12, 'Encerramento genérico', 'Encerrando nosso contato',
    'Encerramento cordial. Porta aberta para retomada.'));

  return steps;
}

// ─── Etapa 5: Proposta enviada ──────────────────────────────────────────────
// 15 dias · 20 msgs WA + 8 emails

function buildEtapa5Steps(): StepDef[] {
  let o = 1;
  const steps: StepDef[] = [];
  const SI = `IMPORTANTE: Verifique o setor do contato.
- Se o setor está preenchido, adapte a mensagem especificamente para esse setor.
- Se o setor NÃO está preenchido, use mensagem genérica.
Contexto: O lead já recebeu uma proposta comercial. Foco é fazer ele fechar.
Produto: GoBI (BI financeiro, a partir de R$397/mês) ou GoControladoria (a partir de R$1.997/mês).
FORMATO: Mensagem curta de WhatsApp (1-3 linhas). Sem markdown. Tom profissional e consultivo.`;

  // D1
  steps.push(waMsg(o++, 1, '1/1', 'Cobrar avanço genérico',
    `Confirmação de recebimento da proposta. CTA de baixa fricção. "Recebeu a proposta? Ficou alguma dúvida?"\n${SI}`));
  steps.push(emailMsg(o++, 1, 'Conteúdo genérico', 'O que muda na prática com o GoBI',
    'Reforço de valor: o que muda na prática após contratar o BI.'));
  steps.push(wait(o++, 1, 'days'));

  // D2
  steps.push(waMsg(o++, 2, '1/1', 'Conteúdo setor-específico',
    `Resultado de empresas do setor com o BI implantado (genérico, sem nomear).\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D3
  steps.push(waMsg(o++, 3, '1/2', 'Cobrar avanço genérico',
    `"Ficou alguma dúvida sobre a proposta? Posso ajustar o que precisar."\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 3, '2/2', 'Conteúdo setor-específico',
    `Dado do setor reforçando urgência de decisão.\n${SI}`));
  steps.push(emailMsg(o++, 3, 'Cobrar avanço genérico', 'Vagas de implantação disponíveis',
    'Gatilho de agenda: vagas de implantação disponíveis.'));
  steps.push(wait(o++, 22, 'hours'));

  // D4
  steps.push(waMsg(o++, 4, '1/1', 'Cobrar avanço genérico',
    `Gatilho de agenda: vagas de implantação disponíveis para breve.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D5
  steps.push(waMsg(o++, 5, '1/1', 'Conteúdo setor-específico',
    `Insight do setor conectando o BI à dor principal do negócio.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D6
  steps.push(waMsg(o++, 6, '1/2', 'Cobrar avanço genérico',
    `Gatilho de prazo: condição comercial válida por tempo limitado.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 6, '2/2', 'Conteúdo setor-específico',
    `Case do setor (resultado genérico). Reancoragem no valor.\n${SI}`));
  steps.push(emailMsg(o++, 6, 'Cobrar avanço genérico', 'Condição especial por tempo limitado',
    'Gatilho de prazo: condição comercial válida até data limite.'));
  steps.push(wait(o++, 22, 'hours'));

  // D7
  steps.push(waMsg(o++, 7, '1/1', 'Cobrar avanço genérico',
    `"Como está a avaliação? Posso ajudar a destravar alguma parte?"\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D8
  steps.push(waMsg(o++, 8, '1/1', 'Conteúdo setor-específico',
    `Novo ângulo do setor. Tom consultivo.\n${SI}`));
  steps.push(emailMsg(o++, 8, 'Conteúdo setor-específico', 'Case real aplicado ao seu setor',
    'Case aplicado ao setor (resultado genérico). CTA para retomar.'));
  steps.push(wait(o++, 1, 'days'));

  // D9
  steps.push(waMsg(o++, 9, '1/2', 'Cobrar avanço genérico',
    `Próximo passo concreto: onboarding + data de início estimada.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 9, '2/2', 'Data de retorno',
    `Se o lead indicou data de retorno, mencione que está retomando conforme combinado. Se não, reaquecimento genérico.\n${SI}`));
  steps.push(wait(o++, 22, 'hours'));

  // D10
  steps.push(waMsg(o++, 10, '1/1', 'Conteúdo setor-específico',
    `Último conteúdo de valor do setor antes da reta final.\n${SI}`));
  steps.push(emailMsg(o++, 10, 'Cobrar avanço genérico', 'Próximo passo: onboarding',
    'Próximo passo: onboarding + data estimada de início.'));
  steps.push(wait(o++, 1, 'days'));

  // D11
  steps.push(waMsg(o++, 11, '1/1', 'Cobrar avanço genérico',
    `"Quero entender se ainda faz sentido para você neste momento." Tom respeitoso.\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D12
  steps.push(waMsg(o++, 12, '1/2', 'Conteúdo setor-específico',
    `Dado do setor. Última ancoragem antes do encerramento.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 12, '2/2', 'Cobrar avanço genérico',
    `Pergunta direta sobre a decisão. Tom respeitoso.\n${SI}`));
  steps.push(emailMsg(o++, 12, 'Conteúdo setor-específico', 'Último conteúdo de valor',
    'Último conteúdo de valor do setor.'));
  steps.push(wait(o++, 22, 'hours'));

  // D13
  steps.push(waMsg(o++, 13, '1/1', 'Cobrar avanço genérico',
    `"Última vez que entro em contato por aqui. Ainda posso te ajudar?"\n${SI}`));
  steps.push(wait(o++, 1, 'days'));

  // D14
  steps.push(waMsg(o++, 14, '1/1', 'Conteúdo setor-específico',
    `Último conteúdo de valor. Tom de encerramento.\n${SI}`));
  steps.push(emailMsg(o++, 14, 'Cobrar avanço genérico', 'Reforço final',
    'Reforço final antes do desligamento.'));
  steps.push(wait(o++, 1, 'days'));

  // D15
  steps.push(waMsg(o++, 15, '1/2', 'Cobrar avanço genérico',
    `Penúltima tentativa: CTA final de baixa fricção.\n${SI}`));
  steps.push(wait(o++, 2, 'hours'));
  steps.push(waMsg(o++, 15, '2/2', 'Desligamento genérico',
    `Mensagem de desligamento. Encerramento cordial, porta aberta. NÃO insista.\n${SI}`));
  steps.push(emailMsg(o++, 15, 'Desligamento genérico', 'Encerrando nosso contato',
    'Encerramento cordial. Porta aberta para retomada futura.'));

  return steps;
}

// ─── Main Seed Function ─────────────────────────────────────────────────────

interface CadenceDef {
  name: string;
  description: string;
  stageId: string;
  stageName: string;
  steps: StepDef[];
}

const CADENCES: CadenceDef[] = [
  {
    name: 'Cadência Etapa 2 — Contato feito',
    description: '12 dias · 18 msgs WhatsApp + 7 emails · Ativada quando lead fica sem resposta após primeiro contato',
    stageId: '65bd0418294535000d1f57cd',
    stageName: 'Contato feito',
    steps: buildEtapa2Steps(),
  },
  {
    name: 'Cadência Etapa 3 — Marcar reunião',
    description: '12 dias · 22 msgs WhatsApp + 7 emails · Ativada quando lead precisa agendar reunião',
    stageId: '64fb7516ea4eb400219457e0',
    stageName: 'Marcar reunião',
    steps: buildEtapa3Steps(),
  },
  {
    name: 'Cadência Etapa 5 — Proposta enviada',
    description: '15 dias · 20 msgs WhatsApp + 8 emails · Ativada quando lead recebeu proposta e precisa decidir',
    stageId: '64fb7517ea4eb400219457e2',
    stageName: 'Proposta enviada',
    steps: buildEtapa5Steps(),
  },
];

async function seed() {
  console.log('Criando cadências de follow-up...\n');

  for (const cadence of CADENCES) {
    // Check if already exists
    const existing = await prisma.automation.findFirst({
      where: { name: cadence.name },
    });

    if (existing) {
      console.log(`⏭  "${cadence.name}" já existe (id: ${existing.id}) — pulando`);
      continue;
    }

    // Create automation
    const automation = await prisma.automation.create({
      data: {
        name: cadence.name,
        description: cadence.description,
        status: 'DRAFT', // Starts disabled
        triggerType: 'STAGE_CHANGED',
        triggerConfig: {
          stageId: cadence.stageId,
          stageName: cadence.stageName,
          isCadence: true,
        },
      },
    });

    // Create steps with nextStepId linking
    const createdSteps: Array<{ id: string; order: number }> = [];

    for (const step of cadence.steps) {
      const created = await prisma.automationStep.create({
        data: {
          order: step.order,
          actionType: step.actionType as any,
          config: {
            ...step.config,
            ...(step.label ? { _label: step.label } : {}),
          },
          automationId: automation.id,
        },
      });
      createdSteps.push({ id: created.id, order: created.order });
    }

    // Link steps sequentially: each step.nextStepId → next step
    for (let i = 0; i < createdSteps.length - 1; i++) {
      await prisma.automationStep.update({
        where: { id: createdSteps[i].id },
        data: { nextStepId: createdSteps[i + 1].id },
      });
    }

    console.log(`✅ "${cadence.name}" criada com ${createdSteps.length} etapas (status: DRAFT)`);
  }

  console.log('\nCadências criadas com sucesso! Ative-as na página de Automações.');
}

seed()
  .catch((err) => {
    console.error('Erro ao criar cadências:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
