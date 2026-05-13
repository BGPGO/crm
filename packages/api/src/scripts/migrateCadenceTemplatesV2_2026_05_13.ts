/**
 * Migração de Templates v2 — Incidente 2026-05-13
 *
 * Cria 17 templates MARKETING v2 (acentuação correta, variável {{2}}=empresa,
 * sem gatilhos de spam, sem reuso entre cadências), atualiza os steps das 3
 * cadências afetadas pra apontar pros novos nomes, e marca os 15 antigos como
 * DISABLED.
 *
 * Origem do incidente: templates queimaram com erro 131049 (healthy ecosystem).
 * cadencia_d4_prova tinha 91% fail rate; outros 14 entre 10% e 33%.
 *
 * Rodar com: npx tsx src/scripts/migrateCadenceTemplatesV2_2026_05_13.ts
 *
 * Idempotente: pula templates que já existem no DB local (status = qualquer).
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const CALENDLY_URL = 'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp';
const DELAY_MS = 600;

type Vars = 1 | 2;
type Btn = { type: 'URL'; text: string; url: string };

interface TemplateSpec {
  name: string;
  body: string;
  buttons?: Btn[];
  vars: Vars;
}

const TEMPLATES: TemplateSpec[] = [
  // ─── Contato Feito (Etapa 2) ─────────────────────────────────────────────
  {
    name: 'cadencia_d1_abertura_v2',
    vars: 2,
    body:
      'Oi {{1}}, tudo bem? Aqui é a Bia, da Bertuzzi Patrimonial.\n\n' +
      'Você deixou seu contato pra entender melhor os números da {{2}}, e eu queria te ajudar nisso. Posso te mandar um horário pra conversarmos rapidinho sobre o que faz mais sentido pro seu momento?',
    buttons: [{ type: 'URL', text: 'Ver horários', url: CALENDLY_URL }],
  },
  {
    name: 'cadencia_d2_valor_v2',
    vars: 2,
    body:
      'Olá {{1}}, uma dúvida rápida: você sente que tem clareza do que entra e sai na {{2}} todo mês, ou ainda é mais no feeling?\n\n' +
      'Pergunto porque é exatamente isso que a gente costuma destravar logo na primeira conversa. Se fizer sentido, te mando os horários.',
  },
  {
    name: 'cadencia_d3_followup_v2',
    vars: 2,
    body:
      'Olá {{1}}, consegui abrir alguns horários nesta semana pra gente conversar sobre a {{2}}. Pode ser uma conversa curta, só pra eu entender seu contexto e ver se faz sentido seguir.\n\n' +
      'Qual período da semana funciona melhor pra você: manhã ou tarde?',
  },
  {
    name: 'cadencia_d4_prova_v2',
    vars: 2,
    body:
      'Oi {{1}}, deixa eu te contar uma coisa rápida: a maior parte dos empresários que conversam com a gente sai da primeira reunião enxergando custos que tinham passado batido.\n\n' +
      'Não é mágica, é só olhar os números do ângulo certo. Topa marcar uma conversa pra fazer isso com a {{2}}?',
    buttons: [{ type: 'URL', text: 'Marcar conversa', url: CALENDLY_URL }],
  },
  {
    name: 'cadencia_d5_leve_v2',
    vars: 2,
    body:
      'Oi {{1}}, imagino que sua semana esteja puxada. Só passando pra deixar o canal aberto: se quiser conversar sobre a {{2}} agora, depois ou nunca, qualquer resposta tá de bom tamanho aqui.',
  },
  {
    name: 'cadencia_d6_urgencia_v2',
    vars: 2,
    body:
      'Olá {{1}}, antes de eu encerrar nosso contato por aqui, fica uma pergunta: o momento da {{2}} hoje pede esse tipo de conversa sobre números, ou faz mais sentido a gente retomar isso lá pra frente?\n\n' +
      'Qualquer resposta me ajuda.',
  },
  {
    name: 'cadencia_d7_encerramento_v2',
    vars: 2,
    body:
      'Oi {{1}}, vou encerrar nosso contato por aqui pra não te encher mais. Se em algum momento você quiser revisitar a gestão financeira da {{2}}, é só responder essa mensagem que eu retomo daqui.\n\n' +
      'Sucesso aí.',
  },

  // ─── Marcar Reunião (Etapa 3) ────────────────────────────────────────────
  {
    name: 'reuniao_d2_facilitar_v2',
    vars: 2,
    body:
      'Oi {{1}}, retomando nossa conversa por aqui. Pensei em adiantar a agenda: meio da semana costuma ser mais tranquilo pro pessoal da {{2}}? Me diz se manhã ou fim de tarde encaixa melhor que eu ajusto do meu lado.',
    buttons: [{ type: 'URL', text: 'Ver agenda', url: CALENDLY_URL }],
  },
  {
    name: 'reuniao_d3_contexto_v2',
    vars: 2,
    body:
      'Olá {{1}}, fiquei pensando aqui: quando você procurou a gente, tava buscando organizar o financeiro da {{2}} ou era mais pra entender como funciona antes de decidir algo? Pergunto pra ajustar o que faz sentido te mostrar.',
  },
  {
    name: 'reuniao_d4_pergunta_v2',
    vars: 2,
    body:
      'Oi {{1}}, uma curiosidade rápida: hoje você consegue olhar pros números da {{2}} e responder, na hora, qual produto ou cliente dá mais resultado? Se a resposta veio com hesitação, esse é exatamente o tipo de coisa que a gente costuma destrinchar numa conversa. Faz sentido marcarmos?',
    buttons: [{ type: 'URL', text: 'Quero conversar', url: CALENDLY_URL }],
  },
  {
    name: 'mr_d1_abertura_v2',
    vars: 2,
    body:
      'Oi {{1}}, retomando nossa conversa por aqui.\n\n' +
      'Pelo que você já me contou sobre a {{2}}, faz sentido a gente fechar aqueles 20 minutos pra eu te mostrar, na prática, o que conseguimos enxergar dos números do seu negócio.\n\n' +
      'Deixei a agenda aberta no botão abaixo, você escolhe o horário que cabe melhor no seu dia. Qualquer dúvida sobre o que vamos tratar, é só me responder por aqui antes.',
    buttons: [{ type: 'URL', text: 'Ver agenda', url: CALENDLY_URL }],
  },
  {
    name: 'mr_d6_urgencia_v2',
    vars: 2,
    body:
      'Oi {{1}}, já faz uns dias que estou tentando fechar esse horário com você e não quero virar aquele contato que enche por encher.\n\n' +
      'Me ajuda numa coisa: a {{2}} está num momento em que olhar os números com mais profundidade entra na prioridade agora, ou é melhor eu te procurar daqui uns meses, quando o cenário estiver mais maduro pra isso?\n\n' +
      'Pode me responder com sinceridade, qualquer uma das duas respostas me ajuda a organizar o próximo passo do meu lado.',
  },

  // ─── No-Show ─────────────────────────────────────────────────────────────
  {
    name: 'bgp_no_show_d1_reabertura_v2',
    vars: 1,
    body:
      'Oi {{1}}, tudo certo por aí? Como nosso papo de hoje não rolou, imagino que tenha aparecido algo. Sem stress: me conta qual dia da semana costuma ser mais tranquilo pra você que a gente reencaixa.',
  },
  {
    name: 'bgp_no_show_d2_valor_v2',
    vars: 2,
    body:
      'Olá {{1}}, uma coisa que ouço bastante de quem dirige {{2}} é a sensação de tomar decisão no escuro, sem enxergar de verdade os números. Se isso fizer eco aí, topa a gente conversar rápido essa semana? Te mando duas opções de horário.',
  },
  {
    name: 'bgp_no_show_d3_prova_social_v2',
    vars: 2,
    body:
      'Oi {{1}}, semana passada uma empresa parecida com {{2}} me disse que o fechamento financeiro do mês parou de ser pesadelo depois que a gente entrou. Posso te mostrar em uma conversa curta como chegamos nesse ponto?',
    buttons: [{ type: 'URL', text: 'Escolher horário', url: CALENDLY_URL }],
  },
  {
    name: 'bgp_no_show_d5_ligacao_v2',
    vars: 1,
    body:
      'Oi {{1}}, te liguei agora e caiu na caixa, fica tranquilo. Só queria saber se ainda faz sentido a gente remarcar aquela conversa ou se prefere que eu volte mais pra frente. Qualquer um dos dois tá certo, é só me sinalizar.',
  },
  {
    name: 'bgp_no_show_d7_breakup_v2',
    vars: 1,
    body:
      'Olá {{1}}, vou parar de aparecer por aqui pra não virar incômodo. Imagino que esse não seja o momento de olhar pra dentro dos números, e tá tudo bem, cada empresa tem seu tempo. Deixo meu contato salvo: quando fizer sentido, é só chamar que retomo na hora.',
  },
];

const EXAMPLE_2 = ['João Silva', 'Mercado Vicenza'];
const EXAMPLE_1 = ['João Silva'];

// Map old template name → new template name por automation ID
const STEP_MIGRATIONS: Record<string, Record<string, string>> = {
  // Contato Feito WABA
  waba_cad_cf: {
    cadencia_d1_abertura: 'cadencia_d1_abertura_v2',
    cadencia_d2_valor: 'cadencia_d2_valor_v2',
    cadencia_d3_followup: 'cadencia_d3_followup_v2',
    cadencia_d4_prova: 'cadencia_d4_prova_v2',
    cadencia_d5_leve: 'cadencia_d5_leve_v2',
    cadencia_d6_urgencia: 'cadencia_d6_urgencia_v2',
    cadencia_d7_encerramento: 'cadencia_d7_encerramento_v2',
  },
  // Marcar Reunião WABA — usa templates dedicados (mr_*) onde antes reusava cadencia_*
  cmnfj0071000013sor2cblyyh: {
    cadencia_d1_abertura: 'mr_d1_abertura_v2',
    reuniao_d2_facilitar: 'reuniao_d2_facilitar_v2',
    reuniao_d3_oque_acontece: 'reuniao_d3_contexto_v2',
    reuniao_d4_resultado: 'reuniao_d4_pergunta_v2',
    cadencia_d6_urgencia: 'mr_d6_urgencia_v2',
    // reuniao_d5_objecao e reuniao_d7_encerramento permanecem (0% erro)
  },
  // No-Show BGP
  cmosrxwk30001gyeu6elv7380: {
    bgp_no_show_d1_reabertura: 'bgp_no_show_d1_reabertura_v2',
    bgp_no_show_d2_valor: 'bgp_no_show_d2_valor_v2',
    bgp_no_show_d3_prova_social: 'bgp_no_show_d3_prova_social_v2',
    bgp_no_show_d5_ligacao: 'bgp_no_show_d5_ligacao_v2',
    bgp_no_show_d7_breakup: 'bgp_no_show_d7_breakup_v2',
  },
};

// Os 15 nomes ANTIGOS pra marcar como DISABLED (não confundir reuso)
const OLD_TEMPLATE_NAMES = [
  'cadencia_d1_abertura',
  'cadencia_d2_valor',
  'cadencia_d3_followup',
  'cadencia_d4_prova',
  'cadencia_d5_leve',
  'cadencia_d6_urgencia',
  'cadencia_d7_encerramento',
  'reuniao_d2_facilitar',
  'reuniao_d3_oque_acontece',
  'reuniao_d4_resultado',
  'bgp_no_show_d1_reabertura',
  'bgp_no_show_d2_valor',
  'bgp_no_show_d3_prova_social',
  'bgp_no_show_d5_ligacao',
  'bgp_no_show_d7_breakup',
];

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createOneTemplate(spec: TemplateSpec, client: WhatsAppCloudClient) {
  const existing = await prisma.cloudWaTemplate.findFirst({
    where: { name: spec.name, language: 'pt_BR' },
  });
  if (existing) {
    console.log(`  ⏭️  ${spec.name} já existe (status=${existing.status}) — pulando criação`);
    return existing;
  }

  if (spec.body.length > 550) {
    throw new Error(`Template ${spec.name} excede 550 chars (MARKETING limit): ${spec.body.length}`);
  }

  const example = spec.vars === 2 ? EXAMPLE_2 : EXAMPLE_1;

  // Components pra Meta API
  const components: any[] = [{ type: 'BODY', text: spec.body, example: { body_text: [example] } }];
  if (spec.buttons && spec.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: spec.buttons.map((b) => ({ type: b.type, text: b.text, url: b.url })),
    });
  }

  // variableMapping local — usado pelo resolver no envio
  const variableMapping =
    spec.vars === 2
      ? [
          { var: '{{1}}', source: 'contact.name' },
          { var: '{{2}}', source: 'organization.name' },
        ]
      : [{ var: '{{1}}', source: 'contact.name' }];

  // bodyExamples no formato salvo localmente: [["val1","val2"]]
  const bodyExamples = [example];

  let metaTemplateId: string | null = null;
  let submitStatus = 'PENDING';
  let submitError: string | null = null;

  try {
    const metaResult = await client.createTemplate({
      name: spec.name,
      language: 'pt_BR',
      category: 'MARKETING',
      components,
    });
    metaTemplateId = metaResult.id;
    submitStatus = metaResult.status || 'PENDING';
    console.log(`  ✅ Meta aceitou ${spec.name} — id=${metaTemplateId} status=${submitStatus}`);
  } catch (err: any) {
    submitError = err.message || 'Erro desconhecido';
    submitStatus = 'REJECTED';
    console.log(`  ❌ Meta rejeitou ${spec.name}: ${submitError}`);
  }

  const saved = await prisma.cloudWaTemplate.create({
    data: {
      name: spec.name,
      language: 'pt_BR',
      category: 'MARKETING',
      status: submitStatus as any,
      metaTemplateId,
      body: spec.body,
      buttons: (spec.buttons as any) || null,
      bodyExamples: bodyExamples as any,
      variableMapping: variableMapping as any,
      rejectedReason: submitError,
    },
  });
  return saved;
}

async function updateAutomationSteps() {
  console.log('\n═══ Atualizando steps das 3 cadências ═══');
  let totalUpdated = 0;

  for (const [automationId, mapping] of Object.entries(STEP_MIGRATIONS)) {
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
      select: { id: true, name: true },
    });
    if (!automation) {
      console.log(`  ⚠️  Automation ${automationId} não encontrada, pulando`);
      continue;
    }

    const steps = await prisma.automationStep.findMany({
      where: { automationId, actionType: 'SEND_WA_TEMPLATE' },
    });

    for (const step of steps) {
      const cfg = (step.config && typeof step.config === 'object' && !Array.isArray(step.config))
        ? (step.config as Record<string, any>)
        : {};
      const oldName = String(cfg.templateName || '');
      const newName = mapping[oldName];
      if (!newName) continue;

      await prisma.automationStep.update({
        where: { id: step.id },
        data: { config: { ...cfg, templateName: newName, _migratedFrom: oldName, _migratedAt: new Date().toISOString() } },
      });
      console.log(`  ✓ [${automation.name}] step ${step.order}: ${oldName} → ${newName}`);
      totalUpdated++;
    }
  }
  console.log(`  Total steps atualizados: ${totalUpdated}`);
}

async function disableOldTemplates() {
  console.log('\n═══ Marcando 15 templates antigos como DISABLED ═══');
  const result = await prisma.cloudWaTemplate.updateMany({
    where: {
      name: { in: OLD_TEMPLATE_NAMES },
      status: { notIn: ['DISABLED', 'REJECTED'] },
    },
    data: { status: 'DISABLED' },
  });
  console.log(`  ✓ ${result.count} templates antigos marcados como DISABLED`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Migração de Templates v2 — Incidente 2026-05-13');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Sanity check: WhatsAppCloudClient configurado?
  const cloudConfig = await prisma.cloudWaConfig.findFirst();
  if (!cloudConfig?.accessToken || !cloudConfig?.wabaId) {
    throw new Error('CloudWaConfig não configurada — abortando');
  }

  const client = await WhatsAppCloudClient.fromDB();
  console.log(`✓ Cliente WABA conectado (waba=${cloudConfig.wabaId})\n`);

  console.log('═══ Criando 17 templates v2 ═══');
  for (let i = 0; i < TEMPLATES.length; i++) {
    const spec = TEMPLATES[i];
    console.log(`\n[${i + 1}/${TEMPLATES.length}] ${spec.name} (${spec.body.length} chars, vars=${spec.vars})`);
    await createOneTemplate(spec, client);
    if (i < TEMPLATES.length - 1) await delay(DELAY_MS);
  }

  await updateAutomationSteps();
  await disableOldTemplates();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Migração concluída.');
  console.log('Templates v2 estão em PENDING na Meta — aprovação <24h tipicamente.');
  console.log('Cadências já apontam pros novos nomes; ao reativar, o sistema usa os v2.');
  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\nFALHA NA MIGRAÇÃO:', err);
  process.exit(1);
});
