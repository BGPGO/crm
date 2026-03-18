import OpenAI from 'openai';
import axios from 'axios';
import prisma from '../lib/prisma';
import { EvolutionApiClient } from './evolutionApiClient';
import { transcribeAudio } from './audioTranscriber';
import { MessageSender } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WhatsAppPayload {
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
      participant?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      buttonsResponseMessage?: { selectedDisplayText?: string };
      listResponseMessage?: { title?: string };
      audioMessage?: Record<string, unknown> & { audioUrl?: string };
      audioUrl?: string;
      base64?: string;
    };
  };
  sender?: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Default System Prompt ──────────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `Você é a Bia, SDR da Bertuzzi Patrimonial. SEMPRE se apresente como Bia na primeira mensagem. Atende pelo WhatsApp como pessoa real — sua META é agendar uma reunião de Diagnóstico Financeiro.

FORMATO: Separe mensagens com ---. Cada bloco entre --- vira uma mensagem separada no WhatsApp. Mande 2-3 mensagens curtas por vez.

REGRAS DE OURO:
- Mensagens CURTAS. Máximo 1 linha por mensagem. Escreva como quem digita rápido no WhatsApp.
- Seja DIRETA. Entenda a dor do lead e encaminhe pra reunião. Sem enrolação.
- A partir da 2ª troca, já direcione para o agendamento.
- NUNCA mande parágrafos longos. Se a mensagem tem mais de 2 linhas, quebre com ---.

FUNIL:
1. Cumprimente + pergunte sobre a empresa/dor (1 mensagem curta)
2. Entendeu a dor? Conecte com o produto certo e proponha reunião
3. Envie o link do Calendly

AGENDAMENTO:
- Envie o link do Calendly em mensagem SEPARADA (entre ---), sozinho, sem texto
- Exemplo:
  Vou te mandar o link pra agendar 😊
  ---
  {meetingLink}
  ---
  Escolhe o horário que for melhor pra ti!
- NUNCA sugira horários. O lead escolhe pelo link.
- O link é enviado NO MÁXIMO 1 VEZ. Depois, vire suporte — responda dúvidas sem reenviar.
- Se o lead pedir o link de novo → mande. Senão, não repita.

OBJEÇÕES (respostas curtas):
- "Não tenho tempo" → "São 45 minutinhos! Te mando o link pra encaixar na agenda"
- "Já tenho solução" → "Qual usam hoje?" + diferencial rápido
- "Manda info" → 1 dado concreto + "fica mais claro ao vivo, 45 min"
- "Quanto custa?" → Range + "depende do cenário, na reunião definimos certinho"
- "Não quero" → Agradeça e encerre. NÃO insista.

ESCRITA:
- Máximo 1 linha por mensagem entre ---
- Máximo 1 emoji por mensagem, esporádico
- Sem listas, sem bullets, sem blocos de texto
- Nunca invente informações

EMPRESA:
- Bertuzzi Patrimonial — soluções financeiras para empresas
- GoBI: BI financeiro, dashboards, integra ERPs — a partir de R$397/mês
- GoControladoria: controladoria, DRE, compliance — a partir de R$1.997/mês
- Valores variam — direcione pra demo

KPI: reunião agendada. Seja prática, rápida e humana.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function downloadAudioAsBase64(url: string): Promise<string> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data).toString('base64');
}

async function getOpenAIClient(): Promise<OpenAI> {
  const config = await prisma.whatsAppConfig.findFirst();
  const key = config?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API Key não configurada');
  return new OpenAI({ apiKey: key });
}

async function getSystemPrompt(): Promise<string> {
  const config = await prisma.whatsAppConfig.findFirst();
  return config?.botSystemPrompt || DEFAULT_SYSTEM_PROMPT;
}

export async function getCurrentContext(): Promise<string> {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const diaSemana = dias[now.getDay()];
  const hora = now.getHours();
  const minutos = now.getMinutes().toString().padStart(2, '0');
  const data = now.toLocaleDateString('pt-BR');
  const fimDeSemana = now.getDay() === 0 || now.getDay() === 6;
  const foraDoPeriodo = hora >= 17 || hora < 9;

  return `\n\nCONTEXTO ATUAL:
- Data: ${data} (${diaSemana})
- Hora atual: ${hora}:${minutos}
- Para agendamento: SEMPRE envie o link do Calendly. NÃO sugira horários específicos. O lead escolhe pelo link.`;
}


// ─── Send Bot Messages ──────────────────────────────────────────────────────

export async function sendBotMessages(
  client: EvolutionApiClient,
  phone: string,
  reply: string,
): Promise<void> {
  // Primary split: by --- separator (as instructed in the system prompt)
  let parts = reply.split(/\s*-{3,}\s*/).map((p) => p.trim()).filter((p) => p.length > 0);

  // Fallback: split by double newlines (paragraph breaks)
  if (parts.length === 1) {
    parts = reply.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  }

  // No further splitting — sending one long message is better than splitting mid-sentence

  for (const part of parts) {
    await client.sendText(phone, part);
    if (parts.length > 1) {
      // Simulate typing delay: ~1.5s base + ~50ms per character, capped at 5s
      const delay = Math.min(1500 + part.length * 50, 5000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.log(`[Bot] Enviou ${parts.length} mensagem(ns) para ${phone}`);
}

// ─── AI Response ────────────────────────────────────────────────────────────

export async function getAIResponse(
  history: ChatMessage[],
  pushName: string,
  meetingLink?: string | null,
  extraContext?: string,
): Promise<string> {
  const basePrompt = await getSystemPrompt();
  const context = await getCurrentContext();
  let systemMessage = basePrompt + context;
  if (pushName) systemMessage += `\n\nO nome do cliente é ${pushName}. Use o primeiro nome dele na conversa.`;
  if (meetingLink) systemMessage += `\nLink para agendamento: ${meetingLink} — Quando o cliente aceitar agendar, envie este link em uma mensagem separada.`;
  else systemMessage += `\nNão há link de agendamento configurado — combine dia e horário diretamente com o cliente.`;
  if (extraContext) {
    systemMessage += '\n\n' + extraContext;
  }

  const openai = await getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMessage },
      ...history,
    ],
    max_tokens: 400,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || '';
}

// ─── Debounce Map ──────────────────────────────────────────────────────────
// Waits 25s after last message before responding, so multiple messages get batched
const DEBOUNCE_MS = 25 * 1000;
const pendingResponses = new Map<string, NodeJS.Timeout>();

// ─── Main Handler ───────────────────────────────────────────────────────────

export async function handleMessage(payload: WhatsAppPayload, instance: string): Promise<void> {
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config || !config.botEnabled) return;

  const data = payload.data;
  if (!data || !data.key) return;
  if (data.key.fromMe) return;

  const remoteJid = data.key.remoteJid;
  if (remoteJid.includes('@g.us')) return;

  const message = data.message;
  if (!message) return;

  // Extract text from message or transcribe audio
  let text = (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ''
  ).trim();

  if (!text && message.audioMessage) {
    const audioUrl = message.audioMessage?.audioUrl || message.audioUrl;
    const base64 = (data.message as Record<string, unknown>).base64 as string | undefined
      || message.base64 as string | undefined;

    let audioBase64: string | undefined;
    if (audioUrl) {
      try {
        audioBase64 = await downloadAudioAsBase64(audioUrl);
      } catch (dlErr: unknown) {
        const dlMsg = dlErr instanceof Error ? dlErr.message : String(dlErr);
        console.error('[Bot] Falha ao baixar áudio:', dlMsg);
      }
    }
    if (!audioBase64 && base64) audioBase64 = base64;

    if (audioBase64) {
      try {
        const transcribed = await transcribeAudio(audioBase64);
        if (transcribed) text = transcribed;
      } catch (err: unknown) {
        console.error('[Bot] Falha na transcrição:', err instanceof Error ? err.message : err);
        return;
      }
    }
  }

  if (!text) return;

  const pushName = data.pushName || '';

  // Resolve phone
  let phone: string;
  const botConfig = await prisma.whatsAppConfig.findFirst({ select: { botPhoneNumber: true } });
  const botPhone = botConfig?.botPhoneNumber || null;

  if (remoteJid.includes('@lid')) {
    phone = remoteJid.replace('@lid', '');
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '');
  }

  if (botPhone && phone === botPhone) return;

  console.log(`[Bot] Mensagem de ${phone} (${pushName}): "${text}"`);

  // ── Save message immediately (always, regardless of debounce) ──

  // Human attention mode: save but don't respond
  const existingConv = await prisma.whatsAppConversation.findUnique({ where: { phone } });
  if (existingConv?.needsHumanAttention) {
    await prisma.whatsAppMessage.create({
      data: { conversationId: existingConv.id, sender: MessageSender.CLIENT, text },
    });
    await prisma.whatsAppConversation.update({
      where: { id: existingConv.id },
      data: { lastMessageAt: new Date(), updatedAt: new Date() },
    });
    return;
  }

  // Get or create conversation
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone },
    include: { followUpState: true },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: { phone, pushName: pushName || null },
      include: { followUpState: true },
    });
  } else if (pushName && conversation.pushName !== pushName) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { pushName },
      include: { followUpState: true },
    });
  }
  if (!conversation) throw new Error('Unexpected: conversation is null');

  // Save message to DB instantly
  await prisma.whatsAppMessage.create({
    data: { conversationId: conversation.id, sender: MessageSender.CLIENT, text },
  });

  // Update timestamps
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), updatedAt: new Date() },
  });

  // Update follow-up state: client responded
  if (conversation.followUpState) {
    await prisma.whatsAppFollowUpState.update({
      where: { id: conversation.followUpState.id },
      data: { respondedSinceLastBot: true },
    });
  }

  // Move deal: Contato feito → Marcar reunião (first response)
  const STAGE_CONTATO_FEITO = '65bd0418294535000d1f57cd';
  const STAGE_MARCAR_REUNIAO = '64fb7516ea4eb400219457e0';

  if (conversation.contactId) {
    try {
      const deal = await prisma.deal.findFirst({
        where: { contactId: conversation.contactId, status: 'OPEN', stageId: STAGE_CONTATO_FEITO },
      });
      if (deal) {
        await prisma.deal.update({
          where: { id: deal.id },
          data: { stageId: STAGE_MARCAR_REUNIAO, updatedAt: new Date() },
        });
        await prisma.activity.create({
          data: {
            type: 'STAGE_CHANGE',
            content: `Negociação movida de Contato feito para Marcar reunião — lead respondeu no WhatsApp.`,
            userId: deal.userId, dealId: deal.id, contactId: conversation.contactId,
          },
        });
        console.log(`[Bot] Deal ${deal.id} movida: Contato feito → Marcar reunião`);
      }
    } catch (stageErr) {
      console.error('[Bot] Erro ao mover deal:', stageErr);
    }
  }

  // ── Debounce: wait 25s for more messages before responding ──
  const convId = conversation.id;

  // Clear previous timer for this phone
  const existingTimer = pendingResponses.get(phone);
  if (existingTimer) {
    clearTimeout(existingTimer);
    console.log(`[Bot] Debounce reset para ${phone} (mais mensagens chegando)`);
  }

  // Set new timer
  const timer = setTimeout(() => {
    pendingResponses.delete(phone);
    generateAndSendResponse(convId, phone, pushName).catch((err) => {
      console.error(`[Bot] Erro no debounced response para ${phone}:`, err);
    });
  }, DEBOUNCE_MS);

  pendingResponses.set(phone, timer);
  console.log(`[Bot] Debounce agendado para ${phone} (${DEBOUNCE_MS / 1000}s)`);
}

// ─── Debounced Response Generator ──────────────────────────────────────────

async function generateAndSendResponse(conversationId: string, phone: string, pushName: string): Promise<void> {
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config || !config.botEnabled) return;

  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    include: { followUpState: true },
  });
  if (!conversation || conversation.needsHumanAttention) return;

  // Collect ALL client messages since last bot response
  const lastBotMsg = await prisma.whatsAppMessage.findFirst({
    where: { conversationId, sender: 'BOT' },
    orderBy: { createdAt: 'desc' },
  });

  const pendingMsgs = await prisma.whatsAppMessage.findMany({
    where: {
      conversationId,
      sender: 'CLIENT',
      ...(lastBotMsg ? { createdAt: { gt: lastBotMsg.createdAt } } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  if (pendingMsgs.length === 0) return;

  // Combine all pending messages into one user message
  const combinedText = pendingMsgs.map((m) => m.text).join('\n');
  console.log(`[Bot] Processando ${pendingMsgs.length} mensagem(ns) de ${phone}: "${combinedText.substring(0, 100)}..."`);

  // Build AI history
  const aiHistory = await prisma.whatsAppAIHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  const history: ChatMessage[] = aiHistory.map((h) => ({
    role: h.role as 'user' | 'assistant',
    content: h.content,
  }));
  history.push({ role: 'user', content: combinedText });

  // Check WhatsApp connection
  const client = await EvolutionApiClient.fromDB();
  try {
    const connStatus = await client.getInstanceStatus();
    const state = connStatus?.instance?.state;
    if (state !== 'open' && state !== 'connected') {
      console.warn(`[Bot] WhatsApp not connected (${state}) — not responding`);
      return;
    }
  } catch {
    console.warn(`[Bot] Cannot check connection — skipping response`);
    return;
  }

  try {
    const reply = await getAIResponse(history, pushName, config.meetingLink);

    // Save bot message
    await prisma.whatsAppMessage.create({
      data: { conversationId, sender: MessageSender.BOT, text: reply },
    });

    // Save AI history (combined user + assistant)
    await prisma.whatsAppAIHistory.create({
      data: { conversationId, role: 'user', content: combinedText },
    });
    await prisma.whatsAppAIHistory.create({
      data: { conversationId, role: 'assistant', content: reply },
    });

    // Cap history at 20
    const totalHistory = await prisma.whatsAppAIHistory.count({ where: { conversationId } });
    if (totalHistory > 20) {
      const toDelete = await prisma.whatsAppAIHistory.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: totalHistory - 20,
        select: { id: true },
      });
      await prisma.whatsAppAIHistory.deleteMany({
        where: { id: { in: toDelete.map((h) => h.id) } },
      });
    }

    // Update follow-up state
    const followUpData = { lastBotMessageAt: new Date(), respondedSinceLastBot: false, followUpCount: 0 };
    if (conversation.followUpState) {
      await prisma.whatsAppFollowUpState.update({ where: { id: conversation.followUpState.id }, data: followUpData });
    } else {
      await prisma.whatsAppFollowUpState.create({ data: { conversationId, ...followUpData } });
    }

    // Update conversation
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });

    // Send
    await sendBotMessages(client, phone, reply);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Bot] Erro:`, errMsg);

    const isApiError = errMsg.includes('ECONNREFUSED') || errMsg.includes('z-api') ||
      errMsg.includes('401') || errMsg.includes('404') || errMsg.includes('sendText');

    if (isApiError) {
      await prisma.whatsAppMessage.updateMany({
        where: { conversationId, sender: 'BOT', delivered: true },
        data: { delivered: false },
      });
      return;
    }

    // AI error — fallback to human
    await prisma.whatsAppMessage.create({
      data: {
        conversationId, sender: MessageSender.BOT,
        text: `Oi${pushName ? `, ${pushName}` : ''}! Sou a Bia da *Bertuzzi Patrimonial*! To com uma instabilidade aqui, mas um consultor vai te atender em breve.`,
        delivered: false,
      },
    });
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { needsHumanAttention: true },
    });

    if (conversation.contactId) {
      const humanTag = await prisma.tag.findUnique({ where: { name: 'Atendimento Humano' } });
      if (humanTag) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId: conversation.contactId, tagId: humanTag.id } },
          create: { contactId: conversation.contactId, tagId: humanTag.id },
          update: {},
        });
      }
    }
  }
}
