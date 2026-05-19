/**
 * Deep dive — pra cada um dos 30 não-enviados, traz dados pra decidir
 * se "REALMENTE não mandar" ou se vale tentar de novo.
 *
 * Critérios extras:
 *  - opt-out: quando foi? qual msg inbound disparou? quanto tempo atrás?
 *  - needsHumanAttention: quando foi setado? última atividade? conversa morta há tempo?
 *  - wa-cap-hit: qual tag e quando setada?
 *  - 130472/131049: já recebeu MARKETING antes com sucesso? recebeu UTILITY?
 *  - 131050 (opt-out Meta nativo): definitivo, NÃO mandar
 */
import 'dotenv/config';
import prisma from '../lib/prisma';

const BROADCAST_ID = 'cmpbdf81338w6mmagbttvgmcv';

interface Row {
  category: string;
  phone: string;
  contactName?: string | null;
  recommendation: string;
  reasoning: string;
}

async function main() {
  const all = await prisma.waBroadcastContact.findMany({
    where: { broadcastId: BROADCAST_ID, status: { in: ['WA_BC_SKIPPED', 'WA_BC_FAILED'] as any } },
    select: { phone: true, error: true, status: true, contactId: true, waMessageId: true },
  });

  console.log(`═══ Deep dive ${all.length} não-enviados ═══\n`);
  const rows: Row[] = [];

  // Carregar templates MARKETING pra histórico
  const marketingTpls = (await prisma.cloudWaTemplate.findMany({ where: { category: 'MARKETING' }, select: { name: true }})).map(t => t.name);

  for (const bc of all) {
    const conv = await prisma.waConversation.findUnique({
      where: { phone: bc.phone },
      select: {
        id: true, optedOut: true, optedOutAt: true, needsHumanAttention: true,
        lastClientMessageAt: true, lastMessageAt: true, status: true, contactId: true,
        contact: { select: { name: true, phoneInvalid: true }},
      },
    });

    // Última inbound (mensagem do contato pra nós)
    const lastInbound = conv ? await prisma.waMessage.findFirst({
      where: { conversationId: conv.id, direction: 'INBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, body: true, type: true },
    }) : null;

    // Última outbound (qualquer envio nosso pra esse contato)
    const lastOutbound = conv ? await prisma.waMessage.findFirst({
      where: { conversationId: conv.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, type: true, templateName: true, status: true },
    }) : null;

    // Tags do contato
    const tags = bc.contactId ? await prisma.contact.findUnique({
      where: { id: bc.contactId },
      select: { tags: { select: { tag: { select: { name: true }}, createdAt: true }}, createdAt: true, dealContacts: { select: { deal: { select: { stage: { select: { name: true }}, status: true }}}, take: 3 }, leadTrackings: { select: { utmSource: true, utmCampaign: true }, take: 1, orderBy: { createdAt: 'desc' }}},
    }) : null;

    // Histórico: já recebeu template UTILITY com sucesso (DELIVERED ou READ)?
    const utilityOk = conv ? await prisma.waMessage.findFirst({
      where: {
        conversationId: conv.id, direction: 'OUTBOUND', type: 'TEMPLATE',
        templateName: { notIn: marketingTpls },
        status: { in: ['WA_DELIVERED', 'WA_READ'] as any },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, templateName: true },
    }) : null;

    // Histórico: já recebeu template MARKETING com sucesso?
    const mktOk = conv ? await prisma.waMessage.findFirst({
      where: {
        conversationId: conv.id, direction: 'OUTBOUND', type: 'TEMPLATE',
        templateName: { in: marketingTpls },
        status: { in: ['WA_DELIVERED', 'WA_READ'] as any },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, templateName: true },
    }) : null;

    // Distribuição de tags
    const tagNames = tags?.tags.map(t => t.tag.name) || [];
    const dealStages = tags?.dealContacts.map(dc => `${dc.deal?.stage?.name || '?'}/${dc.deal?.status || '?'}`) || [];
    const source = tags?.leadTrackings?.[0] ? `${tags.leadTrackings[0].utmSource || '-'}/${(tags.leadTrackings[0].utmCampaign || '').slice(0,40)}` : '-';

    let category = '';
    let recommendation = '';
    let reasoning = '';

    // Classificação
    if (bc.status === 'WA_BC_FAILED') {
      // Pegar errorCode da WaMessage
      const waMsg = bc.waMessageId ? await prisma.waMessage.findFirst({
        where: { waMessageId: bc.waMessageId }, select: { errorCode: true },
      }) : null;
      const code = waMsg?.errorCode || '?';

      if (code === '131050') {
        category = 'FAILED/131050 — opt-out Meta nativo';
        recommendation = 'NÃO MANDAR — DEFINITIVO';
        reasoning = 'Usuário usou "Stop messages" direto no WhatsApp. Mandar de novo = ban e multa. Marcar optedOut local.';
      } else if (code === '131026') {
        category = 'FAILED/131026 — undeliverable';
        recommendation = 'NÃO MANDAR';
        reasoning = `Número inválido / sem WhatsApp. phoneInvalid já marcado=${conv?.contact?.phoneInvalid}.`;
      } else if (code === '130472') {
        category = 'FAILED/130472 — experimento Meta';
        recommendation = mktOk ? '⚠ TENTAR DEPOIS — Meta libera/bloqueia por ciclo' : 'TENTAR DEPOIS (1-2 dias)';
        reasoning = `Meta A/B testa esses números. Pode mudar a cada campanha. Já recebeu MKT com sucesso? ${mktOk ? 'SIM em ' + mktOk.createdAt.toISOString().slice(0,10) : 'NÃO'}.`;
      } else if (code === '131049') {
        category = 'FAILED/131049 — throttle ecosystem';
        recommendation = utilityOk ? '✅ TENTAR COM UTILITY' : '⚠ TENTAR COM UTILITY ou aguardar';
        reasoning = `Meta throttla MARKETING pra contatos frios. UTILITY normalmente passa. ${utilityOk ? 'Já recebeu UTILITY com sucesso em ' + utilityOk.createdAt.toISOString().slice(0,10) : 'Nunca recebeu UTILITY'}.`;
      } else {
        category = `FAILED/${code}`;
        recommendation = '?';
        reasoning = 'errorCode não classificado';
      }
    } else if (bc.error === 'wa-cap-hit-blocked') {
      const capHitTag = tags?.tags.find(t => t.tag.name === 'wa-cap-hit');
      const tagDate = capHitTag?.createdAt;
      const daysAgo = tagDate ? Math.floor((Date.now() - tagDate.getTime()) / (24*60*60*1000)) : null;
      category = 'SKIPPED — wa-cap-hit-blocked';
      if (daysAgo !== null && daysAgo > 30) {
        recommendation = '⚠ AVALIAR — tag antiga, talvez Meta já liberou';
        reasoning = `Tag wa-cap-hit foi setada há ${daysAgo} dias. Vale revisar.`;
      } else {
        recommendation = 'NÃO MANDAR (curto prazo)';
        reasoning = `Tag wa-cap-hit setada há ${daysAgo ?? '?'} dias. Meta cap por par recente. ${utilityOk ? 'Já recebeu UTILITY OK → talvez funcione com UTILITY' : ''}`;
      }
    } else if (conv?.contact?.phoneInvalid) {
      category = 'SKIPPED — phoneInvalid';
      recommendation = 'NÃO MANDAR';
      reasoning = `Contact.phoneInvalid=true (errorCode 131026 prévio).`;
    } else if (conv?.optedOut) {
      const daysAgo = conv.optedOutAt ? Math.floor((Date.now() - conv.optedOutAt.getTime()) / (24*60*60*1000)) : null;
      category = 'SKIPPED — opt-out';
      recommendation = 'NÃO MANDAR';
      reasoning = `optedOut em ${conv.optedOutAt?.toISOString().slice(0,10)} (${daysAgo} dias atrás). Lei + WhatsApp policy.`;
    } else if (conv?.needsHumanAttention) {
      const daysSinceInbound = lastInbound ? Math.floor((Date.now() - lastInbound.createdAt.getTime()) / (24*60*60*1000)) : null;
      const daysSinceOutbound = lastOutbound ? Math.floor((Date.now() - lastOutbound.createdAt.getTime()) / (24*60*60*1000)) : null;
      category = 'SKIPPED — needsHumanAttention';
      if (daysSinceInbound !== null && daysSinceInbound > 14) {
        recommendation = '⚠ AVALIAR — atendimento humano "esquecido"';
        reasoning = `needsHumanAttention=true mas última msg do contato há ${daysSinceInbound}d. Conversa morta. Provavelmente vendedor esqueceu de fechar. Talvez reabilitar pra broadcast.`;
      } else if (daysSinceInbound !== null && daysSinceInbound <= 7) {
        recommendation = 'NÃO MANDAR — em atendimento ativo';
        reasoning = `Atendimento ativo (última inbound há ${daysSinceInbound}d). Mandar broadcast vai atrapalhar.`;
      } else {
        recommendation = '? AVALIAR';
        reasoning = `last inbound há ${daysSinceInbound}d, last outbound há ${daysSinceOutbound}d.`;
      }
    } else {
      category = 'SKIPPED — outro';
      recommendation = '?';
      reasoning = 'Não classificado';
    }

    const r: Row = {
      category, phone: bc.phone, contactName: conv?.contact?.name,
      recommendation, reasoning,
    };
    rows.push(r);

    console.log(`\n── [${bc.status}] ${bc.phone}  ${(conv?.contact?.name || '').slice(0,30)} ──`);
    console.log(`  Categoria:       ${category}`);
    console.log(`  Recomendação:    ${recommendation}`);
    console.log(`  Reasoning:       ${reasoning}`);
    console.log(`  Tags:            ${tagNames.join(', ') || '-'}`);
    console.log(`  Deals:           ${dealStages.join(', ') || '-'}`);
    console.log(`  Source:          ${source}`);
    console.log(`  Última inbound:  ${lastInbound ? lastInbound.createdAt.toISOString().slice(0,16) + ' — ' + (lastInbound.body || lastInbound.type || '').slice(0,60) : '(nunca)'}`);
    console.log(`  Última outbound: ${lastOutbound ? lastOutbound.createdAt.toISOString().slice(0,16) + ` [${lastOutbound.templateName || lastOutbound.type}] ${lastOutbound.status}` : '(nunca)'}`);
    console.log(`  UTILITY ok:      ${utilityOk ? utilityOk.templateName + ' em ' + utilityOk.createdAt.toISOString().slice(0,10) : 'nunca'}`);
    console.log(`  MARKETING ok:    ${mktOk ? mktOk.templateName + ' em ' + mktOk.createdAt.toISOString().slice(0,10) : 'nunca'}`);
  }

  // ── Sumário ──────────────────────────────────────────────────────────────
  console.log('\n\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RESUMO POR RECOMENDAÇÃO                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  const byRec: Record<string, string[]> = {};
  for (const r of rows) {
    if (!byRec[r.recommendation]) byRec[r.recommendation] = [];
    byRec[r.recommendation].push(`${r.phone} ${(r.contactName || '').slice(0,20)} (${r.category.split('—')[1]?.trim() || r.category})`);
  }
  for (const [rec, list] of Object.entries(byRec)) {
    console.log(`\n${rec} (${list.length}):`);
    for (const item of list) console.log(`  ${item}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
