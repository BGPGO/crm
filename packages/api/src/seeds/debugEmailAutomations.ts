/**
 * Debug: verifica por que leads recentes não receberam emails das automações.
 *
 * Checklist:
 * 1. Leads criados nas últimas 12h — em qual stage estão?
 * 2. Automations email-by-stage ativas com stageId correspondente?
 * 3. Enrollments criados? Se não, por que evaluateTriggers não os criou?
 * 4. AutomationLog — algum email tentado/falhado?
 * 5. O trigger onStageChanged está disparando? (comparar contactCreated vs stageChanged)
 *
 * Run: npx tsx packages/api/src/seeds/debugEmailAutomations.ts
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  console.log(`🔎 Debug — leads desde ${since.toISOString()}\n`);

  // ─── 1. Automations email-by-stage ────────────────────────────────────
  console.log('═══ 1. AUTOMAÇÕES EMAIL-BY-STAGE ═══');
  const emailAutomations = await prisma.automation.findMany({
    where: { triggerConfig: { path: ['kind'], equals: 'email-by-stage' } },
    select: { id: true, name: true, status: true, triggerType: true, triggerConfig: true },
  });
  for (const a of emailAutomations) {
    const cfg = a.triggerConfig as Record<string, unknown>;
    console.log(`  ${a.status === 'ACTIVE' ? '🟢' : '🔴'} "${a.name}" status=${a.status} stageId=${cfg.stageId}`);
  }
  const activeEmailAutomations = emailAutomations.filter(a => a.status === 'ACTIVE');
  console.log(`  Total: ${emailAutomations.length} | Ativas: ${activeEmailAutomations.length}\n`);

  // ─── 2. Leads/Deals recentes ──────────────────────────────────────────
  console.log('═══ 2. DEALS RECENTES (últimas 12h) ═══');
  const recentDeals = await prisma.deal.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      createdAt: true,
      status: true,
      stage: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  if (recentDeals.length === 0) {
    console.log('  ⚠️  Nenhum deal criado nas últimas 12h');
  }
  for (const d of recentDeals) {
    console.log(
      `  📋 "${d.contact?.name || '(sem nome)'}" (${d.contact?.email || 'sem email'}) — stage: "${d.stage?.name}" — created: ${d.createdAt.toISOString()}`
    );
    // Check: email vazio = não vai receber nada
    if (!d.contact?.email) {
      console.log(`     🔴 CONTATO SEM EMAIL — automação não pode enviar`);
    }
  }
  console.log(`  Total: ${recentDeals.length}\n`);

  // ─── 3. Contacts recentes ─────────────────────────────────────────────
  console.log('═══ 3. CONTACTS RECENTES (últimas 12h) ═══');
  const recentContacts = await prisma.contact.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  for (const c of recentContacts) {
    console.log(`  👤 "${c.name}" email=${c.email || '(vazio)'} created=${c.createdAt.toISOString()}`);
  }
  console.log(`  Total: ${recentContacts.length}\n`);

  // ─── 4. Enrollments recentes (TODOS, não só email-by-stage) ──────────
  console.log('═══ 4. ENROLLMENTS RECENTES (últimas 12h) ═══');
  const recentEnrollments = await prisma.automationEnrollment.findMany({
    where: { enrolledAt: { gte: since } },
    include: {
      automation: { select: { name: true, triggerConfig: true } },
      contact: { select: { name: true, email: true } },
    },
    orderBy: { enrolledAt: "desc" },
    take: 30,
  });
  if (recentEnrollments.length === 0) {
    console.log('  ⚠️  NENHUM enrollment criado nas últimas 12h — evaluateTriggers não disparou NENHUMA automação');
  }
  const emailEnrollments = recentEnrollments.filter(
    e => ((e.automation.triggerConfig as any)?.kind === 'email-by-stage')
  );
  const otherEnrollments = recentEnrollments.filter(
    e => ((e.automation.triggerConfig as any)?.kind !== 'email-by-stage')
  );
  console.log(`  Email-by-stage: ${emailEnrollments.length} | Outros: ${otherEnrollments.length}`);
  for (const e of emailEnrollments) {
    console.log(`  📧 "${e.contact?.name}" → "${e.automation.name}" status=${e.status} created=${e.enrolledAt.toISOString()}`);
  }
  for (const e of otherEnrollments) {
    console.log(`  📱 "${e.contact?.name}" → "${e.automation.name}" status=${e.status} created=${e.enrolledAt.toISOString()}`);
  }
  console.log();

  // ─── 5. AutomationLog recente para email-by-stage ────────────────────
  console.log('═══ 5. AUTOMATION LOGS (últimas 12h, email-by-stage) ═══');
  const emailAutomationIds = activeEmailAutomations.map(a => a.id);
  const logs = await prisma.automationLog.findMany({
    where: {
      executedAt: { gte: since },
      enrollment: { automationId: { in: emailAutomationIds } },
    },
    select: {
      actionType: true,
      result: true,
      executedAt: true,
      enrollment: {
        select: {
          contact: { select: { name: true } },
          automation: { select: { name: true } },
        },
      },
    },
    orderBy: { executedAt: 'desc' },
    take: 20,
  });
  if (logs.length === 0) {
    console.log('  ⚠️  Nenhum log de email-by-stage nas últimas 12h');
  }
  for (const l of logs) {
    const r = l.result as Record<string, unknown> | null;
    console.log(
      `  ${r?.success ? '✅' : '🔴'} ${l.actionType} "${l.enrollment.contact?.name}" via "${l.enrollment.automation.name}" — ${l.executedAt.toISOString()}`
    );
    if (!r?.success) {
      console.log(`     Erro: ${JSON.stringify(r?.output || r).slice(0, 200)}`);
    }
  }
  console.log();

  // ─── 6. Check stageId matching ────────────────────────────────────────
  console.log('═══ 6. MATCH: stageId dos deals vs stageId das automações ═══');
  const automationStageIds = new Set(
    activeEmailAutomations.map(a => (a.triggerConfig as any)?.stageId).filter(Boolean)
  );
  for (const d of recentDeals) {
    const stageId = d.stage?.id;
    const matched = stageId ? automationStageIds.has(stageId) : false;
    console.log(
      `  ${matched ? '✅' : '🔴'} "${d.contact?.name}" stage="${d.stage?.name}" (${stageId}) — ${matched ? 'TEM automação' : 'SEM automação pra esse stageId'}`
    );
  }
  console.log();

  // ─── 7. Check: onStageChanged é chamado pra leads novos? ─────────────
  console.log('═══ 7. DIAGNÓSTICO: POR QUE EMAILS NÃO DISPARARAM ═══');
  const firstStage = await prisma.pipelineStage.findFirst({
    where: { name: { mode: 'insensitive', equals: 'Lead' } },
    select: { id: true, name: true },
  });
  const contactoFeito = await prisma.pipelineStage.findFirst({
    where: { name: { mode: 'insensitive', equals: 'Contato feito' } },
    select: { id: true, name: true },
  });

  if (firstStage && contactoFeito) {
    // Check deals in "Lead" stage (entrada via webhook — NÃO dispara Contato Feito)
    const inLeadStage = recentDeals.filter(d => d.stage?.id === firstStage.id);
    const inContatoFeito = recentDeals.filter(d => d.stage?.id === contactoFeito.id);

    console.log(`  Leads na etapa "Lead": ${inLeadStage.length}`);
    console.log(`  Leads na etapa "Contato feito": ${inContatoFeito.length}`);

    if (inLeadStage.length > 0 && inContatoFeito.length === 0 && emailEnrollments.length === 0) {
      console.log(`\n  🎯 CAUSA PROVÁVEL: Leads entraram na etapa "Lead" via webhook.`);
      console.log(`     A automação de Boas-vindas está configurada pra "Contato feito".`);
      console.log(`     O lead precisa SER MOVIDO de "Lead" → "Contato feito" pra trigger disparar.`);
      console.log(`     Enquanto fica na etapa "Lead", NENHUM email é enviado.`);
    }
  }

  // Check: existe automação pra stage "Lead"?
  const hasLeadStageAutomation = emailAutomations.find(
    a => (a.triggerConfig as any)?.stageName?.toLowerCase() === 'lead'
  );
  if (!hasLeadStageAutomation) {
    console.log(`\n  ℹ️  Não há automação email-by-stage para a etapa "Lead".`);
    console.log(`     Se quiser email automático ao entrar no funil, opções:`);
    console.log(`     A) Criar automação com trigger CONTACT_CREATED`);
    console.log(`     B) Criar automação pra stage "Lead" (trigger STAGE_CHANGED)`);
    console.log(`     C) Manter como está — email só dispara quando lead muda pra outra etapa`);
  }

  console.log('\n════════════════════════════════════════');
  console.log('Debug completo.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
