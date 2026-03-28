import OpenAI from 'openai';
import prisma from '../lib/prisma';
import { EvolutionApiClient } from './evolutionApiClient';
import { DEFAULT_SYSTEM_PROMPT, sendBotMessages, ensureMeetingLink } from './whatsappBot';
import { MessageSender, FollowUpTone } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepConfig {
  id: string;
  order: number;
  delayMinutes: number;
  tone: FollowUpTone;
}

interface ConversationWithState {
  id: string;
  phone: string;
  pushName: string | null;
  needsHumanAttention: boolean;
  meetingBooked: boolean;
  followUpState: {
    id: string;
    followUpCount: number;
    lastBotMessageAt: Date | null;
    lastFollowUpAt: Date | null;
    respondedSinceLastBot: boolean;
    paused: boolean;
  } | null;
}

// ─── Cron State (legado — mantido apenas para stopFollowUpCron de segurança) ─
let checkInterval: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getOpenAIClient(): Promise<OpenAI> {
  const config = await prisma.whatsAppConfig.findFirst();
  const key = config?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API Key não configurada');
  return new OpenAI({ apiKey: key });
}

// ─── Follow-Up Instruction Builder ─────────────────────────────────────────

export function getFollowUpInstruction(
  tone: FollowUpTone | string,
  stepNumber: number,
  totalSteps: number,
  pushName: string,
): string {
  const nameRef = pushName ? `O nome do cliente é ${pushName}. Use o nome dele.` : '';

  const noReintro = 'IMPORTANTE: Você JÁ se apresentou como Bia em mensagens anteriores. NÃO se apresente novamente, NÃO diga "sou a Bia" ou "aqui é a Bia". Vá direto ao ponto.';

  const tones: Record<string, string> = {
    CASUAL: `${nameRef}
${noReintro}
CONTEXTO: Você mandou mensagem pro cliente e ele não respondeu. Este é o follow-up #${stepNumber} de ${totalSteps}.
Mande UMA mensagem curta e casual, tipo checando se ele viu a mensagem anterior. Algo como "E aí, conseguiu ver?" ou "Ficou alguma dúvida sobre o que conversamos?". Sem pressão, bem leve.
NÃO use ---. Mande apenas 1 mensagem curta.`,

    REFORCO: `${nameRef}
${noReintro}
CONTEXTO: Você já mandou mensagem e follow-up(s) pro cliente, e ele não respondeu. Este é o follow-up #${stepNumber} de ${totalSteps}.
Mande UMA mensagem reforçando o valor do produto de forma breve. Mencione um benefício específico que pode ser relevante e pergunte se quer agendar uma demonstração rápida. Seja simpático mas direto.
NÃO use ---. Mande apenas 1 mensagem curta.`,

    ENCERRAMENTO: `${nameRef}
${noReintro}
CONTEXTO: Este é o último follow-up (#${stepNumber} de ${totalSteps}). O cliente não respondeu nenhuma das mensagens anteriores.
Mande UMA mensagem curta agradecendo o interesse inicial, encerrando a conversa de forma educada e se colocando à disposição para uma futura conversa. Diga algo como "fico por aqui, mas qualquer coisa é só chamar". NÃO seja insistente, NÃO ofereça nada novo. Apenas agradeça e encerre.
NÃO use ---. Mande apenas 1 mensagem curta.`,
  };

  return tones[tone] || tones.CASUAL;
}

// Versão que aceita textos customizados vindos do banco (config.followUpTone*)
export function getFollowUpInstructionWithCustom(
  tone: FollowUpTone | string,
  stepNumber: number,
  totalSteps: number,
  pushName: string,
  customTones?: { CASUAL?: string | null; REFORCO?: string | null; ENCERRAMENTO?: string | null },
): string {
  const customText = customTones?.[tone as keyof typeof customTones];
  if (customText?.trim()) {
    const nameRef = pushName ? `O nome do cliente é ${pushName}. Use o nome dele.` : '';
    const noReintro = 'IMPORTANTE: Você JÁ se apresentou em mensagens anteriores. NÃO se apresente novamente. Vá direto ao ponto.';
    return `${nameRef}\n${noReintro}\nCONTEXTO: Follow-up #${stepNumber} de ${totalSteps}.\n\n${customText.trim()}\n\nNÃO use ---. Mande apenas 1 mensagem curta.`;
  }
  return getFollowUpInstruction(tone, stepNumber, totalSteps, pushName);
}

// ─── Send Follow-Up ─────────────────────────────────────────────────────────

export async function sendFollowUp(
  conversation: ConversationWithState,
  stepConfig: StepConfig,
  stepNumber: number,
  totalSteps: number,
): Promise<void> {
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config) return;

  const pushName = conversation.pushName || '';
  const tone = stepConfig.tone;
  const instruction = getFollowUpInstructionWithCustom(tone, stepNumber, totalSteps, pushName, {
    CASUAL: config.followUpToneCasual,
    REFORCO: config.followUpToneReforco,
    ENCERRAMENTO: config.followUpToneEncerramento,
  });

  try {
    // Load recent AI history for context
    const aiHistory = await prisma.whatsAppAIHistory.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    const history = aiHistory.map((h) => ({
      role: h.role as 'system' | 'user' | 'assistant',
      content: h.content,
    }));

    const systemPrompt = config.botSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    const meetingLink = config.meetingLink || '';

    const openai = await getOpenAIClient();
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${systemPrompt}${meetingLink ? `\nLink para agendamento: ${meetingLink}` : ''}\n\n${instruction}`,
        },
        ...history.slice(-10),
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const reply = result.choices[0].message.content || '';

    // Save bot message
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        text: reply,
        isFollowUp: true,
        followUpStep: stepNumber,
      },
    });

    // Save AI history
    await prisma.whatsAppAIHistory.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
      },
    });

    // Update follow-up state
    if (conversation.followUpState) {
      await prisma.whatsAppFollowUpState.update({
        where: { id: conversation.followUpState.id },
        data: {
          followUpCount: stepNumber,
          lastFollowUpAt: new Date(),
          lastBotMessageAt: new Date(),
          respondedSinceLastBot: false,
        },
      });
    }

    // Update conversation timestamp + reopen if closed
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), lastMessageAt: new Date(), status: 'open', isActive: true },
    });

    // Send via Z-API
    const client = await EvolutionApiClient.fromDB();
    await sendBotMessages(client, conversation.phone, reply);
    await ensureMeetingLink(client, conversation.phone, reply);

    console.log(`[FollowUp] Follow-up #${stepNumber} (${tone}) enviado para ${conversation.phone}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[FollowUp] Erro ao gerar/enviar follow-up para ${conversation.phone}:`, message);
  }
}

// ─── Check Follow-Ups (LEGADO — DESATIVADO) ────────────────────────────────
//
// IMPORTANTE: Este cron legado foi desativado porque NÃO verificava:
//   - isBusinessHours() → podia enviar às 3h da manhã
//   - canSend() → podia ultrapassar limite diário
//   - optedOut → podia enviar para quem fez opt-out
//
// Toda a funcionalidade foi substituída pelo followUpScheduler.ts (event-driven),
// que é inicializado em jobs/index.ts via initFollowUpScheduler().
// O novo scheduler respeita todas as proteções anti-bloqueio.
//
// Mantemos sendFollowUp() e getFollowUpInstruction() acima porque são
// reutilizados pelo novo scheduler.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Substituído por initFollowUpScheduler em followUpScheduler.ts */
export function startFollowUpCron(): void {
  console.warn(
    '[FollowUp] startFollowUpCron está DESATIVADO. ' +
    'Use initFollowUpScheduler() de followUpScheduler.ts que respeita horário comercial, limite diário e opt-out.',
  );
}

/** @deprecated Substituído por initFollowUpScheduler em followUpScheduler.ts */
export function stopFollowUpCron(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[FollowUp] Motor de follow-up parado');
  }
}
