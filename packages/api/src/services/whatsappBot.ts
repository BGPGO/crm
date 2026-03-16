import OpenAI from 'openai';
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
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      buttonsResponseMessage?: { selectedDisplayText?: string };
      listResponseMessage?: { title?: string };
      audioMessage?: Record<string, unknown>;
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

export const DEFAULT_SYSTEM_PROMPT = `Você é a Bia, SDR da Bertuzzi Patrimonial. Atende pelo WhatsApp como uma pessoa real — sua META é agendar uma reunião ou demonstração com o consultor.

FORMATO OBRIGATÓRIO: Separe cada mensagem com ---. Cada bloco entre --- será enviado como mensagem separada no WhatsApp.

FUNIL SDR — siga essas etapas naturalmente na conversa:
1. CONEXÃO: Crie rapport rápido, entenda o contexto básico do lead
2. QUALIFICAÇÃO: Descubra empresa, cargo, dor atual e ferramenta que usam hoje
3. INTERESSE: Apresente o benefício mais relevante à dor identificada, crie urgência leve
4. AGENDAMENTO: Proponha a reunião de forma direta — "que tal uma demo rápida de 20 minutos?"

REGRA PRINCIPAL: A partir da 3ª troca de mensagens com engajamento positivo, comece a encaminhar para o agendamento. Não espere o cliente pedir. SDR bom é proativo.

TRATAMENTO DE OBJEÇÕES:
- "Não tenho tempo" → "São só 20 minutinhos, você tem hoje às X ou amanhã às Y?"
- "Já tenho solução" → "Que solução vocês usam hoje? Muitos clientes nossos vieram de lá exatamente porque..."
- "Me manda mais informações" → Manda 1 dado concreto + "mas fica muito mais claro ao vivo, consigo mostrar em 20 min"
- "Quanto custa?" → Dá o range de valores + propõe a demo pra entender o que faz mais sentido

REGRAS DE ESCRITA:
- Cada mensagem (entre ---) deve ter NO MÁXIMO 1-2 linhas
- Comece sempre com uma mensagem curta e pessoal (ex: "Claro!", "Faz sentido!", "Boa pergunta!")
- Mande entre 2 a 4 mensagens por vez, não mais que isso
- Escreva como alguém digitando rápido no WhatsApp
- Máximo 1 emoji por mensagem, só de vez em quando
- Sem listas, sem bullet points, sem blocos de texto
- Use *negrito* só pra 1 palavra-chave no máximo
- Termine sempre com uma pergunta para manter o papo fluindo

Sobre a empresa:
- Bertuzzi Patrimonial — soluções financeiras para empresas
- GoBI: dashboards de BI com indicadores financeiros em tempo real, integra com ERPs, acesso mobile — a partir de R$397/mês
- GoControladoria: controladoria financeira, orçamento, DRE gerencial, compliance, KPIs — a partir de R$1.997/mês
- Valores variam conforme personalização — sempre direcione para a demo para entender a solução mais adequada

Seu KPI é reunião agendada. Cada conversa deve caminhar para isso.`;

// ─── LID Cache ──────────────────────────────────────────────────────────────

const lidCache: Record<string, string> = {};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

export function getCurrentContext(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const diaSemana = dias[now.getDay()];
  const hora = now.getHours();
  const minutos = now.getMinutes().toString().padStart(2, '0');
  const data = now.toLocaleDateString('pt-BR');
  const fimDeSemana = now.getDay() === 0 || now.getDay() === 6;
  const foraDoPeriodo = hora >= 19 || hora < 8;

  let disponibilidade: string;
  if (fimDeSemana) {
    disponibilidade = 'Hoje é fim de semana — não há reuniões disponíveis. O próximo dia útil é a melhor opção.';
  } else if (foraDoPeriodo) {
    disponibilidade = hora >= 19
      ? 'Já passou das 19h — não há mais reuniões hoje. Sugira horários para amanhã (se dia útil) ou próximo dia útil.'
      : 'Ainda não são 8h — sugira horários a partir das 8h de hoje.';
  } else {
    const proximaHora = hora + 1;
    disponibilidade = `Horários disponíveis hoje: ${proximaHora}h até 19h. Amanhã também é uma boa opção.`;
  }

  return `\n\nCONTEXTO ATUAL (use para sugerir horários de reunião):
- Data: ${data} (${diaSemana})
- Hora atual: ${hora}:${minutos}
- ${disponibilidade}
- Regras: reuniões apenas de segunda a sexta, das 8h às 19h. NUNCA sugira horários passados ou fora desse período.`;
}

// ─── LID Resolution ─────────────────────────────────────────────────────────

export async function resolveLidToPhone(
  client: EvolutionApiClient,
  lid: string,
  pushName: string,
): Promise<string | null> {
  if (lidCache[lid]) return lidCache[lid];

  try {
    const contacts = await client.findContacts();
    const lidContact = contacts.find((c) => c.id === lid);
    if (!lidContact) return null;

    const match = contacts.find((c) =>
      c.id.includes('@s.whatsapp.net') &&
      c.id !== lid &&
      (
        (lidContact.profilePictureUrl && c.profilePictureUrl === lidContact.profilePictureUrl) ||
        (c.pushName && lidContact.pushName && c.pushName === lidContact.pushName)
      ),
    );

    if (match) {
      const phone = match.id.replace('@s.whatsapp.net', '');
      lidCache[lid] = phone;
      console.log(`[Bot] LID ${lid} resolvido para ${phone} (${match.pushName})`);
      return phone;
    }

    console.warn(`[Bot] Não encontrou número real para LID ${lid} (${pushName})`);
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Bot] Erro ao resolver LID:`, message);
    return null;
  }
}

// ─── Send Bot Messages ──────────────────────────────────────────────────────

export async function sendBotMessages(
  client: EvolutionApiClient,
  phone: string,
  reply: string,
): Promise<void> {
  let parts = reply.split('---').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length === 1) {
    parts = reply.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  }
  if (parts.length === 1) {
    parts = reply.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map((p) => p.trim()).filter((p) => p.length > 0);
  }

  for (const part of parts) {
    await client.sendText(phone, part);
    if (parts.length > 1) {
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  console.log(`[Bot] Enviou ${parts.length} mensagem(ns) para ${phone}`);
}

// ─── AI Response ────────────────────────────────────────────────────────────

export async function getAIResponse(
  history: ChatMessage[],
  pushName: string,
  meetingLink?: string | null,
): Promise<string> {
  const basePrompt = await getSystemPrompt();
  let systemMessage = basePrompt + getCurrentContext();
  if (pushName) systemMessage += `\n\nO nome do cliente é ${pushName}.`;
  if (meetingLink) systemMessage += `\nLink para agendamento: ${meetingLink}`;

  const openai = await getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMessage },
      ...history,
    ],
    max_tokens: 300,
    temperature: 0.7,
  });

  return completion.choices[0].message.content || '';
}

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
    const base64 = (data.message as Record<string, unknown>).base64 as string | undefined
      || message.base64 as string | undefined;
    if (base64) {
      try {
        const transcribed = await transcribeAudio(base64);
        if (transcribed) {
          text = transcribed;
          console.log(`[Bot] Áudio transcrito de ${remoteJid}: "${text}"`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Bot] Falha na transcrição de áudio:', msg);
        return;
      }
    }
  }

  if (!text) return;

  const pushName = data.pushName || '';

  // Resolve phone number
  let phone: string;
  const client = await EvolutionApiClient.fromDB();

  if (remoteJid.includes('@lid')) {
    const resolved = await resolveLidToPhone(client, remoteJid, pushName);

    if (!resolved && payload.sender && payload.sender.includes('@s.whatsapp.net')) {
      phone = payload.sender.replace('@s.whatsapp.net', '');
      console.log(`[Bot] LID resolvido via sender: ${phone}`);
    } else if (!resolved) {
      console.warn(`[Bot] LID não resolvido para ${pushName} — mensagem ignorada`);
      return;
    } else {
      phone = resolved;
    }
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '');
  }

  console.log(`[Bot] Mensagem de ${phone} (${pushName}): "${text}"`);

  // Get or create conversation
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone },
    include: {
      followUpState: true,
    },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phone,
        pushName: pushName || null,
      },
      include: {
        followUpState: true,
      },
    });
  } else if (pushName && conversation.pushName !== pushName) {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { pushName },
      include: { followUpState: true },
    });
  }

  // conversation is always defined at this point (findUnique or create)
  if (!conversation) throw new Error('Unexpected: conversation is null');

  // Create incoming message record
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      sender: MessageSender.CLIENT,
      text: text,
    },
  });

  // Update follow-up state: client responded
  if (conversation.followUpState) {
    await prisma.whatsAppFollowUpState.update({
      where: { id: conversation.followUpState.id },
      data: { respondedSinceLastBot: true },
    });
  }

  // Build AI history from DB (capped at 20)
  const aiHistory = await prisma.whatsAppAIHistory.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  const history: ChatMessage[] = aiHistory.map((h) => ({
    role: h.role as 'user' | 'assistant',
    content: h.content,
  }));

  // Add current message to history
  history.push({ role: 'user', content: text });

  try {
    const reply = await getAIResponse(history, pushName, config.meetingLink);

    // Save bot message
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        text: reply,
      },
    });

    // Save AI history entries (user + assistant)
    await prisma.whatsAppAIHistory.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: text,
      },
    });
    await prisma.whatsAppAIHistory.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
      },
    });

    // Cap history at 20 entries
    const totalHistory = await prisma.whatsAppAIHistory.count({
      where: { conversationId: conversation.id },
    });
    if (totalHistory > 20) {
      const toDelete = await prisma.whatsAppAIHistory.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: totalHistory - 20,
        select: { id: true },
      });
      await prisma.whatsAppAIHistory.deleteMany({
        where: { id: { in: toDelete.map((h) => h.id) } },
      });
    }

    // Update follow-up state
    const followUpData = {
      lastBotMessageAt: new Date(),
      respondedSinceLastBot: false,
      followUpCount: 0,
    };

    if (conversation.followUpState) {
      await prisma.whatsAppFollowUpState.update({
        where: { id: conversation.followUpState.id },
        data: followUpData,
      });
    } else {
      await prisma.whatsAppFollowUpState.create({
        data: {
          conversationId: conversation.id,
          ...followUpData,
        },
      });
    }

    // Update conversation timestamp
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    // Send messages via Evolution API
    await sendBotMessages(client, phone, reply);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Bot] Erro:`, errMsg);

    const fallback = `Oi${pushName ? `, ${pushName}` : ''}! Obrigada pelo contato com a *Bertuzzi Patrimonial*! No momento estou com uma instabilidade, mas um consultor vai te atender em breve.`;

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        text: fallback,
      },
    });

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { needsHumanAttention: true },
    });

    await client.sendText(phone, fallback);
  }
}
