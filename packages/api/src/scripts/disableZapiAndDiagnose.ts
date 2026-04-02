/**
 * Script: Desliga automações Z-API + Diagnóstico de leads
 *
 * 1. Desativa: followUpEnabled, cadenceEnabled, meetingReminderEnabled, sdrAutoMessageEnabled, leadQualificationEnabled
 * 2. MANTÉM: botEnabled=false NÃO — mantém o chat manual funcionando
 * 3. Lista leads ativos em "Contato Feito" que estão na Z-API mas NÃO na WABA
 *
 * Executar: cd packages/api && npx tsx src/scripts/disableZapiAndDiagnose.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // PARTE 1: Desligar automações Z-API (manter chat manual)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n══════════════════════════════════════════════');
  console.log('  PARTE 1: Desligando automações Z-API');
  console.log('══════════════════════════════════════════════\n');

  const config = await prisma.whatsAppConfig.findFirst();

  if (!config) {
    console.log('⚠ Nenhum WhatsAppConfig encontrado no banco.');
    return;
  }

  // Mostrar estado ANTES
  console.log('Estado ANTES:');
  console.log(`  botEnabled              = ${config.botEnabled} (NÃO vamos mexer — chat manual)`);
  console.log(`  followUpEnabled         = ${config.followUpEnabled}`);
  console.log(`  cadenceEnabled          = ${config.cadenceEnabled}`);
  console.log(`  meetingReminderEnabled  = ${config.meetingReminderEnabled}`);
  console.log(`  sdrAutoMessageEnabled   = ${config.sdrAutoMessageEnabled}`);
  console.log(`  leadQualificationEnabled= ${config.leadQualificationEnabled}`);
  console.log(`  warmupEnabled           = ${config.warmupEnabled}`);
  console.log('');

  // Desativar automações — manter botEnabled como está pra chat manual
  await prisma.whatsAppConfig.update({
    where: { id: config.id },
    data: {
      followUpEnabled: false,
      cadenceEnabled: false,
      meetingReminderEnabled: false,
      sdrAutoMessageEnabled: false,
      leadQualificationEnabled: false,
      warmupEnabled: false,
    },
  });

  console.log('Estado DEPOIS:');
  console.log('  botEnabled              = (não alterado)');
  console.log('  followUpEnabled         = false');
  console.log('  cadenceEnabled          = false');
  console.log('  meetingReminderEnabled  = false');
  console.log('  sdrAutoMessageEnabled   = false');
  console.log('  leadQualificationEnabled= false');
  console.log('  warmupEnabled           = false');
  console.log('\n✓ Automações Z-API desligadas. Chat manual continua funcionando.\n');

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTE 2: Diagnóstico — Leads em "Contato Feito" na Z-API sem WABA
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════');
  console.log('  PARTE 2: Diagnóstico de leads');
  console.log('══════════════════════════════════════════════\n');

  // Buscar todos os deals abertos em "Contato Feito"
  const dealsContatoFeito = await prisma.deal.findMany({
    where: {
      stage: { name: { contains: 'Contato Feito', mode: 'insensitive' } },
      status: 'OPEN',
    },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
      stage: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total de deals ABERTOS em "Contato Feito": ${dealsContatoFeito.length}\n`);

  if (dealsContatoFeito.length === 0) {
    console.log('Nenhum deal aberto em "Contato Feito".');
    return;
  }

  // Para cada deal, verificar se tem conversa Z-API e/ou WABA
  const results: {
    dealId: string;
    contactName: string;
    phone: string;
    hasZapi: boolean;
    hasWaba: boolean;
    zapiStatus: string;
    zapiLastMsg: Date | null;
    zapiMsgCount: number;
    wabaLastMsg: Date | null;
    wabaMsgCount: number;
  }[] = [];

  for (const deal of dealsContatoFeito) {
    const phone = deal.contact?.phone;
    if (!phone) {
      results.push({
        dealId: deal.id,
        contactName: deal.contact?.name || '(sem contato)',
        phone: '(sem telefone)',
        hasZapi: false,
        hasWaba: false,
        zapiStatus: '-',
        zapiLastMsg: null,
        zapiMsgCount: 0,
        wabaLastMsg: null,
        wabaMsgCount: 0,
      });
      continue;
    }

    // Normalizar telefone (remover caracteres não numéricos)
    const normalized = phone.replace(/\D/g, '');

    // Buscar conversa Z-API
    const zapiConv = await prisma.whatsAppConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: phone },
          { contactId: deal.contact!.id },
        ],
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    // Buscar conversa WABA
    const wabaConv = await prisma.waConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: phone },
          { contactId: deal.contact!.id },
        ],
      },
      include: {
        _count: { select: { messages: true } },
      },
    });

    results.push({
      dealId: deal.id.slice(0, 8),
      contactName: deal.contact?.name || '(sem nome)',
      phone: phone,
      hasZapi: !!zapiConv,
      hasWaba: !!wabaConv,
      zapiStatus: zapiConv ? (zapiConv.status || 'open') : '-',
      zapiLastMsg: zapiConv?.lastMessageAt || null,
      zapiMsgCount: zapiConv?._count?.messages || 0,
      wabaLastMsg: wabaConv?.lastMessageAt || null,
      wabaMsgCount: wabaConv?._count?.messages || 0,
    });
  }

  // ── Resumo ────────────────────────────────────────────────────────────────

  const soZapi = results.filter(r => r.hasZapi && !r.hasWaba);
  const soWaba = results.filter(r => !r.hasZapi && r.hasWaba);
  const ambos = results.filter(r => r.hasZapi && r.hasWaba);
  const nenhum = results.filter(r => !r.hasZapi && !r.hasWaba);

  console.log('─────────────────────────────────────────────');
  console.log('  RESUMO');
  console.log('─────────────────────────────────────────────');
  console.log(`  Só Z-API (precisa migrar):  ${soZapi.length}`);
  console.log(`  Só WABA (já migrado):       ${soWaba.length}`);
  console.log(`  Ambos (Z-API + WABA):       ${ambos.length}`);
  console.log(`  Nenhum canal:               ${nenhum.length}`);
  console.log(`  TOTAL:                       ${results.length}`);
  console.log('─────────────────────────────────────────────\n');

  // ── Detalhe: Só Z-API ─────────────────────────────────────────────────────

  if (soZapi.length > 0) {
    console.log('══════════════════════════════════════════════');
    console.log('  LEADS SÓ NA Z-API (não têm WABA)');
    console.log('══════════════════════════════════════════════\n');

    for (const r of soZapi) {
      console.log(`  📱 ${r.contactName}`);
      console.log(`     Tel: ${r.phone}`);
      console.log(`     Z-API: ${r.zapiMsgCount} msgs | status: ${r.zapiStatus} | última: ${r.zapiLastMsg?.toISOString().slice(0, 10) || 'nunca'}`);
      console.log(`     WABA: ❌ sem conversa`);
      console.log('');
    }
  }

  // ── Detalhe: Ambos ────────────────────────────────────────────────────────

  if (ambos.length > 0) {
    console.log('══════════════════════════════════════════════');
    console.log('  LEADS EM AMBOS (Z-API + WABA)');
    console.log('══════════════════════════════════════════════\n');

    for (const r of ambos) {
      console.log(`  📱 ${r.contactName}`);
      console.log(`     Tel: ${r.phone}`);
      console.log(`     Z-API: ${r.zapiMsgCount} msgs | última: ${r.zapiLastMsg?.toISOString().slice(0, 10) || 'nunca'}`);
      console.log(`     WABA:  ${r.wabaMsgCount} msgs | última: ${r.wabaLastMsg?.toISOString().slice(0, 10) || 'nunca'}`);
      console.log('');
    }
  }

  // ── Detalhe: Nenhum canal ─────────────────────────────────────────────────

  if (nenhum.length > 0) {
    console.log('══════════════════════════════════════════════');
    console.log('  LEADS SEM NENHUM CANAL WhatsApp');
    console.log('══════════════════════════════════════════════\n');

    for (const r of nenhum) {
      console.log(`  ⚠ ${r.contactName} — Tel: ${r.phone}`);
    }
    console.log('');
  }

  // ── Detalhe: Só WABA ─────────────────────────────────────────────────────

  if (soWaba.length > 0) {
    console.log('══════════════════════════════════════════════');
    console.log('  LEADS JÁ NA WABA (sem Z-API)');
    console.log('══════════════════════════════════════════════\n');

    for (const r of soWaba) {
      console.log(`  ✅ ${r.contactName} — ${r.wabaMsgCount} msgs WABA`);
    }
    console.log('');
  }

  console.log('══════════════════════════════════════════════');
  console.log('  SCRIPT FINALIZADO');
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
