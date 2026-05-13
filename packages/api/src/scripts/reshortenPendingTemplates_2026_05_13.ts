/**
 * Recovery + reshorten — Incidente 2026-05-13
 *
 * Plano:
 * 1) Restaura entradas DB locais que foram deletadas por engano dos 3 _v2
 *    PENDING (delete na Meta falhou por permissão — eles ainda existem
 *    PENDING na Meta).
 * 2) Submete versões curtas com sufixo _v3 (nome novo, sem conflito).
 * 3) Atualiza os steps das cadências pra apontar pros _v3.
 * 4) Marca os _v2 PENDING locais como DISABLED.
 *
 * Rodar: npx tsx src/scripts/reshortenPendingTemplates_2026_05_13.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const CALENDLY_URL = 'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp';
const EXAMPLE = ['João Silva', 'Mercado Vicenza'];

interface Spec {
  oldV2Name: string;
  newV3Name: string;
  body: string;
  withButton: boolean;
  buttonText?: string;
  automationId: string;
  stepOrder: number;
}

const SPECS: Spec[] = [
  {
    oldV2Name: 'cadencia_d1_abertura_v2',
    newV3Name: 'cadencia_d1_abertura_v3',
    body:
      'Oi {{1}}, aqui é a Bia da Bertuzzi Patrimonial.\n\n' +
      'Vi que você se cadastrou pra entender melhor os números da {{2}}. Topa marcar uma conversa rápida?',
    withButton: true,
    buttonText: 'Ver horários',
    automationId: 'waba_cad_cf',
    stepOrder: 3,
  },
  {
    oldV2Name: 'mr_d1_abertura_v2',
    newV3Name: 'mr_d1_abertura_v3',
    body:
      'Oi {{1}}, retomando nossa conversa.\n\n' +
      'Faz sentido fecharmos 20 minutos pra eu te mostrar, na prática, o que conseguimos enxergar dos números da {{2}}?',
    withButton: true,
    buttonText: 'Ver agenda',
    automationId: 'cmnfj0071000013sor2cblyyh',
    stepOrder: 2,
  },
  {
    oldV2Name: 'mr_d6_urgencia_v2',
    newV3Name: 'mr_d6_urgencia_v3',
    body:
      'Oi {{1}}, já faz uns dias tentando fechar esse horário e não quero virar incômodo.\n\n' +
      'Me ajuda: a {{2}} está num momento de olhar os números com mais profundidade agora, ou é melhor retomar daqui uns meses?',
    withButton: false,
    automationId: 'cmnfj0071000013sor2cblyyh',
    stepOrder: 12,
  },
];

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('═══ Recovery + reshorten ═══\n');
  const client = await WhatsAppCloudClient.fromDB();

  // 1) Restaurar entradas DB locais dos _v2 (puxando ID atual do Meta)
  console.log('▸ Restaurando registros DB dos _v2 PENDING…');
  const metaList = await client.listTemplates({ limit: 200 });
  const metaByName = new Map(metaList.data.map((t) => [t.name, t]));

  for (const spec of SPECS) {
    const existsLocal = await prisma.cloudWaTemplate.findFirst({
      where: { name: spec.oldV2Name, language: 'pt_BR' },
    });
    if (existsLocal) {
      console.log(`  • ${spec.oldV2Name} já está no DB (status=${existsLocal.status}) — ok`);
      continue;
    }
    const meta = metaByName.get(spec.oldV2Name);
    if (!meta) {
      console.log(`  ⚠️  ${spec.oldV2Name} não encontrado nem no DB nem no Meta — pulando recovery`);
      continue;
    }
    await prisma.cloudWaTemplate.create({
      data: {
        name: spec.oldV2Name,
        language: 'pt_BR',
        category: 'MARKETING',
        status: (meta.status || 'PENDING') as any,
        metaTemplateId: meta.id,
        body: 'Restaurado após delete-incorreto local. Conteúdo na Meta.',
        bodyExamples: [EXAMPLE] as any,
        variableMapping: [
          { var: '{{1}}', source: 'contact.name' },
          { var: '{{2}}', source: 'organization.name' },
        ] as any,
      },
    });
    console.log(`  ✓ ${spec.oldV2Name} recriado no DB (status=${meta.status})`);
  }

  // 2) Submeter versões _v3 curtas
  console.log('\n▸ Submetendo 3 versões curtas como _v3…');
  for (let i = 0; i < SPECS.length; i++) {
    const spec = SPECS[i];
    const existing = await prisma.cloudWaTemplate.findFirst({
      where: { name: spec.newV3Name, language: 'pt_BR' },
    });
    if (existing) {
      console.log(`  • ${spec.newV3Name} já existe (status=${existing.status}) — pulando submit`);
      continue;
    }

    console.log(`\n  [${i + 1}/${SPECS.length}] ${spec.newV3Name} (${spec.body.length} chars)`);
    const components: any[] = [
      { type: 'BODY', text: spec.body, example: { body_text: [EXAMPLE] } },
    ];
    if (spec.withButton) {
      components.push({
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: spec.buttonText!, url: CALENDLY_URL }],
      });
    }

    let metaTemplateId: string | null = null;
    let submitStatus = 'PENDING';
    let submitError: string | null = null;
    try {
      const result = await client.createTemplate({
        name: spec.newV3Name,
        language: 'pt_BR',
        category: 'MARKETING',
        components,
      });
      metaTemplateId = result.id;
      submitStatus = result.status || 'PENDING';
      console.log(`    ✅ Meta aceitou — id=${metaTemplateId} status=${submitStatus}`);
    } catch (err: any) {
      submitError = err.message || 'Erro desconhecido';
      submitStatus = 'REJECTED';
      console.log(`    ❌ Meta rejeitou: ${submitError}`);
    }

    await prisma.cloudWaTemplate.create({
      data: {
        name: spec.newV3Name,
        language: 'pt_BR',
        category: 'MARKETING',
        status: submitStatus as any,
        metaTemplateId,
        body: spec.body,
        buttons: spec.withButton
          ? ([{ type: 'URL', text: spec.buttonText, url: CALENDLY_URL }] as any)
          : null,
        bodyExamples: [EXAMPLE] as any,
        variableMapping: [
          { var: '{{1}}', source: 'contact.name' },
          { var: '{{2}}', source: 'organization.name' },
        ] as any,
        rejectedReason: submitError,
      },
    });

    if (i < SPECS.length - 1) await delay(800);
  }

  // 3) Atualizar steps das cadências
  console.log('\n▸ Atualizando steps das cadências…');
  for (const spec of SPECS) {
    const step = await prisma.automationStep.findFirst({
      where: {
        automationId: spec.automationId,
        actionType: 'SEND_WA_TEMPLATE',
        order: spec.stepOrder,
      },
    });
    if (!step) {
      console.log(`  ⚠️  Step order=${spec.stepOrder} não encontrado em ${spec.automationId}`);
      continue;
    }
    const cfg = (step.config && typeof step.config === 'object' && !Array.isArray(step.config))
      ? (step.config as Record<string, any>)
      : {};
    if (cfg.templateName === spec.newV3Name) {
      console.log(`  • step ${spec.stepOrder} já aponta pra ${spec.newV3Name}`);
      continue;
    }
    await prisma.automationStep.update({
      where: { id: step.id },
      data: {
        config: {
          ...cfg,
          templateName: spec.newV3Name,
          _migratedFromV2: cfg.templateName,
          _migratedV3At: new Date().toISOString(),
        },
      },
    });
    console.log(`  ✓ step ${spec.stepOrder}: ${cfg.templateName} → ${spec.newV3Name}`);
  }

  // 4) Marcar _v2 PENDING como DISABLED localmente
  console.log('\n▸ Marcando _v2 PENDING como DISABLED…');
  for (const spec of SPECS) {
    const v2 = await prisma.cloudWaTemplate.findFirst({
      where: { name: spec.oldV2Name, language: 'pt_BR' },
    });
    if (v2 && v2.status !== 'DISABLED') {
      await prisma.cloudWaTemplate.update({
        where: { id: v2.id },
        data: { status: 'DISABLED' },
      });
      console.log(`  ✓ ${spec.oldV2Name} → DISABLED`);
    }
  }

  console.log('\n✓ Concluído.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
