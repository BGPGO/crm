/**
 * Criação de Template UTILITY — 2026-05-18
 *
 * Cria `cadencia_d1_confirmacao_utility` (categoria UTILITY) para substituir
 * `cadencia_d1_abertura_v3` (MARKETING) que sofre throttle 131049 com leads frios.
 * Templates UTILITY não passam pelo frequency capping da Meta.
 *
 * SOMENTE LEITURA + 1 INSERT. Não toca em nenhum template existente.
 *
 * Rodar com:
 *   npx tsx src/scripts/createConfirmacaoUtilityTemplate_2026_05_18.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const TEMPLATE_NAME = 'cadencia_d1_confirmacao_utility';
const V3_NAME = 'cadencia_d1_abertura_v3';

const BODY =
  'Oi {{1}}, recebemos seu cadastro na Bertuzzi Patrimonial pra análise da {{2}}. Sua solicitação está confirmada. Pra avançar, agende sua conversa abaixo:';

const BODY_EXAMPLES: string[][] = [['João', 'Bertuzzi Patrimonial']];

// variableMapping replicado do v3 + fallbacks conforme spec da missão
const VARIABLE_MAPPING = [
  { var: '{{1}}', source: 'contact.name', fallback: 'tudo bem' },
  { var: '{{2}}', source: 'organization.name', fallback: 'sua empresa' },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Criação de Template UTILITY — cadencia_d1_confirmacao_utility');
  console.log('Data: 2026-05-18');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. Ler CloudWaConfig ──────────────────────────────────────────────────
  const cloudConfig = await prisma.cloudWaConfig.findFirst();
  if (!cloudConfig?.accessToken || !cloudConfig?.wabaId) {
    throw new Error('CloudWaConfig não configurada no banco — abortando');
  }
  console.log(`✓ WABA ID: ${cloudConfig.wabaId}`);

  // ── 2. Ler v3 para pegar URL do botão ────────────────────────────────────
  const v3 = await prisma.cloudWaTemplate.findFirst({
    where: { name: V3_NAME },
  });
  if (!v3) {
    throw new Error(`Template ${V3_NAME} não encontrado no banco — abortando`);
  }

  const v3Buttons = v3.buttons as Array<{ type: string; text: string; url?: string }> | null;
  const calendlyUrl = v3Buttons?.[0]?.url;
  if (!calendlyUrl) {
    throw new Error(`${V3_NAME} não tem botão URL configurado — abortando`);
  }
  console.log(`✓ URL do botão copiada de ${V3_NAME}: ${calendlyUrl}`);
  console.log(`  v3 categoria: ${v3.category} | status: ${v3.status} | failRate7d: ${v3.failRate7d}`);

  // ── 3. Verificar se o template novo já existe ─────────────────────────────
  const existing = await prisma.cloudWaTemplate.findFirst({
    where: { name: TEMPLATE_NAME, language: 'pt_BR' },
  });
  if (existing) {
    console.log(`\n⚠️  Template ${TEMPLATE_NAME} já existe no banco:`);
    console.log(`   id=${existing.id} | status=${existing.status} | metaId=${existing.metaTemplateId}`);
    console.log('   Nada a fazer — abortando sem erro.');
    await prisma.$disconnect();
    return;
  }
  console.log(`✓ ${TEMPLATE_NAME} ainda não existe — prosseguindo com criação\n`);

  // ── 4. Montar components para a Meta ─────────────────────────────────────
  const components: any[] = [
    {
      type: 'BODY',
      text: BODY,
      example: { body_text: BODY_EXAMPLES },
    },
    {
      type: 'BUTTONS',
      buttons: [
        {
          type: 'URL',
          text: 'Confirmar agendamento',
          url: calendlyUrl,
        },
      ],
    },
  ];

  console.log('── Payload do template ───────────────────────────────────────');
  console.log(`  nome:      ${TEMPLATE_NAME}`);
  console.log(`  categoria: UTILITY`);
  console.log(`  idioma:    pt_BR`);
  console.log(`  body:      ${BODY}`);
  console.log(`  botão:     Confirmar agendamento → ${calendlyUrl}`);
  console.log(`  exemplos:  ${JSON.stringify(BODY_EXAMPLES)}`);
  console.log('──────────────────────────────────────────────────────────────\n');

  // ── 5. Submeter à Meta ────────────────────────────────────────────────────
  const client = await WhatsAppCloudClient.fromDB();

  let metaTemplateId: string | null = null;
  let submitStatus = 'PENDING';
  let submitError: string | null = null;
  let metaCategory: string | null = null;

  console.log('Submetendo template à Meta API...');
  try {
    const metaResult = await client.createTemplate({
      name: TEMPLATE_NAME,
      language: 'pt_BR',
      category: 'UTILITY',
      components,
    });
    metaTemplateId = metaResult.id;
    submitStatus = metaResult.status || 'PENDING';
    metaCategory = metaResult.category || 'UTILITY';
    console.log(`✓ Meta aceitou a submissão:`);
    console.log(`  metaTemplateId: ${metaTemplateId}`);
    console.log(`  status Meta:    ${submitStatus}`);
    console.log(`  categoria Meta: ${metaCategory}`);

    if (metaCategory && metaCategory !== 'UTILITY') {
      console.log(
        `\n⚠️  ATENÇÃO: Meta reclassificou de UTILITY → ${metaCategory}. ` +
        `O template NÃO escapará do frequency capping. Reportar ao usuário antes de substituir o step na cadência.`
      );
    }
  } catch (err: any) {
    submitError = err.response?.data
      ? JSON.stringify(err.response.data)
      : (err.message || 'Erro desconhecido');
    submitStatus = 'REJECTED';
    console.error(`✗ Meta rejeitou a submissão: ${submitError}`);
  }

  // ── 6. Persistir no banco ─────────────────────────────────────────────────
  console.log('\nPersistindo no banco...');
  const saved = await prisma.cloudWaTemplate.create({
    data: {
      name: TEMPLATE_NAME,
      language: 'pt_BR',
      // Usar categoria retornada pela Meta se disponível; senão UTILITY como solicitado
      category: (metaCategory as any) || 'UTILITY',
      status: submitStatus as any,
      metaTemplateId,
      headerType: null,
      headerContent: null,
      body: BODY,
      footer: null,
      buttons: [
        {
          type: 'URL',
          text: 'Confirmar agendamento',
          url: calendlyUrl,
        },
      ] as any,
      bodyExamples: BODY_EXAMPLES as any,
      headerExample: null,
      variableMapping: VARIABLE_MAPPING as any,
      rejectedReason: submitError,
    },
  });

  console.log(`✓ Template salvo no banco:`);
  console.log(`  id:             ${saved.id}`);
  console.log(`  name:           ${saved.name}`);
  console.log(`  category:       ${saved.category}`);
  console.log(`  status:         ${saved.status}`);
  console.log(`  metaTemplateId: ${saved.metaTemplateId}`);
  if (saved.rejectedReason) {
    console.log(`  rejectedReason: ${saved.rejectedReason}`);
  }

  // ── 7. Aguardar 45s e checar status ──────────────────────────────────────
  if (metaTemplateId) {
    console.log('\nAguardando 45s para checar status na Meta...');
    await new Promise((r) => setTimeout(r, 45_000));

    const refreshed = await prisma.cloudWaTemplate.findFirst({
      where: { name: TEMPLATE_NAME },
    });
    console.log('\n── Status após 45s ───────────────────────────────────────────');
    console.log(`  status:         ${refreshed?.status}`);
    console.log(`  category:       ${refreshed?.category}`);
    console.log(`  rejectedReason: ${refreshed?.rejectedReason ?? 'null'}`);
    console.log('──────────────────────────────────────────────────────────────');

    if (refreshed?.category && refreshed.category !== 'UTILITY') {
      console.log(
        `\n🚨 RECLASSIFICAÇÃO CONFIRMADA: categoria no banco = ${refreshed.category}. ` +
        `Não substituir o step da cadência sem aprovação do usuário.`
      );
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Script concluído.');
  console.log(
    submitError
      ? 'Template foi salvo localmente com status REJECTED. Verificar erro acima.'
      : 'Template submetido com sucesso. Aguardar aprovação da Meta (tipicamente <24h).'
  );
  console.log('Wave 2 (substituição do step na cadência) depende de aprovação UTILITY pela Meta.');
  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\nFALHA NO SCRIPT:', err);
  process.exit(1);
});
