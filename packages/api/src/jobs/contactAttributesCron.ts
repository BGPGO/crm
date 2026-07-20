import cron from 'node-cron';
import prisma from '../lib/prisma';
import { enrichContactFromConversations } from '../services/contactAttributeExtractor';

/**
 * Enriquecimento semanal dos atributos de segmentação (gender/erpSystem/revenueRange)
 * para contatos que mandaram mensagem de WhatsApp na última semana.
 * Reuniões novas já são cobertas pelo gancho no meetingAnalyzer — aqui é só
 * o caminho "lead conversou mas não reuniu".
 */
export function startContactAttributesCron() {
  // Domingo 4h BRT (07:00 UTC) — antes da newsletter de segunda usar os segmentos
  cron.schedule('0 7 * * 0', async () => {
    console.log('[contact-attributes-cron] Iniciando enriquecimento semanal...');
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [waConvs, legacyConvs] = await Promise.all([
        prisma.waConversation.findMany({
          where: { contactId: { not: null }, lastClientMessageAt: { gte: oneWeekAgo } },
          select: { contactId: true },
        }),
        prisma.whatsAppConversation.findMany({
          where: { contactId: { not: null }, lastMessageAt: { gte: oneWeekAgo } },
          select: { contactId: true },
        }),
      ]);

      const contactIds = [...new Set([...waConvs, ...legacyConvs].map(c => c.contactId!))];
      console.log(`[contact-attributes-cron] ${contactIds.length} contatos com conversa na semana.`);

      let enriched = 0;
      for (const contactId of contactIds) {
        try {
          const result = await enrichContactFromConversations(contactId);
          if (Object.keys(result.updated).length > 0) enriched++;
        } catch (err) {
          console.error(`[contact-attributes-cron] Falha no contato ${contactId}:`, err);
        }
      }
      console.log(`[contact-attributes-cron] Concluído — ${enriched} contatos enriquecidos.`);
    } catch (err) {
      console.error('[contact-attributes-cron] Erro:', err);
    }
  });

  console.log('[contact-attributes-cron] Agendado: domingo 4h BRT (cron 0 7 * * 0 UTC)');
}
