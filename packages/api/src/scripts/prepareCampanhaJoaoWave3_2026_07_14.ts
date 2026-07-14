/**
 * Campanha João — Onda 3 (rascunho) — 2026-07-14
 *
 * 1) Sincroniza o status do template `campanha_joao_ia_diagnostico` com a Meta
 *    e EXIGE que esteja APPROVED (aborta se não estiver).
 * 2) Resolve o segmento "Campanha João", EXCLUI todo telefone que já entrou
 *    em qualquer onda anterior da campanha, sorteia 200 contatos com telefone
 *    válido e cria um broadcast em WA_DRAFT (NÃO dispara).
 *
 * Disparo é passo separado (startBroadcast.ts) e só com OK explícito.
 * SOMENTE LEITURA + 1 sync de status + 1 create de broadcast draft.
 *
 * Rodar com:
 *   npx tsx src/scripts/prepareCampanhaJoaoWave3_2026_07_14.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';
import { normalizePhone } from '../utils/phoneNormalize';

const TEMPLATE_NAME = 'campanha_joao_ia_diagnostico';
const SEGMENT_NAME = 'Campanha João';
const CAMPAIGN_PREFIX = 'Campanha João — Onda';
const WAVE_NAME = 'Campanha João — Onda 3';
const WAVE_SIZE = 200;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Campanha João — Onda 3 (rascunho)  |  2026-07-14');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. Template: sync + exigir APPROVED ───────────────────────────────────
  const tpl = await prisma.cloudWaTemplate.findFirst({ where: { name: TEMPLATE_NAME, language: 'pt_BR' } });
  if (!tpl) throw new Error(`Template ${TEMPLATE_NAME} não encontrado no banco`);

  let status = tpl.status as string;
  if (tpl.metaTemplateId) {
    try {
      const client = await WhatsAppCloudClient.fromDB();
      const meta = await client.getTemplate(tpl.metaTemplateId);
      status = meta.status as string;
      await prisma.cloudWaTemplate.update({
        where: { id: tpl.id },
        data: { status: status as any, category: ((meta as any).category as any) || tpl.category },
      });
    } catch (e: any) {
      console.log(`· Não consegui sincronizar com a Meta agora (${e.message}); uso status do banco: ${status}`);
    }
  }
  console.log(`Template ${TEMPLATE_NAME}: status = ${status}`);
  if (status !== 'APPROVED') {
    console.log(`\n⛔ Template ainda não está APPROVED (${status}). Não crio a onda. Abortando sem erro.`);
    await prisma.$disconnect();
    return;
  }
  console.log('✓ Template APPROVED — liberado pra montar a onda.\n');

  // ── 2. Telefones já usados nas ondas anteriores ───────────────────────────
  const previous = await prisma.waBroadcastContact.findMany({
    where: { broadcast: { name: { startsWith: CAMPAIGN_PREFIX } } },
    select: { phone: true },
  });
  const alreadyUsed = new Set(previous.map((p) => p.phone));
  console.log(`Telefones já incluídos em ondas anteriores: ${alreadyUsed.size}`);

  // ── 3. Segmento → resolve contatos ────────────────────────────────────────
  const segment = await prisma.segment.findFirst({ where: { name: SEGMENT_NAME, brand: 'BGP' as any } });
  if (!segment) throw new Error(`Segmento "${SEGMENT_NAME}" não encontrado`);

  const { buildSegmentWhere } = await import('../services/segmentEngine');
  const where = buildSegmentWhere(segment.filters as any, segment.brand);

  const contacts = await prisma.contact.findMany({
    where: { AND: [where, { phone: { not: null } }, { phoneInvalid: { not: true } } as any] },
    select: { id: true, phone: true, name: true },
  });
  console.log(`Segmento resolveu ${contacts.length} contatos com telefone válido.`);

  // Normaliza + dedup por telefone + exclui ondas anteriores
  const byPhone = new Map<string, { id: string; phone: string }>();
  for (const c of contacts) {
    const p = normalizePhone(c.phone!);
    if (p && p.trim() !== '' && !alreadyUsed.has(p) && !byPhone.has(p)) byPhone.set(p, { id: c.id, phone: p });
  }
  const unique = [...byPhone.values()];
  console.log(`Após normalizar + dedup + excluir ondas anteriores: ${unique.length} números elegíveis.`);

  // Sorteio (mantém a amostra representativa)
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  const chosen = unique.slice(0, WAVE_SIZE);
  console.log(`Selecionados pra Onda 3: ${chosen.length}\n`);

  // ── 4. Guard de idempotência ──────────────────────────────────────────────
  const existing = await prisma.waBroadcast.findFirst({ where: { name: WAVE_NAME } });
  if (existing) {
    console.log(`⚠️  Broadcast "${WAVE_NAME}" já existe: id=${existing.id} status=${existing.status} contatos=${existing.totalContacts}`);
    console.log('   Não recrio. Se quiser refazer, apague o rascunho antes.');
    await prisma.$disconnect();
    return;
  }

  // ── 5. Cria broadcast em WA_DRAFT (NÃO dispara) ───────────────────────────
  const broadcast = await prisma.waBroadcast.create({
    data: {
      name: WAVE_NAME,
      status: 'WA_DRAFT' as any,
      brand: 'BGP' as any,
      templateId: tpl.id,
      segmentId: segment.id,
      totalContacts: chosen.length,
      contacts: { create: chosen.map((c) => ({ phone: c.phone, contactId: c.id })) },
    },
    include: { _count: { select: { contacts: true } } },
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✓ Onda 3 criada em RASCUNHO (WA_DRAFT) — NADA foi enviado.`);
  console.log(`  broadcastId:  ${broadcast.id}`);
  console.log(`  nome:         ${broadcast.name}`);
  console.log(`  template:     ${TEMPLATE_NAME} (APPROVED)`);
  console.log(`  contatos:     ${broadcast._count.contacts}`);
  console.log(`  status:       ${broadcast.status}`);
  console.log('');
  console.log('Pra disparar: npx tsx src/scripts/startBroadcast.ts ' + broadcast.id);
  console.log('O motor pula opt-outs / em-atendimento / cooldown 24h e espaça 5-10s entre envios.');
  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\nFALHA NO SCRIPT:', err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
