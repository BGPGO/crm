/**
 * Seed: Templates WABA para lembretes de reunião
 *
 * Executa esse script para criar os templates na Meta via API e registrar no banco.
 * Idempotente — verifica antes de criar.
 *
 * Uso:
 *   npx ts-node packages/api/src/seeds/meetingReminderTemplates.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

// ─── Definição dos templates ────────────────────────────────────────────────

interface TemplateDef {
  name: string;
  body: string;
  footer: string;
  bodyExamples: string[][];
}

const TEMPLATES: TemplateDef[] = [
  {
    name: 'lembrete_reuniao_1h',
    body: 'Olá {{1}}, sua reunião está marcada para hoje às {{2}} (falta 1 hora). Te esperamos!',
    footer: 'BGPGO',
    bodyExamples: [['João', '15:00']],
  },
  {
    name: 'lembrete_reuniao_15min',
    body: 'Olá {{1}}, sua reunião começa em 15 minutos (às {{2}}). Estamos te aguardando!',
    footer: 'BGPGO',
    bodyExamples: [['João', '15:00']],
  },
];

// ─── Funções auxiliares ──────────────────────────────────────────────────────

/**
 * Monta o array de components no formato esperado pela Meta.
 */
function buildComponents(def: TemplateDef) {
  return [
    {
      type: 'BODY',
      text: def.body,
      example: {
        body_text: def.bodyExamples,
      },
    },
    {
      type: 'FOOTER',
      text: def.footer,
    },
  ];
}

// ─── Seed principal ──────────────────────────────────────────────────────────

export async function seedMeetingReminderTemplates(): Promise<void> {
  console.log('[seed:meeting-reminder-templates] Iniciando...');

  // Verificar se a Cloud API está configurada
  const cloudConfig = await prisma.cloudWaConfig.findFirst();
  const isConfigured = cloudConfig?.accessToken && cloudConfig?.wabaId;

  let client: WhatsAppCloudClient | null = null;
  if (isConfigured) {
    try {
      client = await WhatsAppCloudClient.fromDB();
      console.log('[seed:meeting-reminder-templates] Cloud API configurada — vai submeter à Meta');
    } catch (err) {
      console.warn('[seed:meeting-reminder-templates] Erro ao inicializar cliente Cloud API:', err);
    }
  } else {
    console.log('[seed:meeting-reminder-templates] Cloud API NÃO configurada — salvando localmente como PENDING');
  }

  for (const def of TEMPLATES) {
    // Verificar se já existe no banco
    const existing = await prisma.cloudWaTemplate.findFirst({
      where: { name: def.name, language: 'pt_BR' },
    });

    if (existing) {
      console.log(`[seed:meeting-reminder-templates] Template "${def.name}" já existe (status: ${existing.status}) — pulando`);
      continue;
    }

    let metaTemplateId: string | null = null;
    let status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING';
    let rejectedReason: string | null = null;

    // Tentar submeter à Meta se o cliente estiver disponível
    if (client) {
      try {
        const components = buildComponents(def);
        const metaResult = await client.createTemplate({
          name: def.name,
          language: 'pt_BR',
          category: 'UTILITY',
          components,
        });
        metaTemplateId = metaResult.id;
        status = (metaResult.status as any) || 'PENDING';
        console.log(`[seed:meeting-reminder-templates] Template "${def.name}" submetido à Meta — id=${metaTemplateId}, status=${status}`);
      } catch (err: any) {
        rejectedReason = err.message || 'Erro ao submeter à Meta';
        status = 'REJECTED';
        console.error(`[seed:meeting-reminder-templates] Erro ao submeter "${def.name}" à Meta:`, rejectedReason);
      }
    }

    // Registrar no banco
    await prisma.cloudWaTemplate.create({
      data: {
        name: def.name,
        language: 'pt_BR',
        category: 'UTILITY',
        status,
        metaTemplateId,
        headerType: null,
        headerContent: null,
        body: def.body,
        footer: def.footer,
        buttons: null,
        bodyExamples: def.bodyExamples,
        headerExample: null,
        rejectedReason,
      },
    });

    console.log(`[seed:meeting-reminder-templates] Template "${def.name}" salvo no banco — status=${status}`);
  }

  console.log('[seed:meeting-reminder-templates] Concluído.');
}

// ─── Execução direta ─────────────────────────────────────────────────────────

if (require.main === module) {
  seedMeetingReminderTemplates()
    .catch(err => {
      console.error('[seed:meeting-reminder-templates] ERRO:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
