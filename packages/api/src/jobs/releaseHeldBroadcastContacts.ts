/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Job: Release Held Broadcast Contacts
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Processa WaBroadcastContact em status WA_BC_HELD com holdUntil <= agora.
 * Re-tenta o envio individual de cada um. Mantém o status correto após retry.
 *
 * Roda a cada 30min via cron orchestrator.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import prisma from '../lib/prisma';
import { WaMessageService } from '../services/wa/messageService';

export interface HeldReleaseResult {
  candidates: number;
  released: number;
  sent: number;
  failed: number;
  rehold: number; // recipients que ainda têm MARKETING <48h após release
}

export async function runReleaseHeldBroadcastContacts(): Promise<HeldReleaseResult> {
  const JOB = '[release-held-broadcasts]';
  const now = new Date();
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  // 1. Buscar candidatos (HELD com holdUntil vencido)
  const candidates = await prisma.waBroadcastContact.findMany({
    where: {
      status: 'WA_BC_HELD',
      holdUntil: { lte: now },
    },
    include: {
      broadcast: {
        include: {
          template: {
            select: { id: true, name: true, language: true, category: true, buttons: true },
          },
        },
      },
    },
    take: 100, // batch limit por execução
  });

  if (candidates.length === 0) {
    return { candidates: 0, released: 0, sent: 0, failed: 0, rehold: 0 };
  }

  console.log(`${JOB} Processando ${candidates.length} contatos held`);

  // Pre-carregar templates MARKETING (evita N queries no loop)
  const marketingTemplateRows = await prisma.cloudWaTemplate.findMany({
    where: { category: 'MARKETING' },
    select: { name: true },
  });
  const marketingTemplateNames = marketingTemplateRows.map((t) => t.name);

  let sent = 0;
  let failed = 0;
  let rehold = 0;

  for (const bc of candidates) {
    if (!bc.broadcast.template) {
      await prisma.waBroadcastContact.update({
        where: { id: bc.id },
        data: { status: 'WA_BC_FAILED', error: 'Template do broadcast nulo no release' },
      });
      failed++;
      continue;
    }

    // Re-verificar cooldown: pode ter recebido OUTRA MARKETING durante o hold
    if (bc.broadcast.template.category === 'MARKETING') {
      const FORTY_EIGHT_HOURS_AGO = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);
      const lastMarketing = await prisma.waMessage.findFirst({
        where: {
          direction: 'OUTBOUND',
          type: 'TEMPLATE',
          createdAt: { gte: FORTY_EIGHT_HOURS_AGO },
          conversation: { phone: bc.phone },
          templateName: { in: marketingTemplateNames },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      if (lastMarketing) {
        const newHoldUntil = new Date(lastMarketing.createdAt.getTime() + FORTY_EIGHT_HOURS_MS);
        await prisma.waBroadcastContact.update({
          where: { id: bc.id },
          data: {
            holdUntil: newHoldUntil,
            error: `Re-hold: nova MARKETING em ${lastMarketing.createdAt.toISOString()}`,
          },
        });
        console.log(`${JOB} RE-HOLD ${bc.phone} até ${newHoldUntil.toISOString()} (nova MARKETING durante hold)`);
        rehold++;
        continue;
      }
    }

    // OK para enviar — encontrar conversa e disparar template
    try {
      const conv = await prisma.waConversation.findFirst({
        where: { phone: bc.phone },
      });

      if (!conv) {
        await prisma.waBroadcastContact.update({
          where: { id: bc.id },
          data: { status: 'WA_BC_FAILED', error: 'Conversa não encontrada no release' },
        });
        failed++;
        continue;
      }

      // Montar components (templateParams por contato ou do broadcast)
      const rawParams = bc.templateParams || bc.broadcast.templateParams;
      const components: any[] = rawParams
        ? Array.isArray(rawParams)
          ? [...rawParams]
          : [rawParams]
        : [];

      // Reinjetar tracking URL button se template tiver botão dinâmico
      const buttons = bc.broadcast.template.buttons as Array<{ type: string; url?: string }> | null;
      const hasUrlButton = buttons?.some((b) => b.type === 'URL' && b.url?.includes('{{1}}'));
      if (hasUrlButton) {
        const buttonIdx = buttons!.findIndex((b) => b.type === 'URL');
        components.push({
          type: 'button',
          sub_type: 'url',
          index: buttonIdx >= 0 ? buttonIdx : 0,
          parameters: [{ type: 'text', text: bc.id }],
        });
      }

      const msg = await WaMessageService.sendTemplate(
        conv.id,
        bc.broadcast.template.name,
        bc.broadcast.template.language || 'pt_BR',
        components,
        { senderType: 'WA_SYSTEM' },
        { isBroadcast: true },
      );

      await prisma.waBroadcastContact.update({
        where: { id: bc.id },
        data: {
          status: 'WA_BC_SENT',
          sentAt: new Date(),
          waMessageId: msg?.waMessageId || null,
          holdUntil: null,
          error: null,
          contactId: conv.contactId || null,
        },
      });

      // Atualizar sentCount no broadcast
      await prisma.waBroadcast.update({
        where: { id: bc.broadcastId },
        data: { sentCount: { increment: 1 } },
      });

      console.log(`${JOB} SENT ${bc.phone} (broadcast ${bc.broadcastId})`);
      sent++;
    } catch (err: any) {
      const errorMsg = err?.message?.slice(0, 500) || 'Erro desconhecido no release';
      await prisma.waBroadcastContact.update({
        where: { id: bc.id },
        data: { status: 'WA_BC_FAILED', error: errorMsg },
      });
      console.error(`${JOB} FAILED ${bc.phone}:`, errorMsg);
      failed++;
    }

    // Pequeno delay para não sobrecarregar a Meta API
    await new Promise((r) => setTimeout(r, 500));
  }

  const result: HeldReleaseResult = {
    candidates: candidates.length,
    released: sent + failed + rehold,
    sent,
    failed,
    rehold,
  };

  console.log(`${JOB} Concluído — sent: ${sent}, rehold: ${rehold}, failed: ${failed}`);
  return result;
}
