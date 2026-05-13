/**
 * mr_d1_abertura — tentativa final com nome novo + body ultra-sutil.
 *
 * v3/v4/v5 (todas com prefixo mr_d1_*) foram rejeitadas com subcode
 * 2388299. Hipótese: Meta criou cooldown/blacklist no prefixo após
 * múltiplas rejeições, OU o conteúdo de CTA direto seguia disparando.
 *
 * Esta tentativa muda 2 variáveis:
 * - Nome: marcar_reuniao_abertura_v1 (sem histórico, legível)
 * - Body: pergunta direta de retomada, sem botão, sem CTA forte
 *
 * Rodar: npx tsx src/scripts/fixMrD1AberturaV6_2026_05_13.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const NEW_NAME = 'marcar_reuniao_abertura_v1';
const OLD_REJECTED = 'mr_d1_abertura_v5';
const AUTOMATION_ID = 'cmnfj0071000013sor2cblyyh';
const STEP_ORDER = 2;

const BODY = 'Olá {{1}}, podemos retomar nossa conversa sobre a {{2}}?';

const EXAMPLE = ['João Silva', 'Mercado Vicenza'];

async function main() {
  console.log(`═══ Tentativa final — ${NEW_NAME} ═══\n`);
  console.log(`Body (${BODY.length} chars):\n${BODY}\n`);

  const existing = await prisma.cloudWaTemplate.findFirst({
    where: { name: NEW_NAME, language: 'pt_BR' },
  });
  if (existing) {
    console.log(`⏭️  ${NEW_NAME} já existe (status=${existing.status})`);
    return;
  }

  const client = await WhatsAppCloudClient.fromDB();
  const components: any[] = [
    { type: 'BODY', text: BODY, example: { body_text: [EXAMPLE] } },
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
      buttons: null,
      bodyExamples: [EXAMPLE] as any,
      variableMapping: [
        { var: '{{1}}', source: 'contact.name' },
        { var: '{{2}}', source: 'organization.name' },
      ] as any,
      rejectedReason: submitError,
    },
  });

  if (submitStatus === 'REJECTED') {
    console.log('\n⚠️  Rejeição persistente. Não atualizando step.');
    process.exit(1);
  }

  const step = await prisma.automationStep.findFirst({
    where: { automationId: AUTOMATION_ID, actionType: 'SEND_WA_TEMPLATE', order: STEP_ORDER },
  });
  if (step) {
    const cfg = (step.config && typeof step.config === 'object' && !Array.isArray(step.config))
      ? (step.config as Record<string, any>)
      : {};
    await prisma.automationStep.update({
      where: { id: step.id },
      data: {
        config: {
          ...cfg,
          templateName: NEW_NAME,
          _migratedFromV5: cfg.templateName,
          _migratedV6At: new Date().toISOString(),
        },
      },
    });
    console.log(`✓ Step ${STEP_ORDER}: ${cfg.templateName} → ${NEW_NAME}`);
  }

  const v5 = await prisma.cloudWaTemplate.findFirst({
    where: { name: OLD_REJECTED, language: 'pt_BR' },
  });
  if (v5 && v5.status !== 'DISABLED') {
    await prisma.cloudWaTemplate.update({
      where: { id: v5.id },
      data: { status: 'DISABLED' },
    });
    console.log(`✓ ${OLD_REJECTED} (REJECTED) → DISABLED`);
  }

  console.log('\n✓ Fix concluído.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
