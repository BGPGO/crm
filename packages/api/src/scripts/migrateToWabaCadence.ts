/**
 * Migra 19 leads Z-API "Contato Feito" para cadência WABA:
 * 1. Descadastra de cadências Z-API (AutomationEnrollment)
 * 2. Cancela follow-ups Z-API pendentes (WhatsAppFollowUpState)
 * 3. Inscreve na cadência WABA existente
 *
 * Executar: cd packages/api && npx tsx src/scripts/migrateToWabaCadence.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // PASSO 0: Identificar os 19 leads
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  PASSO 0: Identificando leads Z-API em Contato Feito');
  console.log('══════════════════════════════════════════════\n');

  const deals = await prisma.deal.findMany({
    where: {
      stage: { name: { contains: 'Contato Feito', mode: 'insensitive' } },
      status: 'OPEN',
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } },
    },
  });

  // Filtrar: só Z-API, sem WABA
  const targetLeads: { contactId: string; contactName: string; phone: string; dealId: string }[] = [];

  for (const deal of deals) {
    if (!deal.contact?.phone) continue;
    const normalized = deal.contact.phone.replace(/\D/g, '');

    const zapiConv = await prisma.whatsAppConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: deal.contact.phone },
          { contactId: deal.contact.id },
        ],
      },
      select: { id: true },
    });

    const wabaConv = await prisma.waConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: deal.contact.phone },
          { contactId: deal.contact.id },
        ],
      },
      select: { id: true },
    });

    if (zapiConv && !wabaConv) {
      targetLeads.push({
        contactId: deal.contact.id,
        contactName: deal.contact.name || '?',
        phone: deal.contact.phone,
        dealId: deal.id,
      });
    }
  }

  console.log(`Leads identificados: ${targetLeads.length}\n`);
  for (const l of targetLeads) {
    console.log(`  - ${l.contactName} (${l.phone})`);
  }

  if (targetLeads.length === 0) {
    console.log('\nNenhum lead para migrar.');
    return;
  }

  const contactIds = targetLeads.map(l => l.contactId);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSO 1: Listar automações existentes (pra entender o cenário)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  PASSO 1: Automações disponíveis');
  console.log('══════════════════════════════════════════════\n');

  const allAutomations = await prisma.automation.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      triggerType: true,
      triggerConfig: true,
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log('Todas as automações:');
  for (const a of allAutomations) {
    const tc = a.triggerConfig as any;
    const isCadence = tc?.isCadence ? ' [CADÊNCIA]' : '';
    console.log(`  ${a.status === 'ACTIVE' ? '🟢' : '⚪'} [${a.status}] ${a.name}${isCadence}`);
    console.log(`     ID: ${a.id}`);
    console.log(`     Trigger: ${a.triggerType} | Enrollments: ${a._count.enrollments}`);
    if (tc?.stageId) console.log(`     StageId: ${tc.stageId}`);
    if (tc?.stageName) console.log(`     StageName: ${tc.stageName}`);
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSO 2: Descadastrar de TODAS as cadências Z-API
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════');
  console.log('  PASSO 2: Descadastrando de cadências Z-API');
  console.log('══════════════════════════════════════════════\n');

  // Buscar enrollments ativos desses contatos
  const activeEnrollments = await prisma.automationEnrollment.findMany({
    where: {
      contactId: { in: contactIds },
      status: { in: ['ACTIVE', 'PAUSED'] },
    },
    include: {
      automation: { select: { name: true } },
      contact: { select: { name: true } },
    },
  });

  console.log(`Enrollments ativos encontrados: ${activeEnrollments.length}\n`);

  for (const e of activeEnrollments) {
    console.log(`  ❌ ${e.contact?.name} → "${e.automation.name}" (status: ${e.status})`);
  }

  if (activeEnrollments.length > 0) {
    // Marcar como COMPLETED (não existe CANCELLED no enum)
    const cancelled = await prisma.automationEnrollment.updateMany({
      where: {
        id: { in: activeEnrollments.map(e => e.id) },
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    console.log(`\n✓ ${cancelled.count} enrollments cancelados.`);
  } else {
    console.log('  Nenhum enrollment ativo para cancelar.');
  }

  // Pausar follow-up states Z-API
  console.log('\n  Pausando WhatsAppFollowUpState...');

  const zapiConvIds: string[] = [];
  for (const l of targetLeads) {
    const normalized = l.phone.replace(/\D/g, '');
    const conv = await prisma.whatsAppConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: l.phone },
          { contactId: l.contactId },
        ],
      },
      select: { id: true },
    });
    if (conv) zapiConvIds.push(conv.id);
  }

  if (zapiConvIds.length > 0) {
    const paused = await prisma.whatsAppFollowUpState.updateMany({
      where: { conversationId: { in: zapiConvIds } },
      data: { paused: true },
    });
    console.log(`  ✓ ${paused.count} follow-up states pausados.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSO 3: Encontrar automação WABA de cadência para "Contato Feito" / Lead
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  PASSO 3: Buscando cadência WABA');
  console.log('══════════════════════════════════════════════\n');

  // Buscar automações WABA (que usam SEND_WA_TEMPLATE)
  const wabaAutomations = await prisma.automation.findMany({
    where: {
      steps: {
        some: {
          actionType: 'SEND_WA_TEMPLATE',
        },
      },
    },
    include: {
      steps: { orderBy: { order: 'asc' } },
    },
  });

  if (wabaAutomations.length === 0) {
    console.log('⚠ Nenhuma automação WABA com SEND_WA_TEMPLATE encontrada.');
    console.log('  Buscando qualquer automação de cadência...\n');

    // Fallback: buscar qualquer cadência
    const cadences = allAutomations.filter(a => {
      const tc = a.triggerConfig as any;
      return tc?.isCadence === true;
    });

    if (cadences.length === 0) {
      console.log('❌ Nenhuma cadência encontrada no sistema.');
      console.log('   Precisa criar a automação WABA primeiro (rodar seedWabaAutomations.ts).');
      return;
    }

    console.log('Cadências disponíveis:');
    for (const c of cadences) {
      console.log(`  ${c.status === 'ACTIVE' ? '🟢' : '⚪'} [${c.status}] ${c.name} (${c._count.enrollments} enrollments)`);
    }
  } else {
    console.log(`Automações WABA encontradas: ${wabaAutomations.length}\n`);
    for (const a of wabaAutomations) {
      const stepTypes = a.steps.map(s => s.actionType).join(' → ');
      console.log(`  ${a.status === 'ACTIVE' ? '🟢' : '⚪'} [${a.status}] ${a.name}`);
      console.log(`     ID: ${a.id}`);
      console.log(`     Steps: ${stepTypes}`);
      console.log('');
    }
  }

  // Escolher a cadência WABA "Lead → Contato Feito" (ID: waba_cad_cf)
  const allCandidates = wabaAutomations.length > 0
    ? wabaAutomations
    : await prisma.automation.findMany({
        where: {
          triggerConfig: { path: ['isCadence'], equals: true },
        },
        include: { steps: { orderBy: { order: 'asc' } } },
      });

  if (allCandidates.length === 0) {
    console.log('❌ Sem cadência disponível. Rode seedWabaAutomations.ts primeiro.');
    return;
  }

  // Priorizar a cadência "Lead → Contato Feito — WABA"
  let targetAutomation = allCandidates.find(a => a.id === 'waba_cad_cf')
    || allCandidates.find(a => a.name.toLowerCase().includes('contato feito') && a.name.toLowerCase().includes('waba'))
    || allCandidates.find(a => a.status === 'ACTIVE')
    || allCandidates[0];

  if (targetAutomation.status !== 'ACTIVE') {
    console.log(`  Ativando automação "${targetAutomation.name}" (estava ${targetAutomation.status})...`);
    await prisma.automation.update({
      where: { id: targetAutomation.id },
      data: { status: 'ACTIVE' },
    });
    console.log('  ✓ Automação ativada.');
  }

  console.log(`\n  → Usando: "${targetAutomation.name}" (ID: ${targetAutomation.id})`);

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSO 4: Inscrever leads na cadência WABA
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  PASSO 4: Inscrevendo leads na cadência WABA');
  console.log('══════════════════════════════════════════════\n');

  let enrolled = 0;
  let skipped = 0;

  for (const lead of targetLeads) {
    // Verificar se já está inscrito nessa automação
    const existing = await prisma.automationEnrollment.findFirst({
      where: {
        automationId: targetAutomation.id,
        contactId: lead.contactId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
    });

    if (existing) {
      console.log(`  ⏭ ${lead.contactName} — já inscrito (${existing.status})`);
      skipped++;
      continue;
    }

    // Criar enrollment — primeiro step da automação
    const firstStep = targetAutomation.steps[0];
    await prisma.automationEnrollment.create({
      data: {
        automationId: targetAutomation.id,
        contactId: lead.contactId,
        status: 'ACTIVE',
        currentStepId: firstStep?.id || null,
        nextActionAt: new Date(), // Executa no próximo ciclo do cron
      },
    });

    console.log(`  ✅ ${lead.contactName} (${lead.phone}) → inscrito`);
    enrolled++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log('══════════════════════════════════════════════');
  console.log(`  Cadências Z-API canceladas: ${activeEnrollments.length}`);
  console.log(`  Follow-ups Z-API pausados:  ${zapiConvIds.length}`);
  console.log(`  Inscritos na WABA:          ${enrolled}`);
  console.log(`  Já estavam inscritos:       ${skipped}`);
  console.log(`  Automação WABA usada:       "${targetAutomation.name}"`);
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
