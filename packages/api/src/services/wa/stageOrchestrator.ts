/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Stage Orchestrator — Orquestração automática de etapas via WhatsApp
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quando um lead responde no WhatsApp:
 *   - Se está em "Lead" ou "Contato feito" → move para "Marcar reunião"
 *   - Cancela cadência anterior (via onStageChanged)
 *   - Enrola na cadência "Marcar reunião" (que começa com WAIT 1d)
 *   - Bia tenta agendar; se lead não agenda em 24h, cadência ativa
 *
 * Lógica replicada do whatsappBot.ts (Z-API) para o módulo WABA.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import prisma from '../../lib/prisma';
import { onStageChanged } from '../automationTriggerListener';

// Stage names that trigger auto-move to "Marcar reunião"
const MOVABLE_STAGE_NAMES = ['lead', 'contato feito'];

export class StageOrchestrator {
  /**
   * Chamado quando um lead envia mensagem inbound.
   * Se o deal está em "Lead" ou "Contato Feito", move para "Marcar Reunião".
   */
  static async handleLeadResponse(conversationId: string): Promise<void> {
    try {
      const conversation = await prisma.waConversation.findUnique({
        where: { id: conversationId },
        select: { contactId: true, phone: true },
      });

      if (!conversation?.contactId) return;

      // Busca deal aberto com stage incluído
      const deal = await prisma.deal.findFirst({
        where: {
          contactId: conversation.contactId,
          status: 'OPEN',
        },
        include: {
          stage: { select: { id: true, name: true } },
          pipeline: { include: { stages: { orderBy: { order: 'asc' } } } },
        },
      });

      if (!deal) return;

      // Verifica se está em etapa movável
      const currentStageName = deal.stage.name.toLowerCase();
      if (!MOVABLE_STAGE_NAMES.some(s => currentStageName.includes(s))) return;

      // Busca "Marcar reunião" no mesmo pipeline
      const marcarReuniao = deal.pipeline.stages.find(
        s => s.name.toLowerCase().includes('marcar reuni')
      );

      if (!marcarReuniao || deal.stageId === marcarReuniao.id) return;

      // Move para "Marcar reunião"
      await prisma.deal.update({
        where: { id: deal.id },
        data: { stageId: marcarReuniao.id, updatedAt: new Date() },
      });

      // Log de atividade
      await prisma.activity.create({
        data: {
          type: 'STAGE_CHANGE',
          content: `Etapa alterada automaticamente de "${deal.stage.name}" para "${marcarReuniao.name}" — lead respondeu no WhatsApp.`,
          userId: deal.userId,
          dealId: deal.id,
          contactId: conversation.contactId,
        },
      });

      // Dispara automação (cancela cadência antiga + enrola na nova)
      onStageChanged(conversation.contactId, marcarReuniao.id, deal.id);

      console.log(`[StageOrchestrator] ${conversation.phone}: ${deal.stage.name} → ${marcarReuniao.name} (deal ${deal.id})`);
    } catch (err) {
      console.error('[StageOrchestrator] Erro ao processar resposta do lead:', err);
    }
  }
}
