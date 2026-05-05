/**
 * Sincroniza status dos 5 templates no-show com a Meta + ativa
 * a automação "Cadência No-Show — BGP".
 *
 * Uso: tsx src/seeds/activateNoShowCadence.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const prisma = new PrismaClient();

const TEMPLATE_NAMES = [
  'bgp_no_show_d1_reabertura',
  'bgp_no_show_d2_valor',
  'bgp_no_show_d3_prova_social',
  'bgp_no_show_d5_ligacao',
  'bgp_no_show_d7_breakup',
];

const AUTOMATION_NAME = 'Cadência No-Show — BGP';

async function main() {
  console.log('[activate-no-show] sincronizando status com Meta...\n');

  let client: WhatsAppCloudClient | null = null;
  try {
    client = await WhatsAppCloudClient.fromDB();
  } catch (err: any) {
    console.warn('[activate-no-show] Cloud client indisponível, usando fallback manual:', err.message);
  }

  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const name of TEMPLATE_NAMES) {
    const local = await prisma.cloudWaTemplate.findFirst({
      where: { name, language: 'pt_BR' },
    });
    if (!local) {
      console.warn(`[activate-no-show] ⚠ "${name}" não existe no DB`);
      continue;
    }

    let metaStatus = local.status;

    // Tenta puxar status atualizado da Meta
    if (client && local.metaTemplateId) {
      try {
        const metaTpl = await client.getTemplate(local.metaTemplateId);
        metaStatus = (metaTpl.status as any) || metaStatus;
      } catch (err: any) {
        console.warn(`[activate-no-show] erro ao buscar "${name}" na Meta:`, err.message);
      }
    }

    // Atualiza status local se diferente
    if (metaStatus !== local.status) {
      await prisma.cloudWaTemplate.update({
        where: { id: local.id },
        data: { status: metaStatus as any },
      });
      console.log(`[activate-no-show] "${name}" ${local.status} → ${metaStatus}`);
    } else {
      console.log(`[activate-no-show] "${name}" status=${metaStatus} (sem mudança)`);
    }

    if (metaStatus === 'APPROVED') approvedCount++;
    else if (metaStatus === 'REJECTED') rejectedCount++;
    else pendingCount++;
  }

  console.log(`\nResumo: ${approvedCount} APPROVED · ${pendingCount} PENDING · ${rejectedCount} REJECTED`);

  if (approvedCount < TEMPLATE_NAMES.length) {
    console.warn(`\n⚠ Nem todos os ${TEMPLATE_NAMES.length} templates estão APPROVED — automação NÃO será ativada.`);
    console.warn('  Resolve os pendentes/rejeitados primeiro e roda esse seed de novo.');
    return;
  }

  // Ativa a automation
  const automation = await prisma.automation.findFirst({
    where: { name: AUTOMATION_NAME },
    select: { id: true, status: true },
  });
  if (!automation) {
    console.error(`\n[activate-no-show] ❌ Automation "${AUTOMATION_NAME}" não encontrada.`);
    return;
  }

  if (automation.status === 'ACTIVE') {
    console.log(`\n[activate-no-show] Automation já está ACTIVE (id=${automation.id}) — nada a fazer.`);
    return;
  }

  await prisma.automation.update({
    where: { id: automation.id },
    data: { status: 'ACTIVE' },
  });
  console.log(`\n✅ Automation "${AUTOMATION_NAME}" ativada (DRAFT → ACTIVE)`);
  console.log('   A partir de agora, todo no-show marcado vai disparar a cadência.');
}

main()
  .catch((e) => { console.error('[activate-no-show] erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
