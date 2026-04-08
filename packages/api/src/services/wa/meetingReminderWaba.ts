/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Meeting Reminder — WABA (WhatsApp Cloud API oficial)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Equivalente ao meetingReminderScheduler.ts, porém usando templates WABA
 * aprovados pela Meta (necessário fora da janela de 24h).
 *
 * IMPORTANTE: O sistema fica DESATIVADO por padrão.
 * Ativar via CloudWaConfig.wabaMeetingReminderEnabled = true.
 *
 * Diferenças em relação ao Z-API:
 *   - Usa WaConversation (não WhatsAppConversation)
 *   - Envia via WaMessageService.sendTemplate() (não sendText())
 *   - NÃO usa setTimeout — o cron meetingReminderWabaCron.ts dispara o envio
 *   - Templates por step (4h, 1h, 15min) — variáveis resolvidas via variableMapping
 *
 * Templates necessários (devem estar APROVADOS na Meta):
 *   - lembrete_reuniao_4h    (240 min antes)
 *   - lembrete_reuniao_1h    (60 min antes)
 *   - lembrete_reuniao_15min (15 min antes)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import prisma from '../../lib/prisma';
import { WaMessageService } from './messageService';
import { canSend, registerSent } from '../dailyLimitService';
import { normalizePhone } from '../../utils/phoneNormalize';

// ─── Mapeamento step (minutos antes) → template ──────────────────────────────

const TEMPLATE_MAP: Record<number, string[]> = {
  240: ['lembrete_reuniao_4h'],
  60: ['lembrete_reuniao_60min', 'lembrete_reuniao_1h'],
  15: ['lembrete_reuniao_15min'],
};

// ─── Normalização de telefone ────────────────────────────────────────────────
// Números BR podem chegar com ou sem o 9 extra. O WaConversation usa o formato
// enviado pelo WhatsApp (normalmente sem o 9 extra para números antigos).
// Tentamos variações para encontrar a conversa existente.

function getPhoneVariations(phone: string): string[] {
  const variations = [phone];
  // Remove caracteres não numéricos
  const digits = phone.replace(/\D/g, '');
  if (digits !== phone) variations.push(digits);

  // Também incluir a versão normalizada (55+DDD+9+XXXXXXXX)
  const normalized = normalizePhone(phone);
  variations.push(normalized);

  // BR com 12 dígitos (55+DDD+8digits): tenta adicionar 9 após DDD
  if (digits.startsWith('55') && digits.length === 12) {
    const ddd = digits.substring(2, 4);
    const number = digits.substring(4);
    variations.push(`55${ddd}9${number}`);
  }
  // BR com 13 dígitos (55+DDD+9+8digits): tenta sem o 9
  if (digits.startsWith('55') && digits.length === 13) {
    const ddd = digits.substring(2, 4);
    const number = digits.substring(5);
    variations.push(`55${ddd}${number}`);
  }
  // Sem código do país (11 dígitos: DDD+9+8digits)
  if (digits.startsWith('55') && digits.length === 13) {
    variations.push(digits.substring(2)); // remove o 55
  }
  if (digits.startsWith('55') && digits.length === 12) {
    variations.push(digits.substring(2)); // remove o 55
  }
  // Se não começa com 55, adicionar com 55
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    variations.push('55' + digits);
    // E com/sem o 9
    if (digits.length === 10) {
      variations.push('55' + digits.slice(0, 2) + '9' + digits.slice(2));
    }
    if (digits.length === 11) {
      variations.push('55' + digits.slice(0, 2) + digits.slice(3)); // sem 9
    }
  }
  return [...new Set(variations)];
}

// ─── Verificar se o sistema está habilitado ───────────────────────────────────

async function isEnabled(): Promise<boolean> {
  const config = await prisma.cloudWaConfig.findFirst({
    select: { wabaMeetingReminderEnabled: true },
  });
  return config?.wabaMeetingReminderEnabled === true;
}

// ─── Encontrar ou criar WaConversation pelo telefone ─────────────────────────

async function findOrCreateWaConversation(phone: string, contactId: string | null): Promise<{ id: string; optedOut: boolean } | null> {
  const variations = getPhoneVariations(phone);

  // Tenta encontrar por qualquer variação do número
  let conversation = await prisma.waConversation.findFirst({
    where: { phone: { in: variations } },
    select: { id: true, optedOut: true },
  });

  if (!conversation) {
    // Criar nova conversa usando o telefone normalizado (55+DDD+9+XXXXXXXX)
    const normalizedPhone = normalizePhone(phone);
    try {
      conversation = await prisma.waConversation.create({
        data: {
          phone: normalizedPhone,
          contactId: contactId || null,
          status: 'WA_OPEN',
        },
        select: { id: true, optedOut: true },
      });
    } catch (e: any) {
      // Corrida entre processos — tenta buscar novamente
      if (e.code === 'P2002') {
        conversation = await prisma.waConversation.findFirst({
          where: { phone: { in: [normalizedPhone, ...variations] } },
          select: { id: true, optedOut: true },
        });
      } else {
        throw e;
      }
    }
  }

  return conversation;
}

// ─── Enviar lembrete WABA para um ScheduledFollowUp específico ────────────────

export async function sendWabaMeetingReminder(scheduledFollowUpId: string): Promise<void> {
  // Verificar flag global
  if (!await isEnabled()) {
    console.log('[waba-meeting-reminder] Sistema desativado (wabaMeetingReminderEnabled=false) — pulando');
    return;
  }

  // Buscar o agendamento
  const followUp = await prisma.scheduledFollowUp.findUnique({
    where: { id: scheduledFollowUpId },
  });

  if (!followUp) {
    console.warn(`[waba-meeting-reminder] ScheduledFollowUp ${scheduledFollowUpId} não encontrado`);
    return;
  }

  if (followUp.status !== 'PENDING') {
    console.log(`[waba-meeting-reminder] ScheduledFollowUp ${scheduledFollowUpId} já processado (status: ${followUp.status}) — pulando`);
    return;
  }

  if (followUp.type !== 'MEETING_REMINDER_WABA') {
    console.warn(`[waba-meeting-reminder] ScheduledFollowUp ${scheduledFollowUpId} não é MEETING_REMINDER_WABA (type: ${followUp.type}) — pulando`);
    return;
  }

  if (!followUp.meetingId) {
    console.warn(`[waba-meeting-reminder] ScheduledFollowUp ${scheduledFollowUpId} sem meetingId — pulando`);
    return;
  }

  // Buscar o template correspondente ao step (minutesBefore)
  const templateCandidates = TEMPLATE_MAP[followUp.stepNumber];
  if (!templateCandidates || templateCandidates.length === 0) {
    console.warn(`[waba-meeting-reminder] Nenhum template mapeado para step ${followUp.stepNumber}min — pulando`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'FAILED' },
    }).catch(() => {});
    return;
  }

  // Buscar o primeiro template APPROVED da lista de candidatos
  let templateName: string | null = null;
  for (const candidate of templateCandidates) {
    const t = await prisma.cloudWaTemplate.findFirst({
      where: { name: candidate, language: 'pt_BR', status: 'APPROVED' },
      select: { name: true },
    });
    if (t) { templateName = candidate; break; }
  }

  if (!templateName) {
    console.warn(`[waba-meeting-reminder] Nenhum template aprovado para step ${followUp.stepNumber}min (candidatos: ${templateCandidates.join(', ')}) — pulando`);
    // Não marcamos FAILED aqui pois o template pode ser aprovado depois
    return;
  }

  // Buscar dados do CalendlyEvent
  const meeting = await prisma.calendlyEvent.findUnique({
    where: { id: followUp.meetingId },
    include: {
      contact: { select: { id: true, phone: true, name: true } },
    },
  });

  if (!meeting || meeting.status !== 'active') {
    console.log(`[waba-meeting-reminder] Meeting ${followUp.meetingId} inativo ou não encontrado — cancelando lembrete`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }).catch(() => {});
    return;
  }

  if (!meeting.contact?.phone) {
    console.warn(`[waba-meeting-reminder] Meeting ${followUp.meetingId} sem telefone de contato — cancelando`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }).catch(() => {});
    return;
  }

  // Encontrar ou criar WaConversation
  const waConversation = await findOrCreateWaConversation(
    meeting.contact.phone,
    meeting.contact.id,
  );

  if (!waConversation) {
    console.error(`[waba-meeting-reminder] Não foi possível encontrar/criar WaConversation para ${meeting.contact.phone}`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'FAILED' },
    }).catch(() => {});
    return;
  }

  // Verificar opt-out
  if (waConversation.optedOut) {
    console.log(`[waba-meeting-reminder] Contato ${meeting.contact.phone} com opt-out — cancelando lembrete`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }).catch(() => {});
    return;
  }

  // Verificar limite diário (WABA usa dailyLimitService como proteção extra local)
  const allowed = await canSend('reminder');
  if (!allowed) {
    console.log(`[waba-meeting-reminder] Limite diário atingido — lembrete para ${meeting.contact.phone} NÃO enviado`);
    return; // Mantém PENDING para tentar depois (improvável recuperar, mas não prejudica)
  }

  // ── Envio atômico anti-duplicação ──────────────────────────────────────────
  // Marca SENT antes de enviar para evitar duplo envio em caso de cron paralelo
  const updated = await prisma.scheduledFollowUp.updateMany({
    where: { id: scheduledFollowUpId, status: 'PENDING' },
    data: { status: 'SENT', sentAt: new Date() },
  });

  if (updated.count === 0) {
    console.log(`[waba-meeting-reminder] ScheduledFollowUp ${scheduledFollowUpId} já foi processado por outro processo — pulando`);
    return;
  }

  // Montar parâmetros do template via variableMapping (suporta templates manuais)
  const { resolveTemplateVariables } = await import('../../utils/templateVariableResolver');

  const templateRecord = await prisma.cloudWaTemplate.findFirst({
    where: { name: templateName, language: 'pt_BR' },
    select: { variableMapping: true, body: true },
  });

  // Se variableMapping está vazio, gerar mapeamento padrão para meeting reminders
  // baseado na quantidade de variáveis no body do template
  let mappings = templateRecord?.variableMapping as any;
  if (!mappings || (Array.isArray(mappings) && mappings.length === 0)) {
    const varCount = (templateRecord?.body?.match(/\{\{\d+\}\}/g) || []).length;
    // Mapeamento padrão para lembretes de reunião:
    // {{1}} = nome, {{2}} = data (dd/mm/yyyy), {{3}} = horário (HH:MM)
    const defaultMappings = [
      { var: '{{1}}', source: 'contact.name' },
      { var: '{{2}}', source: 'meeting.date' },
      { var: '{{3}}', source: 'meeting.time' },
    ];
    mappings = defaultMappings.slice(0, Math.max(varCount, 1));
    console.log(`[waba-meeting-reminder] variableMapping vazio para "${templateName}" — usando padrão meeting (${varCount} vars)`);
  }

  const resolved = await resolveTemplateVariables(
    mappings,
    {
      contactId: meeting.contact.id,
      dealId: meeting.dealId || undefined,
      meetingId: meeting.id,
    },
  );

  // Se há variáveis obrigatórias faltando, não enviar
  if (resolved.missingVars.length > 0) {
    console.warn(`[waba-meeting-reminder] Variáveis faltando para template "${templateName}": ${resolved.missingVars.map(v => `${v.var}(${v.source})`).join(', ')} — pulando`);
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'FAILED' },
    }).catch(() => {});
    return;
  }

  const components = [
    {
      type: 'body',
      parameters: resolved.parameters,
    },
  ];

  // ── Smart Send: texto livre se janela 24h aberta, template se fechada ──
  const { WindowService } = await import('./windowService');
  const windowOpen = await WindowService.isWindowOpenSafe(waConversation.id);

  try {
    if (windowOpen && templateRecord?.body) {
      // Janela aberta → enviar corpo do template como texto livre (custo zero)
      let freeText = templateRecord.body;
      resolved.parameters.forEach((p, i) => {
        freeText = freeText.replace(`{{${i + 1}}}`, p.text);
      });

      try {
        await WaMessageService.sendText(
          waConversation.id,
          freeText,
          { senderType: 'WA_SYSTEM' },
        );

        await registerSent('reminder');
        console.log(`[waba-meeting-reminder] Smart send: texto livre (janela aberta) — lembrete ${followUp.stepNumber}min para ${meeting.contact.phone}`);
        return;
      } catch (textErr: any) {
        const metaCode = textErr?.metaCode || textErr?.response?.data?.error?.code;
        if (metaCode === 131047) {
          console.log(`[waba-meeting-reminder] Smart send fallback: janela fechou, enviando template`);
        } else {
          throw textErr;
        }
      }
    }

    // Fallback: enviar template normalmente
    await WaMessageService.sendTemplate(
      waConversation.id,
      templateName,
      'pt_BR',
      components,
      {
        senderType: 'WA_SYSTEM',
        isFollowUp: true,
        followUpStep: followUp.stepNumber,
        metadata: { source: 'waba_meeting_reminder', meetingId: followUp.meetingId },
      },
    );

    await registerSent('reminder');
    console.log(`[waba-meeting-reminder] Lembrete ${followUp.stepNumber}min enviado via template para ${meeting.contact.phone} (meeting ${followUp.meetingId})`);
  } catch (sendErr) {
    // Falhou — reverter para FAILED
    await prisma.scheduledFollowUp.update({
      where: { id: scheduledFollowUpId },
      data: { status: 'FAILED' },
    }).catch(() => {});
    console.error(`[waba-meeting-reminder] FALHA ao enviar para ${meeting.contact.phone}:`, sendErr);
  }
}

// ─── Agendar lembretes WABA para uma reunião ──────────────────────────────────
//
// Cria registros ScheduledFollowUp para os steps 4h, 1h e 15min antes.
// NÃO usa setTimeout — o cron meetingReminderWabaCron.ts dispara o envio
// quando o scheduledAt for atingido.
//
// Chamado quando um CalendlyEvent é criado.

export async function scheduleWabaMeetingReminders(meetingId: string): Promise<void> {
  // Verificar flag global silenciosamente (pode ser chamado antes do sistema ser ativado)
  if (!await isEnabled()) {
    return;
  }

  const meeting = await prisma.calendlyEvent.findUnique({
    where: { id: meetingId },
    include: { contact: { select: { id: true, phone: true, name: true } } },
  });

  if (!meeting || meeting.status !== 'active' || !meeting.contact?.phone) {
    console.warn(`[waba-meeting-reminder] Meeting ${meetingId} inativo, não encontrado ou sem telefone — não agendando`);
    return;
  }

  const now = Date.now();
  const meetingTime = new Date(meeting.startTime).getTime();

  // Steps suportados via WABA: 4h, 1h e 15min antes
  const steps = Object.keys(TEMPLATE_MAP).map(Number); // [240, 60, 15]

  for (const minutesBefore of steps) {
    const sendAt = meetingTime - minutesBefore * 60 * 1000;

    // Não agendar lembretes no passado
    if (sendAt <= now) continue;

    // Determinar label legível
    const label = minutesBefore >= 60
      ? `Lembrete ${Math.floor(minutesBefore / 60)} hora(s) antes`
      : `Lembrete ${minutesBefore} min antes`;

    // Evitar duplicatas
    const existing = await prisma.scheduledFollowUp.findFirst({
      where: {
        meetingId: meeting.id,
        stepNumber: minutesBefore,
        type: 'MEETING_REMINDER_WABA',
        status: 'PENDING',
      },
    });

    if (existing) {
      console.log(`[waba-meeting-reminder] Lembrete ${minutesBefore}min para meeting ${meetingId} já agendado — pulando`);
      continue;
    }

    try {
      await prisma.scheduledFollowUp.create({
        data: {
          type: 'MEETING_REMINDER_WABA',
          conversationId: null, // será resolvido no momento do envio
          dealId: meeting.dealId || null,
          meetingId: meeting.id,
          stepNumber: minutesBefore,
          label,
          tone: null,
          delayMinutes: minutesBefore,
          scheduledAt: new Date(sendAt),
          status: 'PENDING',
        },
      });
      console.log(`[waba-meeting-reminder] Lembrete ${minutesBefore}min agendado para meeting ${meetingId} (disparo: ${new Date(sendAt).toISOString()})`);
    } catch (e: any) {
      if (e.code !== 'P2002') throw e; // Ignora unique constraint, relança outros
    }
  }
}

// ─── Cancelar lembretes WABA de uma reunião ───────────────────────────────────

export async function cancelWabaMeetingReminders(meetingId: string, markCancelled = true): Promise<void> {
  if (markCancelled) {
    // Cancelamento real: preserva trilha de auditoria
    await prisma.scheduledFollowUp.updateMany({
      where: { meetingId, type: 'MEETING_REMINDER_WABA', status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }).catch(() => {});
  } else {
    // Re-agendamento: remove os PENDING antigos para não deixar duplicatas
    await prisma.scheduledFollowUp.deleteMany({
      where: { meetingId, type: 'MEETING_REMINDER_WABA', status: 'PENDING' },
    }).catch(() => {});
  }
}
