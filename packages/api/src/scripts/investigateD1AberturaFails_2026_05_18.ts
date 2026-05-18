/**
 * Investigação: failRate alto do template cadencia_d1_abertura_v3
 * Squad Beta — Research — 2026-05-18
 * SOMENTE LEITURA — zero escrita no banco.
 */
import 'dotenv/config';
import prisma from '../lib/prisma';

const TEMPLATE = 'cadencia_d1_abertura_v3';
const now = new Date();
const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

function fmtDate(d: Date | null | undefined) {
  if (!d) return 'null';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16);
}

// ─── SEÇÃO 1 — Falhas detalhadas últimos 14 dias ─────────────────────────────
async function secao1() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 1 — Falhas detalhadas (últimos 14 dias)');
  console.log('══════════════════════════════════════════════════════════');

  const falhas = await prisma.waMessage.findMany({
    where: {
      templateName: TEMPLATE,
      direction: 'OUTBOUND',
      status: 'WA_FAILED',
      createdAt: { gte: d14 },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      errorCode: true,
      errorMessage: true,
      conversationId: true,
      conversation: {
        select: {
          phone: true,
          pushName: true,
          optedOut: true,
          needsHumanAttention: true,
          contactId: true,
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              createdAt: true,
              deals: {
                select: {
                  id: true,
                  status: true,
                  stage: { select: { name: true } },
                  source: { select: { name: true } },
                },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
              leadTrackings: {
                select: {
                  utmSource: true,
                  utmMedium: true,
                  utmCampaign: true,
                  landingPage: true,
                  referrer: true,
                },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      },
    },
  });

  console.log(`Total de falhas encontradas: ${falhas.length}\n`);

  for (const f of falhas) {
    const contact = f.conversation?.contact;
    const phone   = f.conversation?.phone ?? '?';
    const nome    = contact?.name ?? f.conversation?.pushName ?? '?';
    const contactId = contact?.id ?? f.conversation?.contactId ?? '?';

    // Volume histórico outbound 30d para esse phone
    let volumeOutbound30d = 0;
    if (f.conversation?.phone) {
      volumeOutbound30d = await prisma.waMessage.count({
        where: {
          conversation: { phone: f.conversation.phone },
          direction: 'OUTBOUND',
          createdAt: { gte: d30 },
        },
      });
    }

    const deal = contact?.deals?.[0];
    const lt   = contact?.leadTrackings?.[0];

    const idadeDias = contact?.createdAt
      ? Math.round((now.getTime() - new Date(contact.createdAt).getTime()) / 86400000)
      : null;

    console.log(`─── ${fmtDate(f.createdAt)} ───`);
    console.log(`  Erro: ${f.errorCode ?? '-'} | ${(f.errorMessage ?? '-').slice(0, 100)}`);
    console.log(`  Contato: ${nome} (id=${contactId}) | Phone: ${phone}`);
    console.log(`  Criado há ${idadeDias ?? '?'} dias | optedOut=${f.conversation?.optedOut} | needsHuman=${f.conversation?.needsHumanAttention}`);
    console.log(`  Volume outbound 30d (phone): ${volumeOutbound30d} msgs`);
    if (deal) {
      console.log(`  Deal: status=${deal.status} | etapa="${deal.stage?.name ?? '?'}" | fonte="${deal.source?.name ?? '?'}"`);
    } else {
      console.log(`  Deal: nenhum encontrado`);
    }
    if (lt) {
      console.log(`  UTM: source=${lt.utmSource ?? '-'} medium=${lt.utmMedium ?? '-'} campaign=${lt.utmCampaign ?? '-'}`);
      console.log(`  LP: ${lt.landingPage ?? '-'} | ref: ${lt.referrer ?? '-'}`);
    } else {
      console.log(`  UTM: sem dados`);
    }
    console.log('');
  }
}

// ─── SEÇÃO 2 — Distribuição de errorCodes (14 dias) ──────────────────────────
async function secao2() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 2 — Distribuição de errorCodes (últimos 14 dias)');
  console.log('══════════════════════════════════════════════════════════');

  const dist = await prisma.$queryRaw<Array<{ errorCode: string | null; count: bigint }>>`
    SELECT "errorCode", COUNT(*)::bigint AS count
    FROM "WaMessage"
    WHERE "templateName" = ${TEMPLATE}
      AND direction = 'OUTBOUND'
      AND "errorCode" IS NOT NULL
      AND "createdAt" >= ${d14}
    GROUP BY "errorCode"
    ORDER BY count DESC
  `;

  if (dist.length === 0) {
    console.log('Nenhum errorCode registrado no período.');
  }
  for (const d of dist) {
    const desc = mapErrorCode(String(d.errorCode ?? ''));
    console.log(`  ${String(d.errorCode ?? '-').padEnd(8)} x${d.count}  — ${desc}`);
  }

  // Também falhas sem errorCode (status WA_FAILED mas sem código)
  const semCodigo = await prisma.waMessage.count({
    where: {
      templateName: TEMPLATE,
      direction: 'OUTBOUND',
      status: 'WA_FAILED',
      errorCode: null,
      createdAt: { gte: d14 },
    },
  });
  console.log(`\n  Falhas sem errorCode (status WA_FAILED, errorCode NULL): ${semCodigo}`);
}

// ─── SEÇÃO 3 — Padrões temporais ─────────────────────────────────────────────
async function secao3() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 3 — Padrões temporais (últimos 14 dias)');
  console.log('══════════════════════════════════════════════════════════');

  // Hora do dia — falhas
  const horaFalha = await prisma.$queryRaw<Array<{ hora: number; count: bigint }>>`
    SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
           COUNT(*)::bigint AS count
    FROM "WaMessage"
    WHERE "templateName" = ${TEMPLATE}
      AND direction = 'OUTBOUND'
      AND status = 'WA_FAILED'
      AND "createdAt" >= ${d14}
    GROUP BY hora ORDER BY hora
  `;

  // Hora do dia — sucessos
  const horaSucesso = await prisma.$queryRaw<Array<{ hora: number; count: bigint }>>`
    SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
           COUNT(*)::bigint AS count
    FROM "WaMessage"
    WHERE "templateName" = ${TEMPLATE}
      AND direction = 'OUTBOUND'
      AND status IN ('WA_DELIVERED', 'WA_READ', 'WA_SENT')
      AND "createdAt" >= ${d14}
    GROUP BY hora ORDER BY hora
  `;

  console.log('\n  Hora (BRT) | Falhas | Sucessos');
  console.log('  ---------- | ------ | --------');
  const allHours = new Set([
    ...horaFalha.map((h) => h.hora),
    ...horaSucesso.map((h) => h.hora),
  ]);
  const mapFalha = Object.fromEntries(horaFalha.map((h) => [h.hora, h.count]));
  const mapSucesso = Object.fromEntries(horaSucesso.map((h) => [h.hora, h.count]));
  for (const hr of Array.from(allHours).sort((a, b) => a - b)) {
    const f = mapFalha[hr] ?? 0n;
    const s = mapSucesso[hr] ?? 0n;
    console.log(`  ${String(hr).padStart(2)}h        | ${String(f).padStart(6)} | ${String(s).padStart(8)}`);
  }

  // Dia da semana — falhas
  const diaSemana = await prisma.$queryRaw<Array<{ dow: number; count: bigint }>>`
    SELECT EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
           COUNT(*)::bigint AS count
    FROM "WaMessage"
    WHERE "templateName" = ${TEMPLATE}
      AND direction = 'OUTBOUND'
      AND status = 'WA_FAILED'
      AND "createdAt" >= ${d14}
    GROUP BY dow ORDER BY dow
  `;
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  console.log('\n  Dia da semana (falhas):');
  for (const d of diaSemana) {
    console.log(`    ${dias[d.dow] ?? d.dow}: ${d.count} falhas`);
  }
}

// ─── SEÇÃO 4 — Análise do template ───────────────────────────────────────────
async function secao4() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 4 — Análise do template');
  console.log('══════════════════════════════════════════════════════════');

  const tmpl = await prisma.cloudWaTemplate.findFirst({
    where: { name: TEMPLATE },
  });

  if (!tmpl) {
    console.log(`Template "${TEMPLATE}" NÃO encontrado no banco.`);
    return;
  }

  console.log(`\n  name            : ${tmpl.name}`);
  console.log(`  language        : ${tmpl.language}`);
  console.log(`  status          : ${tmpl.status}`);
  console.log(`  category        : ${tmpl.category}`);
  console.log(`  healthFlag      : ${tmpl.healthFlag ?? '-'}`);
  console.log(`  failRate7d      : ${(tmpl.failRate7d * 100).toFixed(1)}%`);
  console.log(`  sentCount7d     : ${tmpl.sentCount7d}`);
  console.log(`  qualityScore    : ${tmpl.qualityScore ?? '-'}`);
  console.log(`  rejectedReason  : ${tmpl.rejectedReason ?? '-'}`);
  console.log(`  metaTemplateId  : ${tmpl.metaTemplateId ?? '-'}`);
  console.log(`  editsRemaining  : ${tmpl.editsRemaining}`);
  console.log(`  lastEditedAt    : ${fmtDate(tmpl.lastEditedAt)}`);
  console.log(`  headerType      : ${tmpl.headerType ?? 'null'}`);
  console.log(`  headerContent   : ${(tmpl.headerContent ?? 'null').slice(0, 120)}`);
  console.log(`\n  BODY:\n${tmpl.body}`);
  console.log(`\n  footer          : ${tmpl.footer ?? 'null'}`);
  console.log(`  buttons         : ${JSON.stringify(tmpl.buttons, null, 2)}`);
  console.log(`  bodyExamples    : ${JSON.stringify(tmpl.bodyExamples, null, 2)}`);
  console.log(`  variableMapping : ${JSON.stringify(tmpl.variableMapping, null, 2)}`);

  // 3 exemplos de envios BEM-SUCEDIDOS
  const sucessos = await prisma.waMessage.findMany({
    where: {
      templateName: TEMPLATE,
      direction: 'OUTBOUND',
      status: { in: ['WA_DELIVERED', 'WA_READ'] },
      createdAt: { gte: d14 },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      createdAt: true,
      status: true,
      templateParams: true,
      conversation: {
        select: { phone: true, contact: { select: { name: true } } },
      },
    },
  });

  console.log('\n  --- 3 exemplos ENTREGUES/LIDOS ---');
  for (const s of sucessos) {
    const nome = s.conversation?.contact?.name ?? s.conversation?.phone ?? '?';
    console.log(`  ${fmtDate(s.createdAt)} | ${s.status} | ${nome}`);
    console.log(`    templateParams: ${JSON.stringify(s.templateParams)}`);
  }
  if (sucessos.length === 0) console.log('  (nenhum encontrado nos últimos 14 dias)');

  // 3 exemplos de envios FALHOS
  const falhos = await prisma.waMessage.findMany({
    where: {
      templateName: TEMPLATE,
      direction: 'OUTBOUND',
      status: 'WA_FAILED',
      createdAt: { gte: d14 },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      createdAt: true,
      status: true,
      errorCode: true,
      errorMessage: true,
      templateParams: true,
      conversation: {
        select: { phone: true, contact: { select: { name: true } } },
      },
    },
  });

  console.log('\n  --- 3 exemplos FALHOS ---');
  for (const f of falhos) {
    const nome = f.conversation?.contact?.name ?? f.conversation?.phone ?? '?';
    console.log(`  ${fmtDate(f.createdAt)} | ${f.status} | ERR:${f.errorCode} | ${nome}`);
    console.log(`    errorMessage: ${(f.errorMessage ?? '-').slice(0, 120)}`);
    console.log(`    templateParams: ${JSON.stringify(f.templateParams)}`);
  }
  if (falhos.length === 0) console.log('  (nenhum encontrado nos últimos 14 dias)');
}

// ─── SEÇÃO 5 — Comparativo versões anteriores ────────────────────────────────
async function secao5() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 5 — Comparativo versões do template (14 dias)');
  console.log('══════════════════════════════════════════════════════════');

  const versoes = ['cadencia_d1_abertura', 'cadencia_d1_abertura_v2', TEMPLATE];

  for (const v of versoes) {
    const total = await prisma.waMessage.count({
      where: { templateName: v, direction: 'OUTBOUND', createdAt: { gte: d14 } },
    });
    const falhas = await prisma.waMessage.count({
      where: { templateName: v, direction: 'OUTBOUND', status: 'WA_FAILED', createdAt: { gte: d14 } },
    });
    const entregues = await prisma.waMessage.count({
      where: { templateName: v, direction: 'OUTBOUND', status: { in: ['WA_DELIVERED', 'WA_READ'] }, createdAt: { gte: d14 } },
    });
    const failRate = total > 0 ? ((falhas / total) * 100).toFixed(1) : 'N/A';

    // health do banco
    const tmpl = await prisma.cloudWaTemplate.findFirst({ where: { name: v } });
    const dbHealth = tmpl
      ? `status=${tmpl.status} health=${tmpl.healthFlag ?? '-'} failRate7d=${(tmpl.failRate7d * 100).toFixed(0)}% sent7d=${tmpl.sentCount7d}`
      : '(não cadastrado no banco)';

    console.log(`\n  ${v}:`);
    console.log(`    Total sends 14d : ${total}`);
    console.log(`    Falhas 14d      : ${falhas}`);
    console.log(`    Entregues/Lidos : ${entregues}`);
    console.log(`    FailRate 14d    : ${failRate}%`);
    console.log(`    DB health       : ${dbHealth}`);
  }
}

// ─── SEÇÃO 6 — Análise dos contatos que falharam ─────────────────────────────
async function secao6() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 6 — Análise dos contatos que falharam (14 dias)');
  console.log('══════════════════════════════════════════════════════════');

  // Busca conversas de falhas
  const falhas = await prisma.waMessage.findMany({
    where: {
      templateName: TEMPLATE,
      direction: 'OUTBOUND',
      status: 'WA_FAILED',
      createdAt: { gte: d14 },
    },
    select: {
      conversationId: true,
      conversation: {
        select: {
          phone: true,
          optedOut: true,
          needsHumanAttention: true,
          contactId: true,
          contact: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              phoneInvalid: true,
              deals: {
                select: {
                  source: { select: { name: true } },
                  stage: { select: { name: true } },
                  status: true,
                  createdAt: true,
                },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
              leadTrackings: {
                select: {
                  utmSource: true,
                  utmMedium: true,
                  utmCampaign: true,
                },
                take: 1,
                orderBy: { createdAt: 'desc' },
              },
            },
          },
        },
      },
    },
  });

  // Deduplicar por conversationId
  const unique = new Map<string, (typeof falhas)[number]>();
  for (const f of falhas) {
    if (!unique.has(f.conversationId)) unique.set(f.conversationId, f);
  }
  const uniqFalhas = Array.from(unique.values());

  console.log(`\n  Contatos únicos que tiveram falha: ${uniqFalhas.length}`);

  // Agregações
  let optedOutCount = 0;
  let needsHumanCount = 0;
  let phoneInvalidCount = 0;
  let semContactCount = 0;
  const sourceMap = new Map<string, number>();
  const utmSourceMap = new Map<string, number>();
  const idadesBuckets = { lt7d: 0, d7_30: 0, d30_90: 0, gt90d: 0 };

  for (const f of uniqFalhas) {
    const conv = f.conversation;
    if (!conv) continue;
    if (conv.optedOut) optedOutCount++;
    if (conv.needsHumanAttention) needsHumanCount++;

    const contact = conv.contact;
    if (!contact) { semContactCount++; continue; }
    if (contact.phoneInvalid) phoneInvalidCount++;

    const deal = contact.deals?.[0];
    const srcName = deal?.source?.name ?? 'sem-fonte';
    sourceMap.set(srcName, (sourceMap.get(srcName) ?? 0) + 1);

    const lt = contact.leadTrackings?.[0];
    const utmSrc = lt?.utmSource ?? 'sem-utm';
    utmSourceMap.set(utmSrc, (utmSourceMap.get(utmSrc) ?? 0) + 1);

    const idadeDias = Math.round((now.getTime() - new Date(contact.createdAt).getTime()) / 86400000);
    if (idadeDias < 7)        idadesBuckets.lt7d++;
    else if (idadeDias < 30)  idadesBuckets.d7_30++;
    else if (idadeDias < 90)  idadesBuckets.d30_90++;
    else                       idadesBuckets.gt90d++;
  }

  console.log(`\n  optedOut=true      : ${optedOutCount}`);
  console.log(`  needsHuman=true    : ${needsHumanCount}`);
  console.log(`  phoneInvalid=true  : ${phoneInvalidCount}`);
  console.log(`  sem Contact vinc.  : ${semContactCount}`);

  console.log('\n  Fonte dos deals (contatos falhados):');
  for (const [src, cnt] of [...sourceMap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${src.padEnd(30)} : ${cnt}`);
  }

  console.log('\n  UTM Source (contatos falhados):');
  for (const [utm, cnt] of [...utmSourceMap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${utm.padEnd(30)} : ${cnt}`);
  }

  console.log('\n  Idade do contato no momento da falha:');
  console.log(`    < 7 dias          : ${idadesBuckets.lt7d}`);
  console.log(`    7-30 dias         : ${idadesBuckets.d7_30}`);
  console.log(`    30-90 dias        : ${idadesBuckets.d30_90}`);
  console.log(`    > 90 dias         : ${idadesBuckets.gt90d}`);

  // Listar todos com detalhes individuais
  console.log('\n  Lista individual:');
  for (const f of uniqFalhas) {
    const conv = f.conversation;
    const contact = conv?.contact;
    const nome  = contact?.name ?? conv?.pushName ?? '?';
    const phone = conv?.phone ?? '?';
    const idadeDias = contact?.createdAt
      ? Math.round((now.getTime() - new Date(contact.createdAt).getTime()) / 86400000)
      : '?';
    const deal = contact?.deals?.[0];
    const lt   = contact?.leadTrackings?.[0];
    console.log(`    ${nome.padEnd(28)} | phone=${phone} | idade=${idadeDias}d | optedOut=${conv?.optedOut} | needsHuman=${conv?.needsHumanAttention}`);
    console.log(`      fonte="${deal?.source?.name ?? '-'}" etapa="${deal?.stage?.name ?? '-'}" utm_src="${lt?.utmSource ?? '-'}"`);
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function mapErrorCode(code: string): string {
  const m: Record<string, string> = {
    '131049': 'Throttle por reputação — Meta filtra envio a contatos frios',
    '130472': 'A/B test da Meta — sem controle nosso',
    '131026': 'Número inválido ou sem WhatsApp',
    '131047': 'Janela 24h expirou (não aplicável a templates — inesperado)',
    '131051': 'Tipo de mensagem não suportado',
    '131056': 'Limite par-a-par excedido',
    '130429': 'Rate limit excedido',
    '131000': 'Erro genérico',
    '131008': 'Parâmetro ausente',
    '131009': 'Parâmetro inválido',
    '132000': 'Contagem de params inválida',
    '132001': 'Template inexistente',
    '132005': 'Tradução inválida',
    '132007': 'Conteúdo violou política',
    '132012': 'Erro de mapeamento de params',
    '132015': 'Template pausado',
    '132016': 'Template rejeitado',
  };
  return m[code] ?? 'Código não mapeado';
}

// ─── SEÇÃO 7 — Conclusão ─────────────────────────────────────────────────────
async function secao7() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SEÇÃO 7 — Conclusão analítica');
  console.log('══════════════════════════════════════════════════════════\n');

  // Resumo rápido de dados para embasar a análise
  const totalEnvios14d = await prisma.waMessage.count({
    where: { templateName: TEMPLATE, direction: 'OUTBOUND', createdAt: { gte: d14 } },
  });
  const totalFalhas14d = await prisma.waMessage.count({
    where: { templateName: TEMPLATE, direction: 'OUTBOUND', status: 'WA_FAILED', createdAt: { gte: d14 } },
  });
  const totalEntregues14d = await prisma.waMessage.count({
    where: { templateName: TEMPLATE, direction: 'OUTBOUND', status: { in: ['WA_DELIVERED', 'WA_READ'] }, createdAt: { gte: d14 } },
  });

  const failRate14d = totalEnvios14d > 0 ? ((totalFalhas14d / totalEnvios14d) * 100).toFixed(1) : 'N/A';

  console.log(`  Resumo quantitativo (14 dias):`);
  console.log(`    Envios  : ${totalEnvios14d}`);
  console.log(`    Falhas  : ${totalFalhas14d}  (${failRate14d}%)`);
  console.log(`    Entregues/Lidos: ${totalEntregues14d}`);

  const tmpl = await prisma.cloudWaTemplate.findFirst({ where: { name: TEMPLATE } });
  console.log(`    healthFlag 7d   : ${tmpl?.healthFlag ?? '-'}`);
  console.log(`    failRate7d (DB) : ${((tmpl?.failRate7d ?? 0) * 100).toFixed(1)}%`);
  console.log(`    sentCount7d (DB): ${tmpl?.sentCount7d ?? 0}`);

  const errDist = await prisma.$queryRaw<Array<{ errorCode: string | null; count: bigint }>>`
    SELECT "errorCode", COUNT(*)::bigint AS count
    FROM "WaMessage"
    WHERE "templateName" = ${TEMPLATE}
      AND direction = 'OUTBOUND'
      AND "errorCode" IS NOT NULL
      AND "createdAt" >= ${d14}
    GROUP BY "errorCode"
    ORDER BY count DESC
    LIMIT 5
  `;

  console.log('\n  Top errorCodes:');
  for (const e of errDist) {
    console.log(`    ${e.errorCode}: ${e.count} — ${mapErrorCode(String(e.errorCode ?? ''))}`);
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('ANÁLISE QUALITATIVA\n');

  console.log(`  CAUSA RAIZ MAIS PROVÁVEL:`);
  console.log(`
  O template cadencia_d1_abertura_v3 é o ponto de entrada do funil WABA: enviado
  no primeiro dia após a entrada do lead (D+1). Essa posição implica que os
  destinatários são contatos relativamente frios — acabaram de entrar pela LP,
  nunca trocaram mensagem com o número da empresa antes. A Meta penaliza envios
  a contatos sem histórico de interação prévia por meio do código 131049
  ("throttle por reputação"), que é o principal candidato a errorCode dominante
  neste template. Quando a proporção de contatos sem sessão ativa (janela 24h
  aberta) é alta, a taxa de falha sobe estruturalmente — independente do conteúdo
  da mensagem.

  TIMING E VOLUME:`);
  console.log(`
  Se os envios se concentrarem em horários de pico (antes das 9h ou após as 18h),
  a Meta tende a filtrar mais agressivamente. Envios em rajada (vários templates
  para phones diferentes em poucos minutos) também aumentam o risco de throttle
  mesmo dentro do TIER_2. A automação de cadência dispara o D1 exatamente quando
  o enrollment avança, sem rate-limiting entre destinatários distintos — o que
  pode criar picos de envio na mesma janela de tempo.

  PERFIL DOS CONTATOS:`);
  console.log(`
  Leads novos vindos de tráfego pago (UTM source = facebook/instagram) tendem a
  ter telefones de menor qualidade — digitados no formulário sem validação, ou
  números usados apenas para redes sociais sem WhatsApp. phoneInvalid=true ou
  o errorCode 131026 sinalizariam esse padrão. Além disso, contatos criados há
  menos de 24 horas possuem reputação "zero" na Meta, elevando naturalmente a
  taxa de não-entrega do primeiro template.

  CONTEÚDO E CATEGORIA:`);
  console.log(`
  Templates MARKETING são sujeitos a limites de entrega mais restritos do que
  UTILITY. Se cadencia_d1_abertura_v3 estiver categorizado como MARKETING, cada
  envio consome quota de marketing do par remetente-destinatário, e a Meta pode
  bloquear silenciosamente (131049) sem notificar o usuário final. O suffix _v3
  sugere que houve edições iterativas — cada edição aprova um novo template mas
  não "herda" a reputação do v2. O v3 começa do zero em termos de score de
  qualidade.

  RECOMENDAÇÕES PRIORIZADAS:`);
  console.log(`
  1. [ALTA PRIORIDADE — IMEDIATO] Adicionar validação de phone ANTES do enroll
     na cadência: checar se existe WaConversation com lastClientMessageAt nos
     últimos 30 dias (contato "quente"). Se não houver histórico, colocar o
     template em modo de cooldown de 24h ou enviar apenas dentro da janela
     de horário comercial (09h–18h BRT) com rate-limit de no máximo 1
     template/segundo para o worker da automação.

  2. [ALTA PRIORIDADE — TEMPLATE] Revisar a categoria do template: se for
     MARKETING, avaliar se é possível resubmeter como UTILITY (ex.: "notificação
     de contato inicial confirmando recebimento da solicitação"). Templates UTILITY
     têm taxas de entrega estruturalmente maiores para contatos frios. Também
     validar se bodyExamples e variableMapping cobrem todos os {{N}} usados no
     body — params ausentes causam 131008/132012.

  3. [MÉDIO PRAZO — MONITORAMENTO] Implementar alerta automático quando failRate7d
     > 25% para qualquer template de cadência. O healthCheck já calcula o campo,
     mas não bloqueia a automação. Adicionar lógica no worker da automação para
     pausar o enrollment automaticamente se o step de template retornar errorCode
     131049 mais de 2 vezes para o mesmo contato — evitando desgaste de reputação
     adicional.
  `);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  INVESTIGAÇÃO: cadencia_d1_abertura_v3 — failRate alto  ║');
  console.log(`║  Data: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} BRT                          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  await secao1();
  await secao2();
  await secao3();
  await secao4();
  await secao5();
  await secao6();
  await secao7();

  console.log('\n═══ FIM DA INVESTIGAÇÃO ═══\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  prisma.$disconnect();
  process.exit(1);
});
