/**
 * Analisa os 19 leads só na Z-API em "Contato Feito"
 * para decidir como migrar para WABA
 *
 * Executar: cd packages/api && npx tsx src/scripts/analyzeZapiLeads.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Buscar deals abertos em "Contato Feito"
  const deals = await prisma.deal.findMany({
    where: {
      stage: { name: { contains: 'Contato Feito', mode: 'insensitive' } },
      status: 'OPEN',
    },
    include: {
      contact: { select: { id: true, name: true, phone: true, email: true } },
      stage: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filtrar: só Z-API, sem WABA
  const results: any[] = [];

  for (const deal of deals) {
    const phone = deal.contact?.phone;
    if (!phone) continue;

    const normalized = phone.replace(/\D/g, '');

    const zapiConv = await prisma.whatsAppConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: phone },
          { contactId: deal.contact!.id },
        ],
      },
    });

    const wabaConv = await prisma.waConversation.findFirst({
      where: {
        OR: [
          { phone: normalized },
          { phone: phone },
          { contactId: deal.contact!.id },
        ],
      },
    });

    if (!zapiConv || wabaConv) continue; // Só Z-API, sem WABA

    // Buscar TODAS as mensagens da conversa Z-API
    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: zapiConv.id },
      orderBy: { createdAt: 'asc' },
      select: {
        sender: true,
        text: true,
        createdAt: true,
        isFollowUp: true,
        followUpStep: true,
      },
    });

    // Buscar follow-up state
    const followUpState = await prisma.whatsAppFollowUpState.findUnique({
      where: { conversationId: zapiConv.id },
    });

    // Análise
    const clientMsgs = messages.filter(m => m.sender === 'CLIENT');
    const botMsgs = messages.filter(m => m.sender === 'BOT');
    const humanMsgs = messages.filter(m => m.sender === 'HUMAN');
    const followUpMsgs = messages.filter(m => m.isFollowUp);

    const lastClientMsg = clientMsgs.length > 0 ? clientMsgs[clientMsgs.length - 1] : null;
    const lastBotMsg = botMsgs.length > 0 ? botMsgs[botMsgs.length - 1] : null;
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

    // Determinar se lead respondeu
    const leadRespondeu = clientMsgs.length > 0;

    // Dias desde última atividade
    const lastActivity = zapiConv.lastMessageAt || zapiConv.createdAt;
    const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

    results.push({
      contactName: deal.contact?.name || '?',
      phone: phone,
      contactId: deal.contact!.id,
      dealId: deal.id,
      zapiConvId: zapiConv.id,
      zapiStatus: zapiConv.status,
      optedOut: zapiConv.optedOut,
      totalMsgs: messages.length,
      botMsgs: botMsgs.length,
      clientMsgs: clientMsgs.length,
      humanMsgs: humanMsgs.length,
      followUpMsgs: followUpMsgs.length,
      leadRespondeu,
      daysSinceActivity,
      lastActivity: lastActivity?.toISOString().slice(0, 10),
      meetingBooked: zapiConv.meetingBooked,
      needsHumanAttention: zapiConv.needsHumanAttention,
      messages: messages.map(m => ({
        sender: m.sender,
        text: (m.text || '').slice(0, 120),
        date: m.createdAt?.toISOString().slice(0, 10),
        isFollowUp: m.isFollowUp,
      })),
    });
  }

  // ── Apresentar análise ────────────────────────────────────────────────────

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  ANÁLISE DOS 19 LEADS Z-API → WABA`);
  console.log(`══════════════════════════════════════════════\n`);

  // Classificar por cenário
  const optedOut = results.filter(r => r.optedOut);
  const responderam = results.filter(r => !r.optedOut && r.leadRespondeu);
  const frios0msgs = results.filter(r => !r.optedOut && !r.leadRespondeu && r.totalMsgs === 0);
  const friosSemResposta = results.filter(r => !r.optedOut && !r.leadRespondeu && r.totalMsgs > 0);

  console.log(`─────────────────────────────────────────────`);
  console.log(`  CLASSIFICAÇÃO`);
  console.log(`─────────────────────────────────────────────`);
  console.log(`  Opt-out (NÃO migrar):              ${optedOut.length}`);
  console.log(`  Responderam (migrar com cuidado):   ${responderam.length}`);
  console.log(`  Frios sem msgs (migrar limpo):      ${frios0msgs.length}`);
  console.log(`  Frios com msgs sem resposta:        ${friosSemResposta.length}`);
  console.log(`  TOTAL:                              ${results.length}`);
  console.log(`─────────────────────────────────────────────\n`);

  // ── Detalhe de cada lead ──────────────────────────────────────────────────

  for (const r of results) {
    let recomendacao = '';
    let icone = '';

    if (r.optedOut) {
      recomendacao = 'NÃO MIGRAR — lead fez opt-out';
      icone = '🚫';
    } else if (r.leadRespondeu) {
      if (r.daysSinceActivity <= 3) {
        recomendacao = 'MIGRAR → WABA como conversa ativa, bot pode continuar';
        icone = '🟢';
      } else {
        recomendacao = `MIGRAR → WABA, enviar template de retomada (${r.daysSinceActivity} dias sem atividade)`;
        icone = '🟡';
      }
    } else if (r.totalMsgs === 0) {
      recomendacao = 'MIGRAR → WABA como lead novo, enviar primeiro template';
      icone = '🔵';
    } else {
      // Frio: msgs enviadas mas sem resposta
      if (r.botMsgs >= 3) {
        recomendacao = `MIGRAR com cautela — ${r.botMsgs} msgs enviadas sem resposta. Pode ser lead morto. Enviar 1 template de última tentativa`;
        icone = '🔴';
      } else {
        recomendacao = `MIGRAR → WABA, enviar template de primeiro contato (${r.botMsgs} msgs Z-API sem resposta)`;
        icone = '🟠';
      }
    }

    console.log(`${icone} ${r.contactName} — ${r.phone}`);
    console.log(`   Status Z-API: ${r.zapiStatus} | Msgs: ${r.botMsgs} bot, ${r.clientMsgs} cliente, ${r.humanMsgs} humano`);
    console.log(`   Última atividade: ${r.lastActivity} (${r.daysSinceActivity} dias atrás)`);
    console.log(`   Opt-out: ${r.optedOut ? 'SIM' : 'não'} | Reunião: ${r.meetingBooked ? 'SIM' : 'não'}`);
    console.log(`   → ${recomendacao}`);

    // Mostrar últimas mensagens
    if (r.messages.length > 0) {
      console.log(`   Histórico:`);
      for (const m of r.messages.slice(-4)) {
        const tag = m.sender === 'CLIENT' ? '← LEAD' : m.sender === 'BOT' ? '→ BOT' : '→ HUMANO';
        console.log(`     [${m.date}] ${tag}: ${m.text}`);
      }
    }
    console.log('');
  }

  // ── Resumo de ação ────────────────────────────────────────────────────────

  console.log(`══════════════════════════════════════════════`);
  console.log(`  PLANO DE MIGRAÇÃO SUGERIDO`);
  console.log(`══════════════════════════════════════════════\n`);

  console.log(`  🔵 Leads sem msgs (${frios0msgs.length}): Criar WaConversation + enviar template "primeiro_contato"`);
  console.log(`  🟠 Frios 1-2 msgs (${friosSemResposta.filter(r => r.botMsgs < 3).length}): Criar WaConversation + enviar template "primeiro_contato" (já tentou pela Z-API)`);
  console.log(`  🔴 Frios 3+ msgs (${friosSemResposta.filter(r => r.botMsgs >= 3).length}): Avaliar se vale migrar — pode ser lead morto`);
  console.log(`  🟢 Responderam recente (${responderam.filter(r => r.daysSinceActivity <= 3).length}): Migrar e bot assume`);
  console.log(`  🟡 Responderam antigo (${responderam.filter(r => r.daysSinceActivity > 3).length}): Migrar + template "retomada"`);
  console.log(`  🚫 Opt-out (${optedOut.length}): NÃO migrar\n`);
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
