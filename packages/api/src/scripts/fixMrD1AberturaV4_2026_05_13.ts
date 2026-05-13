/**
 * Última correção da renovação de templates — Incidente 2026-05-13.
 *
 * mr_d1_abertura_v3 foi rejeitado (subcode 2388299) por gatilhos
 * "20 minutos" + "te mostrar, na prática" + "enxergar dos números"
 * (combo classificado pela Meta como promessa de resultado).
 *
 * v4 (Opção C, aprovada pelo usuário): ultra-curta, sem promessa.
 * Submete + atualiza step 2 da Marcar Reunião + DISABLE do v3 rejeitado.
 *
 * Rodar: npx tsx src/scripts/fixMrD1AberturaV4_2026_05_13.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const CALENDLY_URL = 'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp';
const NEW_NAME = 'mr_d1_abertura_v4';
const OLD_REJECTED = 'mr_d1_abertura_v3';
const AUTOMATION_ID = 'cmnfj0071000013sor2cblyyh';
const STEP_ORDER = 2;

const BODY =
  'Olá {{1}}, voltando aqui pra alinhar o próximo passo. Topa marcar a conversa sobre a {{2}}?';

const EXAMPLE = ['João Silva', 'Mercado Vicenza'];

async function main() {
  console.log(`═══ Fix ${OLD_REJECTED} → ${NEW_NAME} ═══\n`);
  console.log(`Body (${BODY.length} chars):\n${BODY}\n`);

  const existing = await prisma.cloudWaTemplate.findFirst({
    where: { name: NEW_NAME, language: 'pt_BR' },
  });
  if (existing) {
    console.log(`⏭️  ${NEW_NAME} já existe (status=${existing.status})`);
  } else {
    const client = await WhatsAppCloudClient.fromDB();
    const components: any[] = [
      { type: 'BODY', text: BODY, example: { body_text: [EXAMPLE] } },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: 'Ver agenda', url: CALENDLY_URL }],
      },
    ];

    let metaTemplateId: string | null = null;
    let submitStatus = 'PENDING';
    let submitError: string | null = null;
    try {
      const result = await client.createTemplate({
        name: NEW_NAME,
        language: 'pt_BR',
        category: 'MARKETING',
        components,
      });
      metaTemplateId = result.id;
      submitStatus = result.status || 'PENDING';
      console.log(`✅ Meta aceitou — id=${metaTemplateId} status=${submitStatus}`);
    } catch (err: any) {
      submitError = err.message || 'Erro desconhecido';
      submitStatus = 'REJECTED';
      console.log(`❌ Meta rejeitou: ${submitError}`);
    }

    await prisma.cloudWaTemplate.create({
      data: {
        name: NEW_NAME,
        language: 'pt_BR',
        category: 'MARKETING',
        status: submitStatus as any,
        metaTemplateId,
        body: BODY,
        buttons: [{ type: 'URL', text: 'Ver agenda', url: CALENDLY_URL }] as any,
        bodyExamples: [EXAMPLE] as any,
        variableMapping: [
          { var: '{{1}}', source: 'contact.name' },
          { var: '{{2}}', source: 'organization.name' },
        ] as any,
        rejectedReason: submitError,
      },
    });

    if (submitStatus === 'REJECTED') {
      console.log('\n⚠️  v4 também rejeitada. Não atualizando step.');
      process.exit(1);
    }
  }

  const step = await prisma.automationStep.findFirst({
    where: {
      automationId: AUTOMATION_ID,
      actionType: 'SEND_WA_TEMPLATE',
      order: STEP_ORDER,
    },
  });
  if (!step) {
    console.log(`⚠️  Step order=${STEP_ORDER} não encontrado na automation ${AUTOMATION_ID}`);
    return;
  }
  const cfg = (step.config && typeof step.config === 'object' && !Array.isArray(step.config))
    ? (step.config as Record<string, any>)
    : {};
  await prisma.automationStep.update({
    where: { id: step.id },
    data: {
      config: {
        ...cfg,
        templateName: NEW_NAME,
        _migratedFromV3: cfg.templateName,
        _migratedV4At: new Date().toISOString(),
      },
    },
  });
  console.log(`✓ Step ${STEP_ORDER}: ${cfg.templateName} → ${NEW_NAME}`);

  const v3 = await prisma.cloudWaTemplate.findFirst({
    where: { name: OLD_REJECTED, language: 'pt_BR' },
  });
  if (v3 && v3.status !== 'DISABLED') {
    await prisma.cloudWaTemplate.update({
      where: { id: v3.id },
      data: { status: 'DISABLED' },
    });
    console.log(`✓ ${OLD_REJECTED} (REJECTED) → DISABLED`);
  }

  console.log('\n✓ Fix concluído.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
