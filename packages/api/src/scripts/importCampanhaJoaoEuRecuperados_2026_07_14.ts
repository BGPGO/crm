/**
 * Campanha João — importa respostas "EU" recuperadas — 2026-07-14
 *
 * Durante o sequestro do webhook (09→13/07, incidente do app compartilhado),
 * as respostas da Onda 2 foram entregues ao bi-whatsapp em vez do CRM.
 * Estas 8 mensagens (7 contatos) foram recuperadas dos logs do bi-whatsapp.
 *
 * Cria WaConversation (se não existir) + WaMessage INBOUND, marca
 * needsHumanAttention pro comercial ver no Inbox. NÃO abre janela de 24h
 * (a janela real já expirou — resposta só via template), NÃO dispara bot
 * nem stage orchestrator. Idempotente: pula quem já tem a msg importada.
 *
 * Rodar com:
 *   npx tsx src/scripts/importCampanhaJoaoEuRecuperados_2026_07_14.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import prisma from '../lib/prisma';

// Recuperadas dos logs do bi-whatsapp (ordem de chegada preservada onde conhecida).
// Horário real de chegada desconhecido — janela: 10/07 ~19h → 13/07 ~11h BRT.
const RECOVERED: Array<{ phone: string; body: string }> = [
  { phone: '5511959119583', body: 'EU' },
  { phone: '559984916734', body: 'QUERO GARANTIR' },
  { phone: '559984916734', body: 'EU' },
  { phone: '553194351266', body: 'EU' },
  { phone: '5522988517307', body: 'EU' },
  { phone: '558788163666', body: 'Eu' },
  { phone: '557199340203', body: 'EU' },
  { phone: '557398592321', body: 'EU' },
];

const METADATA = {
  recovered: true,
  source: 'logs bi-whatsapp — incidente webhook WABA sequestrado (09-13/07)',
  campaign: 'Campanha João — Onda 2',
  realArrivalWindow: '2026-07-10T19:00-03:00 → 2026-07-13T11:00-03:00',
};

function phoneVariationsOf(from: string): string[] {
  const variations = [from];
  if (from.startsWith('55') && from.length === 12) {
    const ddd = from.substring(2, 4);
    const number = from.substring(4);
    variations.push(`55${ddd}9${number}`);
  }
  if (from.startsWith('55') && from.length === 13) {
    const ddd = from.substring(2, 4);
    const number = from.substring(5);
    variations.push(`55${ddd}${number}`);
  }
  return variations;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Campanha João — importação dos "EU" recuperados | 2026-07-14');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let created = 0;
  let skipped = 0;

  for (const { phone, body } of RECOVERED) {
    const variations = phoneVariationsOf(phone);

    let conversation = await prisma.waConversation.findFirst({
      where: { phone: { in: variations } },
    });

    if (!conversation) {
      const contact = await prisma.contact.findFirst({
        where: { phone: { in: variations } },
        select: { id: true, name: true },
      });
      conversation = await prisma.waConversation.create({
        data: {
          phone,
          status: 'WA_OPEN',
          contactId: contact?.id || null,
        },
      });
      console.log(`· ${phone}: conversa criada${contact ? ` (contato: ${contact.name})` : ' (sem contato vinculado)'}`);
    }

    // Idempotência: mesma msg recuperada já importada nesta conversa?
    const existing = await prisma.waMessage.findFirst({
      where: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        body,
        metadata: { path: ['recovered'], equals: true },
      },
    });
    if (existing) {
      console.log(`· ${phone}: "${body}" já importada — pulando`);
      skipped++;
      continue;
    }

    const now = new Date();
    await prisma.waMessage.create({
      data: {
        direction: 'INBOUND',
        senderType: 'WA_CLIENT',
        type: 'TEXT',
        body,
        status: 'WA_DELIVERED',
        deliveredAt: now,
        metadata: METADATA as any,
        conversationId: conversation.id,
      },
    });

    await prisma.waConversation.update({
      where: { id: conversation.id },
      data: {
        needsHumanAttention: true,
        isActive: true,
        lastMessageAt: now,
        lastClientMessageAt: now,
        // windowExpiresAt NÃO é aberto de propósito: a janela real expirou,
        // resposta livre falharia na Meta — comercial responde via template.
      },
    });

    console.log(`✓ ${phone}: "${body}" importada (needsHumanAttention)`);
    created++;
  }

  console.log(`\nImportadas: ${created} · Puladas (já existiam): ${skipped}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\nFALHA NO SCRIPT:', err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
