/**
 * Detecção e processamento de opt-out via WhatsApp.
 * Palavras-chave reconhecidas: SAIR, PARAR, STOP, CANCELAR, NÃO QUERO, etc.
 */

import prisma from '../lib/prisma';
import { ZApiClient } from '../services/zapiClient';

const OPT_OUT_KEYWORDS = [
  'SAIR',
  'PARAR',
  'STOP',
  'CANCELAR',
  'NAO QUERO',
  'NÃO QUERO',
  'DESCADASTRAR',
  'REMOVER',
  'DESCADASTRO',
  'CANCELAMENTO',
];

/** Normaliza texto removendo acentos, maiúsculas e espaços extras */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/** Retorna true se a mensagem é um pedido de opt-out */
export function isOptOutMessage(text: string): boolean {
  const normalized = normalize(text);
  return OPT_OUT_KEYWORDS.some(kw => normalized === kw || normalized.startsWith(kw + ' '));
}

/**
 * Processa o opt-out de um contato:
 * 1. Marca a conversa como opted-out no banco
 * 2. Cancela follow-ups pendentes
 * 3. Envia mensagem de confirmação
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

    // 2. Marcar contato como opted-out (se existir vínculo)
    if (conversation) {
      const conv = await prisma.whatsAppConversation.findUnique({
        where: { id: conversation.id },
        select: { contactId: true },
      });
      // Nota: campo whatsappOptedOut no Contact pode ser adicionado futuramente
      // Por ora, o opt-out é controlado pela conversa (WhatsAppConversation.optedOut)
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
