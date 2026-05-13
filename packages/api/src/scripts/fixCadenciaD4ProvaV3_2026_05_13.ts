/**
 * Fix follow-up — Incidente 2026-05-13
 *
 * Recupera o único template rejeitado pela Meta na migração v2:
 * `cadencia_d4_prova_v2` (subcode 2388299 — conteúdo viola política,
 * tipicamente promessa de resultado).
 *
 * Substitui por `cadencia_d4_prova_v3` com copy mais branda (Opção B
 * aprovada pelo usuário): foco em pergunta de clareza, sem promessa.
 *
 * Atualiza step 11 da cadência Contato Feito (waba_cad_cf) pra apontar
 * pro v3. Marca a entrada DB do v2 (status REJECTED) como DISABLED.
 *
 * Rodar com: npx tsx src/scripts/fixCadenciaD4ProvaV3_2026_05_13.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const CALENDLY_URL = 'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp';
const NEW_NAME = 'cadencia_d4_prova_v3';
const OLD_REJECTED_NAME = 'cadencia_d4_prova_v2';
const AUTOMATION_ID = 'waba_cad_cf';

const BODY =
  'Olá {{1}}, hoje você sente que tem clareza dos números da {{2}} no dia a dia, ou ainda é mais no escuro?\n\n' +
  'A gente costuma conversar sobre exatamente isso em uma reunião curta. Se fizer sentido pra você, te mando os horários.';

const EXAMPLE = ['João Silva', 'Mercado Vicenza'];

async function main() {
  console.log('═══ Fix cadencia_d4_prova_v2 → v3 ═══\n');
  console.log(`Body (${BODY.length} chars):\n${BODY}\n`);

  const existing = await prisma.cloudWaTemplate.findFirst({
    where: { name: NEW_NAME, language: 'pt_BR' },
  });
  if (existing) {
    console.log(`⏭️  ${NEW_NAME} já existe (status=${existing.status}). Vou apenas garantir step + DISABLE do antigo.`);
  } else {
    const client = await WhatsAppCloudClient.fromDB();
    const components: any[] = [
      { type: 'BODY', text: BODY, example: { body_text: [EXAMPLE] } },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: 'Ver horários', url: CALENDLY_URL }],
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
      console.log(`✅ Meta aceitou ${NEW_NAME} — id=${metaTemplateId} status=${submitStatus}`);
    } catch (err: any) {
      submitError = err.message || 'Erro desconhecido';
      submitStatus = 'REJECTED';
      console.log(`❌ Meta rejeitou ${NEW_NAME}: ${submitError}`);
    }

    await prisma.cloudWaTemplate.create({
      data: {
        name: NEW_NAME,
        language: 'pt_BR',
        category: 'MARKETING',
        status: submitStatus as any,
        metaTemplateId,
        body: BODY,
        buttons: [{ type: 'URL', text: 'Ver horários', url: CALENDLY_URL }] as any,
        bodyExamples: [EXAMPLE] as any,
        variableMapping: [
          { var: '{{1}}', source: 'contact.name' },
          { var: '{{2}}', source: 'organization.name' },
        ] as any,
        rejectedReason: submitError,
      },
    });

    if (submitStatus === 'REJECTED') {
      console.log('\n⚠️  v3 também foi rejeitada — abortando antes de atualizar step.');
      process.exit(1);
    }
  }

  // Atualizar step 11 da cadência Contato Feito
  const step = await prisma.automationStep.findFirst({
    where: {
      automationId: AUTOMATION_ID,
      actionType: 'SEND_WA_TEMPLATE',
      order: 11,
    },
  });
  if (!step) {
    console.log(`⚠️  Step order=11 não encontrado na automation ${AUTOMATION_ID}.`);
    return;
  }

  const cfg = (step.config && typeof step.config === 'object' && !Array.isArray(step.config))
    ? (step.config as Record<string, any>)
    : {};
  console.log(`\nStep 11 atual: templateName=${cfg.templateName}`);

  await prisma.automationStep.update({
    where: { id: step.id },
    data: {
      config: {
        ...cfg,
        templateName: NEW_NAME,
        _migratedFromV2: cfg.templateName,
        _migratedV3At: new Date().toISOString(),
      },
    },
  });
  console.log(`✓ Step 11 atualizado: ${cfg.templateName} → ${NEW_NAME}`);

  // Marcar o v2 rejeitado como DISABLED (já está REJECTED no DB)
  const rejectedV2 = await prisma.cloudWaTemplate.findFirst({
    where: { name: OLD_REJECTED_NAME, language: 'pt_BR' },
  });
  if (rejectedV2 && rejectedV2.status !== 'DISABLED') {
    await prisma.cloudWaTemplate.update({
      where: { id: rejectedV2.id },
      data: { status: 'DISABLED' },
    });
    console.log(`✓ ${OLD_REJECTED_NAME} (REJECTED) marcado como DISABLED`);
  }

  console.log('\n✓ Fix concluído.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
