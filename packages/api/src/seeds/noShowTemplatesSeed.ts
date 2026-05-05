/**
 * Seed: Templates WABA da Cadência No-Show — submete à Meta
 *
 * Cria 5 cloudWaTemplate (D1, D2, D3, D5, D7) e submete à Meta via
 * WhatsAppCloudClient.createTemplate. Status inicial PENDING — vira
 * APPROVED quando Meta aprovar (24-48h tipicamente).
 *
 * Depois, REESCREVE os steps da Automation "Cadência No-Show — BGP"
 * pra usar SEND_WA_TEMPLATE (apontando pros templates) em vez de
 * SEND_WHATSAPP_AI. O engine SEND_WA_TEMPLATE tem retry automático
 * se template ainda não está APPROVED — automação fica em espera.
 *
 * Idempotente: se template já existe (mesmo name+language), pula
 * criação. Se automation steps já são SEND_WA_TEMPLATE, pula update.
 *
 * Uso: npm run seed:no-show-templates --workspace=packages/api
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const prisma = new PrismaClient();

const AUTOMATION_NAME = 'Cadência No-Show — BGP';
const LANGUAGE = 'pt_BR';
const CATEGORY = 'MARKETING' as const;

interface TplDef {
  name: string;
  body: string;
  label: string;
  // bodyExamples: a Meta exige exemplo dos placeholders pra validação
  bodyExamples: string[][];
}

const TEMPLATES: TplDef[] = [
  {
    name: 'bgp_no_show_d1_reabertura',
    label: 'D1 — Reabertura imediata',
    body: 'Oi {{1}}, tudo bem? Vi que você não conseguiu falar com a gente hoje. Quando seria um bom momento pra você?',
    bodyExamples: [['João']],
  },
  {
    name: 'bgp_no_show_d2_valor',
    label: 'D2 — Abordagem de valor',
    // Meta rejeita body iniciando com variável (subcode 2388299).
    // Prefixo "Oi" antes do {{1}}.
    body:
      'Oi {{1}}, muitos gestores que a gente atende enfrentam dificuldade em ter visibilidade real dos números do negócio. Vale tentarmos novamente 30 min pra ver se faz sentido pra você?',
    bodyExamples: [['João']],
  },
  {
    name: 'bgp_no_show_d3_prova_social',
    label: 'D3 — Prova social setor',
    body:
      'Olha {{1}}, um cliente do mesmo segmento que o seu reduziu em mais de 30% o tempo gasto com fechamento financeiro em 60 dias. Posso te mostrar como em uma reunião rápida?',
    bodyExamples: [['João']],
  },
  {
    name: 'bgp_no_show_d5_ligacao',
    label: 'D5 — Ligação + follow WA',
    body:
      'Oi {{1}}, tentei te ligar agora. Queria entender se ainda faz sentido a gente conversar e remarcar aquela reunião. Me fala quando tiver um minuto?',
    bodyExamples: [['João']],
  },
  {
    name: 'bgp_no_show_d7_breakup',
    label: 'D7 — Breakup respeitoso',
    body:
      'Oi {{1}}, entendi que talvez não seja a prioridade ter o controle total dos números do seu negócio agora. Não quero tomar seu tempo se não for o momento certo. Se mudar de ideia, é só falar, fico à disposição.',
    bodyExamples: [['João']],
  },
];

const VARIABLE_MAPPING = [{ var: '{{1}}', source: 'contact.name' }];

async function main() {
  console.log('[no-show-templates] iniciando...\n');

  // 1. Verifica Cloud API configurada
  const cloudConfig = await prisma.cloudWaConfig.findFirst();
  const isConfigured = !!(cloudConfig?.accessToken && cloudConfig?.wabaId);
  if (!isConfigured) {
    console.warn('[no-show-templates] ⚠️  Cloud API NÃO configurada — templates serão criados localmente em PENDING.');
    console.warn('[no-show-templates] Configure /waba/config no painel pra submeter à Meta.\n');
  }

  let client: WhatsAppCloudClient | null = null;
  if (isConfigured) {
    try {
      client = await WhatsAppCloudClient.fromDB();
    } catch (err: any) {
      console.error('[no-show-templates] Erro ao instanciar Cloud client:', err.message);
      client = null;
    }
  }

  // 2. Cria/submete cada template
  for (const tpl of TEMPLATES) {
    const existing = await prisma.cloudWaTemplate.findFirst({
      where: { name: tpl.name, language: LANGUAGE },
    });
    if (existing) {
      console.log(`[no-show-templates] ⏭  "${tpl.name}" já existe (id=${existing.id}, status=${existing.status}) — pulando`);
      continue;
    }

    const components = [
      {
        type: 'BODY',
        text: tpl.body,
        example: { body_text: tpl.bodyExamples },
      },
    ];

    let metaTemplateId: string | null = null;
    let submitStatus: string = 'PENDING';
    let submitError: string | null = null;

    if (client) {
      try {
        const meta = await client.createTemplate({
          name: tpl.name,
          language: LANGUAGE,
          category: CATEGORY,
          components: components as any,
        });
        metaTemplateId = meta.id;
        submitStatus = meta.status || 'PENDING';
        console.log(`[no-show-templates] ✅ "${tpl.name}" submetido à Meta — metaId=${meta.id}, status=${submitStatus}`);
      } catch (err: any) {
        submitError = err?.response?.data?.error?.message || err.message || 'Erro desconhecido';
        submitStatus = 'REJECTED';
        console.error(`[no-show-templates] ❌ "${tpl.name}" rejeitado pela Meta:`, submitError);
      }
    } else {
      console.log(`[no-show-templates] 📝 "${tpl.name}" salvo local (PENDING) — Cloud API não configurada`);
    }

    await prisma.cloudWaTemplate.create({
      data: {
        name: tpl.name,
        language: LANGUAGE,
        category: CATEGORY as any,
        status: submitStatus as any,
        body: tpl.body,
        bodyExamples: tpl.bodyExamples as any,
        components: components as any,
        variableMapping: VARIABLE_MAPPING as any,
        metaTemplateId,
        rejectedReason: submitError,
      },
    });
  }

  // 3. Atualiza Automation pra usar SEND_WA_TEMPLATE
  const automation = await prisma.automation.findFirst({
    where: { name: AUTOMATION_NAME },
    include: { steps: { orderBy: { order: 'asc' } } },
  });
  if (!automation) {
    console.warn(`\n[no-show-templates] ⚠️  Automation "${AUTOMATION_NAME}" não encontrada. Rode seed:no-show-cadence primeiro.`);
    return;
  }

  console.log(`\n[no-show-templates] Atualizando steps da automation "${AUTOMATION_NAME}" (id=${automation.id})...`);

  // Mapeamento order -> templateName
  // (estrutura: WA, WAIT, WA, WAIT, WA, WAIT, WA, WAIT, WA — orders 1, 3, 5, 7, 9)
  const orderToTemplate: Record<number, string> = {
    1: 'bgp_no_show_d1_reabertura',
    3: 'bgp_no_show_d2_valor',
    5: 'bgp_no_show_d3_prova_social',
    7: 'bgp_no_show_d5_ligacao',
    9: 'bgp_no_show_d7_breakup',
  };

  let updated = 0;
  for (const step of automation.steps) {
    const templateName = orderToTemplate[step.order];
    if (!templateName) continue; // WAIT step
    if (step.actionType !== 'SEND_WHATSAPP_AI') {
      console.log(`[no-show-templates] step order=${step.order} já é ${step.actionType} — pulando`);
      continue;
    }

    const oldConfig = step.config as Record<string, unknown>;
    const label = (oldConfig._label as string) || templateName;

    await prisma.automationStep.update({
      where: { id: step.id },
      data: {
        actionType: 'SEND_WA_TEMPLATE',
        config: {
          templateName,
          language: LANGUAGE,
          _label: label,
          _migratedFrom: 'SEND_WHATSAPP_AI',
        },
      },
    });
    updated++;
    console.log(`[no-show-templates]   step order=${step.order} → SEND_WA_TEMPLATE (${templateName})`);
  }

  console.log(`\n✅ ${updated} steps atualizados pra SEND_WA_TEMPLATE.`);
  console.log('   Status da automation: continua como estava (DRAFT/ACTIVE).');
  console.log('   Engine retry: se template ainda PENDING quando step rodar, retry automático até APPROVED.');
  console.log('\n👉 Acompanhe aprovação Meta em /waba/templates no painel.');
}

main()
  .catch((e) => {
    console.error('[no-show-templates] erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
