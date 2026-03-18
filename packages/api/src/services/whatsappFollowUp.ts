import OpenAI from 'openai';
import prisma from '../lib/prisma';
import { EvolutionApiClient } from './evolutionApiClient';
import { DEFAULT_SYSTEM_PROMPT, sendBotMessages } from './whatsappBot';
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

// ─── Cron State ─────────────────────────────────────────────────────────────

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

  const tones: Record<string, string> = {
    CASUAL: `${nameRef}
CONTEXTO: Você mandou mensagem pro cliente e ele não respondeu. Este é o follow-up #${stepNumber} de ${totalSteps}.
Mande UMA mensagem curta e casual, tipo checando se ele viu a mensagem anterior. Algo como "E aí, conseguiu ver?" ou "Ficou alguma dúvida sobre o que conversamos?". Sem pressão, bem leve.
NÃO use ---. Mande apenas 1 mensagem curta.`,

    REFORCO: `${nameRef}
CONTEXTO: Você já mandou mensagem e follow-up(s) pro cliente, e ele não respondeu. Este é o follow-up #${stepNumber} de ${totalSteps}.
Mande UMA mensagem reforçando o valor do produto de forma breve. Mencione um benefício específico que pode ser relevante e pergunte se quer agendar uma demonstração rápida. Seja simpático mas direto.
NÃO use ---. Mande apenas 1 mensagem curta.`,

    ENCERRAMENTO: `${nameRef}
CONTEXTO: Este é o último follow-up (#${stepNumber} de ${totalSteps}). O cliente não respondeu nenhuma das mensagens anteriores.
Mande UMA mensagem curta agradecendo o interesse inicial, encerrando a conversa de forma educada e se colocando à disposição para uma futura conversa. Diga algo como "fico por aqui, mas qualquer coisa é só chamar". NÃO seja insistente, NÃO ofereça nada novo. Apenas agradeça e encerre.
NÃO use ---. Mande apenas 1 mensagem curta.`,
  };

  return tones[tone] || tones.CASUAL;
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
  const instruction = getFollowUpInstruction(tone, stepNumber, totalSteps, pushName);

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

    // Update conversation timestamp
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Send via Z-API
    const client = await EvolutionApiClient.fromDB();
    await sendBotMessages(client, conversation.phone, reply);

    console.log(`[FollowUp] Follow-up #${stepNumber} (${tone}) enviado para ${conversation.phone}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[FollowUp] Erro ao gerar/enviar follow-up para ${conversation.phone}:`, message);
  }
}

// ─── Check Follow-Ups ──────────────────────────────────────────────────────

export async function checkFollowUps(): Promise<void> {
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config || !config.followUpEnabled || !config.botEnabled) return;

  // Load follow-up steps from DB
  const steps = await prisma.whatsAppFollowUpStep.findMany({
    where: { configId: config.id },
    orderBy: { order: 'asc' },
  });

  if (steps.length === 0) return;

  // Find all conversations with follow-up state
  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      needsHumanAttention: false,
      meetingBooked: false,
    },
    include: {
      followUpState: true,
    },
  });

  const now = Date.now();

  for (const conversation of conversations) {
    try {
      const fu = conversation.followUpState;
      if (!fu) continue;

      const currentStep = fu.followUpCount || 0;

      // Already completed all steps
      if (currentStep >= steps.length) continue;

      // Skip checks
      if (!fu.lastBotMessageAt) continue;
      if (fu.respondedSinceLastBot) continue;
      if (fu.paused) continue;

      // Calculate delay
      const lastTime = fu.lastFollowUpAt || fu.lastBotMessageAt;
      const stepConfig = steps[currentStep];
      const delayMs = (stepConfig.delayMinutes || 30) * 60 * 1000;
      const elapsed = now - new Date(lastTime).getTime();

      if (elapsed >= delayMs) {
        console.log(`[FollowUp] Enviando follow-up #${currentStep + 1} (${stepConfig.tone}) para ${conversation.phone}`);
        await sendFollowUp(
          conversation as ConversationWithState,
          stepConfig,
          currentStep + 1,
          steps.length,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FollowUp] Erro ao processar ${conversation.phone}:`, message);
    }
  }
}

// ─── Cron Management ────────────────────────────────────────────────────────

export function startFollowUpCron(): void {
  if (checkInterval) {
    console.warn('[FollowUp] Cron já estava rodando, reiniciando...');
    clearInterval(checkInterval);
  }
  checkInterval = setInterval(checkFollowUps, 60 * 1000);
  console.log('[FollowUp] Motor de follow-up iniciado (checagem a cada 60s)');
}

export function stopFollowUpCron(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[FollowUp] Motor de follow-up parado');
  }
}
