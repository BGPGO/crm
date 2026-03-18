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

export const DEFAULT_SYSTEM_PROMPT = `Você é a Bia, SDR da Bertuzzi Patrimonial. Atende pelo WhatsApp como uma pessoa real — sua META é agendar uma reunião de Diagnóstico Financeiro com o consultor.

FORMATO OBRIGATÓRIO: Separe cada mensagem com ---. Cada bloco entre --- será enviado como mensagem separada no WhatsApp. NUNCA use --- dentro de uma mesma mensagem.

FUNIL SDR — siga essas etapas naturalmente na conversa:
1. CONEXÃO: Cumprimente, crie rapport rápido, entenda o contexto básico do lead
2. QUALIFICAÇÃO: Descubra empresa, cargo, dor atual e ferramenta que usam hoje
3. INTERESSE: Apresente o benefício mais relevante à dor identificada, crie urgência leve
4. AGENDAMENTO: Proponha a reunião de forma direta — "que tal uma conversa rápida de 45 minutinhos pra fazer um diagnóstico financeiro?"

REGRA PRINCIPAL: A partir da 3ª troca de mensagens com engajamento positivo, comece a encaminhar para o agendamento. Não espere o cliente pedir. SDR bom é proativo.

HORÁRIOS DE REUNIÃO:
- Horário comercial: segunda a sexta, 9h às 17h (horário de Brasília)
- Duração da reunião: 45 minutos (Diagnóstico Financeiro BGP)
- A última reunião do dia começa às 16:15 (termina às 17h)
- NÃO sugira horários antes das 9h, depois das 16:15, nem em fins de semana
- Se o lead pedir horário fora do comercial, diga que só tem horário comercial e envie o link do Calendly para ele escolher

AGENDAMENTO — quando o cliente aceitar a reunião:
- SEMPRE envie o link de agendamento em uma mensagem SEPARADA (entre ---)
- O link deve ser a ÚNICA coisa na mensagem separada, sem texto antes ou depois
- Exemplo correto:
  Perfeito! Vou te mandar o link pra você escolher o melhor horário 😊
  ---
  {meetingLink}
  ---
  Qualquer dúvida sobre o agendamento me avisa!
- Se não houver link configurado, combine dia e horário diretamente e confirme
- Após enviar o link ou combinar horário, confirme o agendamento e se despeça de forma simpática

TRATAMENTO DE OBJEÇÕES:
- "Não tenho tempo" → "São só 45 minutinhos, você tem hoje às X ou amanhã às Y?"
- "Já tenho solução" → "Que solução vocês usam hoje? Muitos clientes nossos vieram de lá exatamente porque..."
- "Me manda mais informações" → Manda 1 dado concreto + "mas fica muito mais claro ao vivo, consigo mostrar em 45 min"
- "Quanto custa?" → Dá o range de valores + propõe a demo pra entender o que faz mais sentido
- "Não tenho interesse" / "Não quero" → Agradeça, se despeça educadamente e encerre. NÃO insista.

REGRAS DE ESCRITA:
- Cada mensagem (entre ---) deve ter NO MÁXIMO 1-2 linhas
- Comece sempre com uma mensagem curta e pessoal (ex: "Claro!", "Faz sentido!", "Boa pergunta!")
- Mande entre 2 a 4 mensagens por vez, não mais que isso
- Escreva como alguém digitando rápido no WhatsApp
- Máximo 1 emoji por mensagem, só de vez em quando
- Sem listas, sem bullet points, sem blocos de texto
- Use *negrito* só pra 1 palavra-chave no máximo
- Termine sempre com uma pergunta para manter o papo fluindo
- NUNCA invente informações que você não tem. Se não sabe, diga que o consultor pode explicar melhor na demo.

Sobre a empresa:
- Bertuzzi Patrimonial — soluções financeiras para empresas
- GoBI: dashboards de BI com indicadores financeiros em tempo real, integra com ERPs, acesso mobile — a partir de R$397/mês
- GoControladoria: controladoria financeira, orçamento, DRE gerencial, compliance, KPIs — a partir de R$1.997/mês
- Valores variam conforme personalização — sempre direcione para a demo para entender a solução mais adequada

Seu KPI é reunião agendada. Cada conversa deve caminhar para isso.`;

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

  let disponibilidade: string;
  if (fimDeSemana) {
    disponibilidade = 'Hoje é fim de semana — não há reuniões disponíveis. O próximo dia útil é a melhor opção.';
  } else if (foraDoPeriodo) {
    disponibilidade = hora >= 17
      ? 'Já passou das 17h — não há mais reuniões hoje. Sugira horários para amanhã (se dia útil) ou próximo dia útil.'
      : 'Ainda não são 9h — sugira horários a partir das 9h de hoje.';
  } else if (hora >= 16 && parseInt(minutos) > 15) {
    disponibilidade = 'Já passou das 16:15 — a última reunião de hoje já começou (45min). Sugira horários para amanhã ou próximo dia útil.';
  } else {
    const proximaHora = hora < 9 ? 9 : hora + 1;
    const ultimoSlot = '16:15';
    disponibilidade = `Horários disponíveis hoje: ${proximaHora}h até ${ultimoSlot} (última reunião do dia). Amanhã também é uma boa opção.`;
  }

  // Try to enrich with real Calendly availability
  let slotsInfo = '';
  try {
    const { getNextAvailableSlots } = await import('./calendlyAvailability');
    slotsInfo = await getNextAvailableSlots(3);
    if (slotsInfo) {
      slotsInfo = `\n- ${slotsInfo}`;
    }
  } catch {
    // Calendly service not available — use generic info
  }

  return `\n\nCONTEXTO ATUAL (use para sugerir horários de reunião):
- Data: ${data} (${diaSemana})
- Hora atual: ${hora}:${minutos}
- ${disponibilidade}${slotsInfo}
- Regras: reuniões apenas de segunda a sexta, das 9h às 17h (última reunião às 16:15, duração 45min). NUNCA sugira horários passados ou fora desse período.`;
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
    // Z-API sends audio as a URL; Evolution sent base64 inline
    const audioUrl = message.audioMessage?.audioUrl || message.audioUrl;
    const base64 = (data.message as Record<string, unknown>).base64 as string | undefined
      || message.base64 as string | undefined;

    let audioBase64: string | undefined;
    if (audioUrl) {
      try {
        audioBase64 = await downloadAudioAsBase64(audioUrl);
        console.log(`[Bot] Áudio baixado de URL para transcrição (${remoteJid})`);
      } catch (dlErr: unknown) {
        const dlMsg = dlErr instanceof Error ? dlErr.message : String(dlErr);
        console.error('[Bot] Falha ao baixar áudio da URL:', dlMsg);
      }
    }
    if (!audioBase64 && base64) {
      audioBase64 = base64;
    }

    if (audioBase64) {
      try {
        const transcribed = await transcribeAudio(audioBase64);
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

  // Resolve phone number from remoteJid
  let phone: string;
  const client = await EvolutionApiClient.fromDB();

  const botConfig = await prisma.whatsAppConfig.findFirst({ select: { botPhoneNumber: true } });
  const botPhone = botConfig?.botPhoneNumber || null;

  // Z-API handles LID addresses natively — just extract the identifier
  if (remoteJid.includes('@lid')) {
    phone = remoteJid.replace('@lid', '');
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '');
  }

  // Never reply to ourselves
  if (botPhone && phone === botPhone) {
    console.log(`[Bot] Ignorando mensagem do próprio bot (${phone})`);
    return;
  }

  console.log(`[Bot] Mensagem de ${phone} (${pushName}): "${text}"`);

  // If conversation exists and is in human attention mode, don't respond with bot
  const existingConv = await prisma.whatsAppConversation.findUnique({
    where: { phone },
  });
  if (existingConv?.needsHumanAttention) {
    // Still save the message but don't generate AI response
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: existingConv.id,
        sender: MessageSender.CLIENT,
        text: text,
      },
    });
    await prisma.whatsAppConversation.update({
      where: { id: existingConv.id },
      data: { lastMessageAt: new Date() },
    });
    console.log(`[Bot] Conversation ${phone} is in human mode — not responding`);
    return;
  }

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

  // Check if Evolution API is actually connected before generating a response
  try {
    const connStatus = await client.getInstanceStatus();
    const state = connStatus?.instance?.state;
    if (state !== 'open' && state !== 'connected') {
      console.warn(`[Bot] WhatsApp not connected (state: ${state}) — saving message but not responding`);
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
      return;
    }
  } catch (connErr) {
    console.warn(`[Bot] Cannot check connection status — skipping response`);
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    return;
  }

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

    // Send messages via WhatsApp API
    await sendBotMessages(client, phone, reply);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Bot] Erro:`, errMsg);

    // Check if it's a WhatsApp API send error vs AI error
    const isApiError = errMsg.includes('ECONNREFUSED') ||
      errMsg.includes('z-api') ||
      errMsg.includes('evolution') ||
      errMsg.includes('401') ||
      errMsg.includes('404') ||
      errMsg.includes('sendText');

    if (isApiError) {
      // Connection/send issue — mark messages as not delivered, don't escalate to human
      console.warn(`[Bot] WhatsApp API error — marking messages as undelivered`);
      await prisma.whatsAppMessage.updateMany({
        where: { conversationId: conversation.id, sender: 'BOT', delivered: true },
        data: { delivered: false },
      });
      return;
    }

    // AI or other error — fallback to human
    const fallback = `Oi${pushName ? `, ${pushName}` : ''}! Obrigada pelo contato com a *Bertuzzi Patrimonial*! No momento estou com uma instabilidade, mas um consultor vai te atender em breve.`;

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        sender: MessageSender.BOT,
        text: fallback,
        delivered: false,
      },
    });

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { needsHumanAttention: true },
    });

    // Auto-tag "Atendimento Humano"
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

    // Don't try to send fallback since WhatsApp API is likely down anyway
  }
}
