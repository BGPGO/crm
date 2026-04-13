import OpenAI from 'openai';
import axios from 'axios';
import prisma from '../lib/prisma';
import { EvolutionApiClient } from './evolutionApiClient';
import { transcribeAudio } from './audioTranscriber';
import { MessageSender } from '@prisma/client';
import { scheduleNextFollowUp, cancelFollowUp } from './followUpScheduler';
import { normalizePhone, phoneVariants } from '../utils/phoneNormalize';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the best contact for a phone number.
 * Prefers contact with an OPEN deal; falls back to any contact with that phone.
 */
async function findBestContactByPhone(phoneVariants: string[]): Promise<{ id: string } | null> {
  const contacts = await prisma.contact.findMany({
    where: { phone: { in: phoneVariants } },
    select: { id: true },
  });
  if (contacts.length === 0) return null;
  if (contacts.length === 1) return contacts[0];

  // Multiple contacts with same phone — prefer the one with an OPEN deal
  const withOpenDeal = await prisma.deal.findFirst({
    where: { contactId: { in: contacts.map(c => c.id) }, status: 'OPEN' },
    select: { contactId: true },
    orderBy: { updatedAt: 'desc' },
  });

  return withOpenDeal ? { id: withOpenDeal.contactId! } : contacts[0];
}

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
- Envie o link do Calendly em mensagem SEPARADA (entre ---), SOZINHO, sem texto antes ou depois, SEM markdown
- NUNCA use formato [texto](url). Mande APENAS a URL pura.
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

// ─── Default blocks (used when DB fields are empty) ──────────────────────────

const DEFAULT_CONVERSATION_RULES = `REGRAS DE OURO:
- Mensagens CURTAS. Máximo 1 linha por mensagem. Escreva como quem digita rápido no WhatsApp.
- Seja DIRETA. Entenda a dor do lead e encaminhe pra reunião. Sem enrolação.
- A partir da 2ª troca, já direcione para o agendamento.
- NUNCA mande parágrafos longos. Se a mensagem tem mais de 2 linhas, quebre com ---.

ESCRITA:
- Máximo 1 linha por mensagem entre ---
- Máximo 1 emoji por mensagem, esporádico
- Sem listas, sem bullets, sem blocos de texto
- Nunca invente informações`;

const DEFAULT_FUNNEL = `FUNIL:
1. Cumprimente + pergunte sobre a empresa/dor (1 mensagem curta)
2. Entendeu a dor? Conecte com o produto certo e proponha reunião
3. Envie o link do Calendly

AGENDAMENTO:
- Envie o link do Calendly em mensagem SEPARADA (entre ---), SOZINHO, sem texto antes ou depois, SEM markdown
- NUNCA use formato [texto](url). Mande APENAS a URL pura.
- NUNCA sugira horários. O lead escolhe pelo link.
- O link é enviado NO MÁXIMO 1 VEZ. Depois, vire suporte — responda dúvidas sem reenviar.
- Se o lead pedir o link de novo → mande. Senão, não repita.`;

const DEFAULT_OBJECTIONS = `OBJEÇÕES (respostas curtas):
- "Não tenho tempo" → "São 45 minutinhos! Te mando o link pra encaixar na agenda"
- "Já tenho solução" → "Qual usam hoje?" + diferencial rápido
- "Manda info" → 1 dado concreto + "fica mais claro ao vivo, 45 min"
- "Quanto custa?" → Range + "depende do cenário, na reunião definimos certinho"
- "Não quero" → Agradeça e encerre. NÃO insista.`;

// ─── Dynamic prompt builder ───────────────────────────────────────────────────

async function buildPromptFromBlocks(): Promise<string> {
  const config = await prisma.whatsAppConfig.findFirst({
    include: {
      botProducts: { where: { isActive: true }, orderBy: { order: 'asc' } },
      botObjections: { orderBy: { order: 'asc' } },
    },
  });

  const botName = config?.botName || 'Bia';
  const botCompany = config?.botCompany || 'Bertuzzi Patrimonial';

  let prompt = `Você é a ${botName}, SDR da ${botCompany}. SEMPRE se apresente como ${botName} na primeira mensagem. Atende pelo WhatsApp como pessoa real — sua META é agendar uma reunião de Diagnóstico Financeiro.\n\n`;
  prompt += `FORMATO: Separe mensagens com ---. Cada bloco entre --- vira uma mensagem separada no WhatsApp. Mande 2-3 mensagens curtas por vez.\n\n`;
  prompt += (config?.conversationRules?.trim() || DEFAULT_CONVERSATION_RULES) + '\n\n';
  prompt += (config?.funnelInstructions?.trim() || DEFAULT_FUNNEL) + '\n\n';

  if (config?.botObjections && config.botObjections.length > 0) {
    prompt += `OBJEÇÕES (respostas curtas):\n`;
    for (const o of config.botObjections) {
      prompt += `- "${o.objection}" → "${o.response}"\n`;
    }
    prompt += '\n';
  } else {
    prompt += DEFAULT_OBJECTIONS + '\n\n';
  }

  if (config?.botProducts && config.botProducts.length > 0) {
    prompt += `EMPRESA:\n- ${botCompany} — soluções financeiras para empresas\n`;
    for (const p of config.botProducts) {
      let line = `- ${p.name}`;
      if (p.priceRange) line += ` — ${p.priceRange}`;
      prompt += line + '\n';
      if (p.description) prompt += `  ${p.description}\n`;
      if (p.differentials) prompt += `  Diferenciais: ${p.differentials}\n`;
      if (p.targetAudience) prompt += `  Para: ${p.targetAudience}\n`;
    }
    prompt += '\n';
  } else {
    prompt += `EMPRESA:\n- ${botCompany} — soluções financeiras para empresas\n- GoBI: BI financeiro, dashboards, integra ERPs — a partir de R$397/mês\n- GoControladoria: controladoria, DRE, compliance — a partir de R$1.997/mês\n- Valores variam — direcione pra demo\n\n`;
  }

  prompt += `KPI: reunião agendada. Seja prática, rápida e humana.`;
  return prompt;
}

async function getSystemPrompt(): Promise<string> {
  const config = await prisma.whatsAppConfig.findFirst();
  // Modo avançado: botSystemPrompt preenchido → usa diretamente
  if (config?.botSystemPrompt?.trim()) return config.botSystemPrompt;
  // Modo estruturado: monta dos blocos configurados
  return buildPromptFromBlocks();
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

  // Extract meeting URL from any format the AI might produce
  function extractMeetingUrl(text: string): string | null {
    // Markdown link: [text](url)
    const mdMatch = text.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) return mdMatch[1];
    // Any URL in the text
    const urlMatch = text.match(/(https?:\/\/[^\s),]+)/);
    if (urlMatch) return urlMatch[1];
    return null;
  }

  // Strip URL/markdown from text to get clean message
  function stripUrl(text: string): string {
    return text
      .replace(/\[.*?\]\(https?:\/\/[^\s)]+\)/g, '')  // Remove markdown links
      .replace(/https?:\/\/[^\s),]+/g, '')              // Remove raw URLs
      .replace(/[.\s]+$/g, '')                           // Remove trailing dots/spaces
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  for (const part of parts) {
    const url = extractMeetingUrl(part);
    if (url) {
      // Part contains a URL — send clean text (if any) + link
      const cleanText = stripUrl(part);
      if (cleanText && cleanText.length > 2) {
        await client.sendText(phone, cleanText);
        await new Promise((r) => setTimeout(r, 1500));
      }
      // Send the link as plain text (buttons are unreliable on WhatsApp)
      await client.sendText(phone, url);
    } else {
      await client.sendText(phone, part);
    }
    if (parts.length > 1) {
      const delay = Math.min(1500 + part.length * 50, 5000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.log(`[Bot] Enviou ${parts.length} mensagem(ns) para ${phone}`);
}

// ─── Meeting Link Guarantee ─────────────────────────────────────────────────
// If the AI suggests a meeting but forgets the link, send it automatically

const MEETING_INTENT_REGEX = /agend|reuni[aã]o|marcar\b|hor[aá]rio|diagn[oó]stico|vou te (mandar|enviar)|te (mando|envio)|link|bora combinar|vamos combinar/i;
const URL_REGEX = /https?:\/\/[^\s),]+/;

/** Append UTM params to a Calendly URL without duplicating existing params. */
function appendUtms(url: string, params: Record<string, string>): string {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (!parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, value);
      }
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

export async function ensureMeetingLink(
  client: { sendText: (phone: string, text: string) => Promise<unknown> },
  phone: string,
  aiReply: string,
): Promise<void> {
  // Only act if AI has meeting intent but no URL in the reply
  if (!MEETING_INTENT_REGEX.test(aiReply)) return;
  if (URL_REGEX.test(aiReply)) return;

  const config = await prisma.whatsAppConfig.findFirst();
  const meetingLink = config?.meetingLink;
  if (!meetingLink) return;

  // Tag as SDR IA origin
  const taggedLink = appendUtms(meetingLink, { utm_source: 'sdr_ia', utm_medium: 'waba' });

  await new Promise(r => setTimeout(r, 2000));
  await client.sendText(phone, taggedLink);
  console.log(`[Bot] Link do Calendly enviado automaticamente (IA mencionou reunião sem link)`);
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

  // If there's already conversation history (prior assistant messages),
  // override the "always introduce yourself" instruction to avoid re-introductions
  const hasAssistantHistory = history.some(m => m.role === 'assistant');
  if (hasAssistantHistory) {
    systemMessage = systemMessage.replace(
      /SEMPRE se apresente como Bia na primeira mensagem\.?/i,
      'Você já está em contato com este lead. NÃO se apresente novamente. NÃO diga "sou a Bia" ou "aqui é a Bia". Continue a conversa de forma natural.'
    );
  }
  if (pushName) systemMessage += `\n\nO nome do cliente é ${pushName}. Use o primeiro nome dele na conversa.`;
  if (meetingLink) systemMessage += `\n\nLINK DE AGENDAMENTO (use exatamente este): ${meetingLink}\nREGRA ABSOLUTA: quando enviar o link, cole EXATAMENTE "${meetingLink}" sozinho em uma mensagem. NUNCA use markdown [texto](url). NUNCA escreva "calendly.com" genérico. SEMPRE o link completo acima.`;
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

  let reply = completion.choices[0].message.content || '';

  // Sanitize: replace markdown links [text](url) with just the URL
  // Also replace generic "calendly.com" with the actual meeting link
  if (meetingLink) {
    reply = reply.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, _text, url) => {
      // If the URL contains "calendly", use the real meeting link
      if (url.toLowerCase().includes('calendly')) return meetingLink;
      return url; // For non-calendly links, just use the raw URL
    });
    // Replace bare "calendly.com" references that aren't the full link
    reply = reply.replace(/(?<!\S)calendly\.com(?!\S)/gi, meetingLink);
  }

  return reply;
}

// ─── Debounce Map ──────────────────────────────────────────────────────────
// Waits 25s after last message before responding, so multiple messages get batched
const DEBOUNCE_MS = 25 * 1000;
const pendingResponses = new Map<string, NodeJS.Timeout>();

// ─── Main Handler ───────────────────────────────────────────────────────────

export async function handleMessage(payload: WhatsAppPayload, instance: string): Promise<void> {
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
      }
    }
  }

  // For non-text messages (images, stickers, videos), use a placeholder
  if (!text) text = '[mídia recebida]';

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

  // Normalize to canonical format (55 + DDD + 9 + 8 digits)
  phone = normalizePhone(phone);

  if (botPhone && phone === normalizePhone(botPhone)) return;

  console.log(`[Bot] Mensagem de ${phone} (${pushName}): "${text}"`);

  // ── ALWAYS save client message, even if bot is disabled ──────────────

  // Get or create conversation — search both phone variants (with/without 9)
  // to find existing conversations that may have been stored in the old format
  const variants = phoneVariants(phone);
  let conversation = await prisma.whatsAppConversation.findFirst({
    where: { phone: { in: variants } },
    include: { followUpState: true },
  });

  const isNewConversation = !conversation;

  if (!conversation) {
    // Try to link to an existing contact by phone — prefer one with OPEN deal
    const linkedContact = await findBestContactByPhone(variants);
    conversation = await prisma.whatsAppConversation.create({
      data: { phone, pushName: pushName || null, contactId: linkedContact?.id || null },
      include: { followUpState: true },
    });
  } else {
    // Migrate phone to normalized format if stored in old format
    const updates: Record<string, unknown> = {};
    if (conversation.phone !== phone) updates.phone = phone;
    if (pushName && conversation.pushName !== pushName) updates.pushName = pushName;
    // Link to contact if not already linked, or re-link if current contact has no OPEN deal
    if (!conversation.contactId) {
      const linkedContact = await findBestContactByPhone(variants);
      if (linkedContact) updates.contactId = linkedContact.id;
    } else {
      // Check if current contact still has an OPEN deal, otherwise find a better one
      const currentDeal = await prisma.deal.findFirst({
        where: { contactId: conversation.contactId, status: 'OPEN' },
        select: { id: true },
      });
      if (!currentDeal) {
        const betterContact = await findBestContactByPhone(variants);
        if (betterContact && betterContact.id !== conversation.contactId) {
          updates.contactId = betterContact.id;
          console.log(`[Bot] Re-linking conversa ${conversation.id} de contato ${conversation.contactId} para ${betterContact.id} (deal ativo)`);
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      conversation = await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: updates,
        include: { followUpState: true },
      });
    }
  }
  if (!conversation) throw new Error('Unexpected: conversation is null');

  // Save message to DB instantly — ALWAYS, regardless of bot status
  await prisma.whatsAppMessage.create({
    data: { conversationId: conversation.id, sender: MessageSender.CLIENT, text },
  });

  // Update timestamps
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), updatedAt: new Date() },
  });

  // ── If bot disabled or human attention mode, stop here (msg already saved) ──
  const config = await prisma.whatsAppConfig.findFirst();
  if (!config || !config.botEnabled) return;

  if (conversation.needsHumanAttention) return;

  // ── Send welcome message on brand-new conversations ──────────────────────
  if (isNewConversation && config.welcomeMessage?.trim()) {
    try {
      const welcomeClient = await EvolutionApiClient.fromDB();
      await sendBotMessages(welcomeClient, phone, config.welcomeMessage.trim());
      await prisma.whatsAppMessage.create({
        data: { conversationId: conversation.id, sender: MessageSender.BOT, text: config.welcomeMessage.trim() },
      });
      console.log(`[Bot] Mensagem de boas-vindas enviada para ${phone}`);
    } catch (err) {
      console.error('[Bot] Erro ao enviar boas-vindas:', err instanceof Error ? err.message : err);
    }
  }

  // Update follow-up state: client responded
  if (conversation.followUpState) {
    await prisma.whatsAppFollowUpState.update({
      where: { id: conversation.followUpState.id },
      data: { respondedSinceLastBot: true },
    });
    // Cancel any scheduled follow-up since lead responded
    cancelFollowUp(conversation.id);
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

        // Fire automation triggers (cancels old cadence + may start new one)
        import('./automationTriggerListener').then(({ onStageChanged }) => {
          onStageChanged(conversation.contactId!, STAGE_MARCAR_REUNIAO, deal.id);
        }).catch(() => {});
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
    include: { followUpState: true, contact: { select: { name: true } } },
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
    // ── Build deal context for the AI ──────────────────────────────────────
    let dealContext = '';
    if (conversation.contactId) {
      const deal = await prisma.deal.findFirst({
        where: { contactId: conversation.contactId, status: 'OPEN' },
        include: {
          stage: { select: { name: true } },
          organization: { select: { name: true } },
          contact: { select: { name: true } },
        },
      });
      if (deal) {
        const stageName = deal.stage?.name || 'Desconhecida';
        dealContext += `\n\n=== CONTEXTO DA NEGOCIAÇÃO ===`;
        if (deal.contact?.name) {
          dealContext += `\nNome do lead no CRM: ${deal.contact.name}`;
        }
        dealContext += `\nEmpresa: ${deal.organization?.name || deal.title}`;
        dealContext += `\nEtapa atual: ${stageName}`;

        if (conversation.meetingBooked || stageName.toLowerCase().includes('reunião agendada')) {
          dealContext += `\nREUNIÃO JÁ MARCADA. NÃO tente marcar outra reunião. Apenas confirme que está tudo certo e aguarde o dia da reunião. Seja cordial e tire dúvidas se o lead perguntar algo.`;
        } else if (stageName.toLowerCase().includes('proposta')) {
          dealContext += `\nProposta já foi enviada. Pergunte se o lead tem dúvidas sobre a proposta e reforce o valor do serviço.`;
        } else if (stageName.toLowerCase().includes('aguardando dados')) {
          dealContext += `\nO lead está na fase de aguardando dados/documentos. Pergunte se precisa de ajuda para enviar os dados pendentes.`;
        } else if (stageName.toLowerCase().includes('aguardando assinatura')) {
          dealContext += `\nO contrato já foi enviado. Pergunte se precisa de alguma orientação para assinar o documento.`;
        }
      }
    }

    // Prefer CRM contact name over WhatsApp pushName (pushName can be a nickname/wrong name)
    const contactName = conversation.contact?.name || pushName;
    const reply = await getAIResponse(history, contactName, config.meetingLink, dealContext || undefined);

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
    const followUpData: Record<string, any> = { lastBotMessageAt: new Date(), respondedSinceLastBot: false };
    if (conversation.followUpState) {
      await prisma.whatsAppFollowUpState.update({ where: { id: conversation.followUpState.id }, data: followUpData });
    } else {
      await prisma.whatsAppFollowUpState.create({ data: { conversationId, ...followUpData } });
    }

    // Schedule event-driven follow-up
    scheduleNextFollowUp(conversationId).catch(console.error);

    // Update conversation
    await prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), lastMessageAt: new Date() },
    });

    // Send
    await sendBotMessages(client, phone, reply);
    await ensureMeetingLink(client, phone, reply);

    // Register bot response in daily volume — WhatsApp counts ALL messages, not just proactive
    const { registerSent: regSent } = await import('./dailyLimitService');
    await regSent('botResponse').catch(() => {});
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
