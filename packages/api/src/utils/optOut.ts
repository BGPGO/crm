/**
 * Detecção e processamento de opt-out via WhatsApp.
 *
 * Estratégia em 2 camadas (depois do incidente 2026-05-12):
 *
 * 1. HARD_SIGNALS — frases compostas que indicam opt-out claro independente
 *    da posição no texto. Match por substring (`.includes`). Ex: "não tenho
 *    interesse", "desconsidere", "me tira da lista".
 *
 * 2. START_KEYWORDS — palavras curtas que precisam estar no INÍCIO da frase
 *    (ou serem a frase inteira). Match por `startsWith(kw + ' ')` ou igualdade.
 *    Ex: "SAIR", "CANCELAR", "PARAR". Sem essa restrição "CANCELAR" disparava
 *    com "cancelar a reunião" (operacional, não opt-out).
 *
 * EXCLUSIONS — regex de frases que parecem opt-out mas são operacionais
 *    (cancelar reunião, reagendar etc). Bloqueiam apenas as START_KEYWORDS,
 *    NÃO bloqueiam HARD_SIGNALS (pessoa pode pedir reagendamento E opt-out).
 *
 * Esta arquitetura foi calibrada com base em 7 falsos negativos reais:
 * Paulo, Thiago, Cristhyan, Carlos Alberto, Odilson, Marcontech, Cosme.
 */

import prisma from '../lib/prisma';
import { ZApiClient } from '../services/zapiClient';

// ─── HARD_SIGNALS — substring match em qualquer posição ──────────────────────
const HARD_SIGNALS = [
  // "Não tenho interesse" + variações
  'NAO TENHO INTERESSE',
  'NÃO TENHO INTERESSE',
  'NAO TENHO MAIS INTERESSE',
  'NÃO TENHO MAIS INTERESSE',
  'SEM INTERESSE',

  // "Não quero mais"
  'NAO QUERO MAIS',
  'NÃO QUERO MAIS',
  'NAO QUERO RECEBER',
  'NÃO QUERO RECEBER',

  // Pedidos de remoção da lista
  'TIRA MEU NUMERO',
  'TIRE MEU NUMERO',
  'TIRA DA LISTA',
  'TIRE DA LISTA',
  'REMOVA MEU',
  'REMOVER MEU',
  'ME REMOVA',
  'ME REMOVE',
  'ME TIRA DA',
  'ME TIRE DA',

  // "Pare/Para de me mandar"
  'PARE DE ME',
  'PARA DE ME',
  'NAO ME MANDE',
  'NÃO ME MANDE',
  'NAO MANDE MAIS',
  'NÃO MANDE MAIS',

  // LGPD — esquecimento/exclusão de dados
  'DESCONSIDERE',
  'DELETE MEUS',
  'DELETA MEUS',
  'EXCLUA MEUS',
  'APAGUE MEUS',

  // "Pedi pra cancelar" sem reunião — sinal claro de cancelamento global
  'PEDI PRA CANCELAR',
  'PEDI PARA CANCELAR',
  'JA PEDI PRA CANCELAR',
  'JÁ PEDI PRA CANCELAR',
];

// ─── START_KEYWORDS — match no início (evita false positive em substring) ────
const START_KEYWORDS = [
  'SAIR',
  'PARAR',
  'PARE',
  'STOP',
  'CANCELAR',
  'NAO QUERO',
  'NÃO QUERO',
  'DESCADASTRAR',
  'DESCADASTRO',
  'REMOVER',
  'CANCELAMENTO',
];

// ─── EXCLUSIONS — operacionais que NÃO devem disparar opt-out ────────────────
// Aplicam-se apenas a START_KEYWORDS (HARD_SIGNALS ignoram exclusões).
const EXCLUSIONS = [
  /cancel(?:ar|ado|ada)?\s+(?:a\s+|o\s+|aquela\s+|essa\s+)?reuni[ãa]o/i,
  /cancel(?:ar|ado|ada)?\s+(?:o\s+)?agendamento/i,
  /cancel(?:ar|ado|ada)?\s+(?:a\s+)?proposta/i,
  /reagendar/i,
  /remarcar/i,
  /remarc(?:ado|ada)/i,
];

/** Normaliza texto removendo acentos, maiúsculas e espaços extras */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

/** Retorna true se a mensagem é um pedido de opt-out */
export function isOptOutMessage(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const normalized = normalize(text);

  // 1) HARD_SIGNALS — match em qualquer posição, ignoram exclusões
  for (const sig of HARD_SIGNALS) {
    if (normalized.includes(sig)) return true;
  }

  // 2) START_KEYWORDS — match no início, mas ignoram se houver exclusão operacional
  const hasStartKw = START_KEYWORDS.some(
    (kw) => normalized === kw || normalized.startsWith(kw + ' ')
  );
  if (hasStartKw) {
    const isExcluded = EXCLUSIONS.some((re) => re.test(text));
    if (!isExcluded) return true;
  }

  return false;
}

/**
 * Detalha o resultado de detecção. Útil pra logging/observabilidade
 * e pra construir uma fila de revisão humana no futuro.
 */
export function detectOptOutSignal(text: string): {
  isOptOut: boolean;
  matchedSignal: string | null;
  matchType: 'hard' | 'start' | 'excluded' | 'none';
} {
  if (!text || typeof text !== 'string') {
    return { isOptOut: false, matchedSignal: null, matchType: 'none' };
  }
  const normalized = normalize(text);

  for (const sig of HARD_SIGNALS) {
    if (normalized.includes(sig)) {
      return { isOptOut: true, matchedSignal: sig, matchType: 'hard' };
    }
  }

  const startMatch = START_KEYWORDS.find(
    (kw) => normalized === kw || normalized.startsWith(kw + ' ')
  );
  if (startMatch) {
    const isExcluded = EXCLUSIONS.some((re) => re.test(text));
    if (isExcluded) {
      return { isOptOut: false, matchedSignal: startMatch, matchType: 'excluded' };
    }
    return { isOptOut: true, matchedSignal: startMatch, matchType: 'start' };
  }

  return { isOptOut: false, matchedSignal: null, matchType: 'none' };
}

/**
 * Processa o opt-out de um contato (Z-API legacy):
 * 1. Marca a conversa como opted-out no banco
 * 2. Cancela follow-ups pendentes
 * 3. Envia mensagem de confirmação
 *
 * IMPORTANTE: esta função opera APENAS no modelo Z-API (WhatsAppConversation).
 * Para Cloud API (WaConversation), a marcação é feita inline em
 * `services/wa/messageRouter.ts` que também chama `isOptOutMessage`.
 */
export async function processOptOut(phone: string, originalText: string): Promise<void> {
  console.log(`[opt-out] Processando opt-out de ${phone} — texto: "${originalText}"`);

  try {
    // 1. Marcar conversa como opted-out e pausar follow-ups
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (conversation) {
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          optedOut: true,
          optedOutAt: new Date(),
          status: 'closed',
        },
      });

      // Cancelar follow-ups pendentes
      await prisma.scheduledFollowUp.updateMany({
        where: { conversationId: conversation.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      }).catch(() => {});

      // Pausar estado de follow-up
      await prisma.whatsAppFollowUpState.updateMany({
        where: { conversationId: conversation.id },
        data: { paused: true },
      }).catch(() => {});

      // Cancelar também o setTimeout in-memory do scheduler
      const { cancelFollowUp } = await import('../services/followUpScheduler');
      await cancelFollowUp(conversation.id).catch(() => {});

      // Cancelar cadências de automação ativas
      const convWithContact = await prisma.whatsAppConversation.findUnique({
        where: { id: conversation.id },
        select: { contactId: true },
      });
      if (convWithContact?.contactId) {
        const { interruptCadenceOnResponse } = await import('../services/cadenceInterruptService');
        await interruptCadenceOnResponse(convWithContact.contactId).catch(() => {});
      }
    }

    // 3. Remover de campanhas pendentes
    await prisma.whatsAppCampaignContact.updateMany({
      where: { phone, status: 'PENDING' },
      data: { status: 'SKIPPED' },
    }).catch(() => {});

    // 4. Enviar confirmação
    const client = await ZApiClient.fromConfig();
    await client.sendText(
      phone,
      'Você foi removido da nossa lista e não receberá mais mensagens automáticas. Se precisar de algo, é só nos chamar! 😊'
    );

    console.log(`[opt-out] Concluído para ${phone}`);
  } catch (err) {
    console.error(`[opt-out] Erro ao processar opt-out de ${phone}:`, err);
  }
}
