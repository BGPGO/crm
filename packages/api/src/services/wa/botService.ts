/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WaBotService — Bot IA para WhatsApp Cloud API (API Oficial da Meta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Port do whatsappBot.ts adaptado para o novo módulo Cloud API.
 * Usa WaConversation/WaMessage/WaAIHistory (não WhatsAppConversation/etc).
 * Envia via WaMessageService (não EvolutionApiClient).
 * Suporta mensagens interativas (botões e listas).
 *
 * Lógica:
 *   - Prompt building por blocos (buildPromptFromBlocks)
 *   - Debounce de 25s
 *   - Split por \n\n (double newline) para múltiplas mensagens
 *   - CTA URL button para link de agendamento (Calendly)
 *   - Delay entre mensagens (1.5s + 50ms/char)
 *   - Histórico IA com cap de 20
 *   - Opt-out e cold contact checks
 * ═══════════════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import prisma from '../../lib/prisma';
import { WaMessageService } from './messageService';
import { WindowService } from './windowService';
import { WhatsAppCloudClient } from '../whatsappCloudClient';

// ─── Debounce ────────────────────────────────────────────────────────────────

const debounceMap = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 25_000;

// ─── Meeting Intent Detection ────────────────────────────────────────────────

const MEETING_INTENT_REGEX =
  /agend|reuni[aã]o|marcar\b|hor[aá]rio|diagn[oó]stico|vou te (mandar|enviar)|te (mando|envio)|link|bora combinar|vamos combinar/i;
const URL_REGEX = /https?:\/\/[^\s),]+/;
const MEETING_BUTTON_REGEX =
  /reuni[ãa]o|agenda|calendly|marcar|horário|disponibilidade/i;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── Default Prompt Blocks ───────────────────────────────────────────────────

const DEFAULT_CONVERSATION_RULES = `COMO CONVERSAR:
- Converse como uma pessoa real no WhatsApp. Seja natural, simpática, direta.
- Leia o que o lead disse e responda de acordo. Se ele fez uma pergunta, responda primeiro.
- Não force o agendamento logo. Primeiro entenda o que ele precisa, depois conecte com a reunião.
- Mensagens curtas e naturais (1-3 linhas). Uma mensagem por vez.
- Use emojis com moderação (1 por mensagem, no máximo).
- NUNCA mande textão. Se tem mais de 3 linhas, quebre em parágrafos separados (pule uma linha entre eles).
- Adapte o tom ao lead: se ele é formal, seja formal. Se é descontraído, seja leve.
- Nunca invente informações.`;

const DEFAULT_FUNNEL = `FLUXO DA CONVERSA:
1. Lead mandou mensagem → Leia o contexto, responda naturalmente
2. Se é a primeira interação → Se apresente brevemente e pergunte como pode ajudar
3. Entendeu a necessidade → Conecte com o produto certo (GoBI ou GoControladoria)
4. Lead demonstra interesse → Sugira a reunião de Diagnóstico Financeiro
5. Lead quer agendar → Responda "Vou te mandar o link pra agendar!" (SEM enviar URL no texto)

SOBRE O AGENDAMENTO:
- NÃO envie link de URL no texto da mensagem. O sistema vai enviar um botão clicável automaticamente.
- Quando sugerir agendar, use frases como "Posso te mandar o link?", "Vou te enviar pra agendar"
- O link é enviado NO MÁXIMO 1 VEZ automaticamente pelo sistema. Não se preocupe em enviar.
- Se o lead pedir link de novo, diga "Vou te mandar!" que o sistema cuida.

IMPORTANTE:
- Se o lead diz algo pessoal/off-topic, responda brevemente e volte pro assunto com naturalidade
- Se o lead diz "não quero" ou demonstra desinteresse → agradeça e encerre. NÃO insista.
- Se o lead tem dúvidas sobre preço → dê o range e diga que na reunião definem certinho`;

const DEFAULT_OBJECTIONS = `OBJEÇÕES (respostas curtas):
- "Não tenho tempo" → "São 45 minutinhos! Te mando o link pra encaixar na agenda"
- "Já tenho solução" → "Qual usam hoje?" + diferencial rápido
- "Manda info" → 1 dado concreto + "fica mais claro ao vivo, 45 min"
- "Quanto custa?" → Range + "depende do cenário, na reunião definimos certinho"
- "Não quero" → Agradeça e encerre. NÃO insista.`;

// ─── OpenAI Client ───────────────────────────────────────────────────────────

async function getOpenAIClient(): Promise<OpenAI> {
  const config = await prisma.whatsAppConfig.findFirst();
  const key = config?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('[WaBot] OpenAI API Key não configurada');
  return new OpenAI({ apiKey: key });
}

// ─── Prompt Builder ──────────────────────────────────────────────────────────

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
  prompt += `FORMATO: Responda em 1-3 frases curtas e naturais. Se precisar separar em mais de uma mensagem, pule uma linha entre elas (linha em branco). NÃO envie URLs no texto — o sistema envia botões clicáveis automaticamente.\n\n`;
  prompt += (config?.conversationRules?.trim() || DEFAULT_CONVERSATION_RULES) + '\n\n';
  prompt += (config?.funnelInstructions?.trim() || DEFAULT_FUNNEL) + '\n\n';

  // Objections
  if (config?.botObjections && config.botObjections.length > 0) {
    prompt += `OBJEÇÕES (respostas curtas):\n`;
    for (const o of config.botObjections) {
      prompt += `- "${o.objection}" → "${o.response}"\n`;
    }
    prompt += '\n';
  } else {
    prompt += DEFAULT_OBJECTIONS + '\n\n';
  }

  // Products
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
  // Advanced mode: use custom prompt directly
  if (config?.botSystemPrompt?.trim()) return config.botSystemPrompt;
  // Structured mode: build from blocks
  return buildPromptFromBlocks();
}

function getCurrentContext(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const diaSemana = dias[now.getDay()];
  const hora = now.getHours();
  const minutos = now.getMinutes().toString().padStart(2, '0');
  const data = now.toLocaleDateString('pt-BR');

  return `\n\nCONTEXTO ATUAL:
- Data: ${data} (${diaSemana})
- Hora atual: ${hora}:${minutos}
- Para agendamento: NÃO sugira horários específicos. NÃO envie URLs no texto. O sistema envia um botão clicável automaticamente.`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMeetingUrl(text: string): string | null {
  const mdMatch = text.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) return mdMatch[1];
  const urlMatch = text.match(/(https?:\/\/[^\s),]+)/);
  if (urlMatch) return urlMatch[1];
  return null;
}

function stripUrl(text: string): string {
  return text
    .replace(/\[.*?\]\(https?:\/\/[^\s)]+\)/g, '')
    .replace(/https?:\/\/[^\s),]+/g, '')
    .replace(/[.\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// WaBotService
// ═══════════════════════════════════════════════════════════════════════════════

export class WaBotService {
  // ─── Main Entry Point ────────────────────────────────────────────────────

  /**
   * Called by the message router when an inbound message arrives.
   * Debounces 25s so multiple rapid messages are batched into one AI call.
   */
  static async handleMessage(
    conversationId: string,
    phone: string,
    text: string,
    pushName: string,
  ): Promise<void> {
    console.log(`[WaBot] Mensagem de ${phone} (${pushName}): "${text.substring(0, 80)}"`);

    // ── Check if bot is enabled ──
    // WABA bot is independent from Z-API botEnabled flag.
    // It always runs unless needsHumanAttention is set per-conversation.
    const config = await prisma.whatsAppConfig.findFirst();

    // ── Check needsHumanAttention ──
    const conversation = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { needsHumanAttention: true, optedOut: true },
    });
    if (!conversation) return;
    if (conversation.needsHumanAttention) {
      console.log(`[WaBot] Conversa ${conversationId} em atendimento humano, ignorando`);
      return;
    }
    if (conversation.optedOut) {
      console.log(`[WaBot] Conversa ${conversationId} opt-out, ignorando`);
      return;
    }

    // ── Debounce: wait 25s after last message before responding ──
    const existingTimer = debounceMap.get(phone);
    if (existingTimer) {
      clearTimeout(existingTimer);
      console.log(`[WaBot] Debounce reset para ${phone} (mais mensagens chegando)`);
    }

    const timer = setTimeout(() => {
      debounceMap.delete(phone);
      WaBotService.generateAndSend(conversationId, phone, pushName).catch((err) => {
        console.error(`[WaBot] Erro no debounced response para ${phone}:`, err);
      });
    }, DEBOUNCE_MS);

    debounceMap.set(phone, timer);
    console.log(`[WaBot] Debounce agendado para ${phone} (${DEBOUNCE_MS / 1000}s)`);
  }

  // ─── Debounced Response Generator ────────────────────────────────────────

  private static async generateAndSend(
    conversationId: string,
    phone: string,
    pushName: string,
  ): Promise<void> {
    // 1. Re-check config (may have changed during debounce)
    const config = await prisma.whatsAppConfig.findFirst({
      include: {
        botProducts: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!config) return;
    // WABA bot is independent from Z-API botEnabled — always runs

    // 2. Re-check conversation state (include contact name for AI prompt)
    const conversation = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: { select: { id: true, name: true } },
      },
    });
    if (!conversation || conversation.needsHumanAttention || conversation.optedOut) return;

    // 3. Check 24h window (Cloud API requirement)
    const windowOpen = await WindowService.isWindowOpen(conversationId);
    if (!windowOpen) {
      console.log(`[WaBot] Janela de 24h fechada para ${phone}, não posso responder com texto livre`);
      return;
    }

    // 4. Cold contact check: if we sent N messages with no reply, stop
    const followUpState = await prisma.waFollowUpState.findUnique({
      where: { conversationId },
    });
    if (followUpState && !followUpState.respondedSinceLastBot) {
      const botMsgCount = await prisma.waMessage.count({
        where: {
          conversationId,
          senderType: 'WA_BOT',
          createdAt: followUpState.lastBotMessageAt
            ? { gte: followUpState.lastBotMessageAt }
            : undefined,
        },
      });
      if (botMsgCount >= (config.coldContactMaxMessages || 2)) {
        console.log(`[WaBot] Contato frio detectado (${botMsgCount} msgs sem resposta), ignorando`);
        return;
      }
    }

    // 5. Collect ALL client messages since last bot response
    const lastBotMsg = await prisma.waMessage.findFirst({
      where: { conversationId, senderType: 'WA_BOT' },
      orderBy: { createdAt: 'desc' },
    });

    const pendingMsgs = await prisma.waMessage.findMany({
      where: {
        conversationId,
        senderType: 'WA_CLIENT',
        direction: 'INBOUND',
        ...(lastBotMsg ? { createdAt: { gt: lastBotMsg.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingMsgs.length === 0) return;

    const combinedText = pendingMsgs.map((m) => m.body || '').filter(Boolean).join('\n');
    if (!combinedText.trim()) return;

    console.log(`[WaBot] Processando ${pendingMsgs.length} mensagem(ns) de ${phone}: "${combinedText.substring(0, 100)}..."`);

    // 6. Load AI history (WaAIHistory + fallback para WaMessage se vazio)
    const aiHistory = await prisma.waAIHistory.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const history: ChatMessage[] = [];

    if (aiHistory.length > 0) {
      // Histórico IA existente — usar direto
      history.push(...aiHistory.map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })));
    } else {
      // Sem histórico IA — carregar mensagens recentes do WaMessage como contexto.
      // Isso cobre templates enviados pela automação (que não passam pelo bot).
      const recentMessages = await prisma.waMessage.findMany({
        where: { conversationId, body: { not: null } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const msg of recentMessages) {
        if (!msg.body || msg.body.startsWith('[')) continue; // pula markers como [CTA_MEETING_SENT]
        const role: 'user' | 'assistant' = msg.direction === 'INBOUND' ? 'user' : 'assistant';
        history.push({ role, content: msg.body });
      }
    }

    history.push({ role: 'user', content: combinedText });

    try {
      // 7. Build system prompt + deal context
      const dealContext = await WaBotService.buildDealContext(conversation.contactId);

      // Prefer CRM contact name over WhatsApp pushName (pushName can be a nickname/wrong name)
      const contactName = conversation.contact?.name || pushName;

      const aiReply = await WaBotService.getAIResponse(
        history,
        contactName,
        config.meetingLink || null,
        dealContext || undefined,
      );

      // 8. (removido — WaMessageService.sendText já salva no banco, evita duplicação)

      // 9. Save AI history
      await prisma.waAIHistory.create({
        data: { conversationId, role: 'user', content: combinedText },
      });
      await prisma.waAIHistory.create({
        data: { conversationId, role: 'assistant', content: aiReply },
      });

      // 10. Cap AI history at 20
      const totalHistory = await prisma.waAIHistory.count({ where: { conversationId } });
      if (totalHistory > 20) {
        const toDelete = await prisma.waAIHistory.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          take: totalHistory - 20,
          select: { id: true },
        });
        await prisma.waAIHistory.deleteMany({
          where: { id: { in: toDelete.map((h) => h.id) } },
        });
      }

      // 11. Update follow-up state
      const followUpData = { lastBotMessageAt: new Date(), respondedSinceLastBot: false };
      if (followUpState) {
        await prisma.waFollowUpState.update({
          where: { id: followUpState.id },
          data: followUpData,
        });
      } else {
        await prisma.waFollowUpState.create({
          data: { conversationId, ...followUpData },
        });
      }

      // 12. Update conversation timestamp
      await prisma.waConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      // 13. Send the response via Cloud API
      await WaBotService.sendBotResponse(
        conversationId,
        phone,
        aiReply,
        config.meetingLink || undefined,
        config.botProducts || [],
      );

      // 14. Ensure meeting link if AI mentioned meeting but forgot the link
      await WaBotService.ensureMeetingLink(conversationId, aiReply, config.meetingLink || undefined);

      // 15. Register in daily limit
      const { registerSent } = await import('../dailyLimitService');
      await registerSent('botResponse').catch(() => {});

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[WaBot] Erro:`, errMsg);

      // Check if it's a sending error vs AI error
      const isApiError = errMsg.includes('ECONNREFUSED') || errMsg.includes('401') ||
        errMsg.includes('404') || errMsg.includes('Limite diário');

      if (isApiError) {
        console.warn(`[WaBot] Erro de API, não enviando fallback`);
        return;
      }

      // AI error — flag for human attention
      const botName = config.botName || 'Bia';
      const botCompany = config.botCompany || 'Bertuzzi Patrimonial';
      const fallbackText = `Oi${pushName ? `, ${pushName}` : ''}! Sou a ${botName} da *${botCompany}*! To com uma instabilidade aqui, mas um consultor vai te atender em breve.`;

      try {
        await WaMessageService.sendText(conversationId, fallbackText, { senderType: 'WA_BOT' });
      } catch (sendErr) {
        console.error(`[WaBot] Erro ao enviar fallback:`, sendErr);
      }

      await prisma.waConversation.update({
        where: { id: conversationId },
        data: { needsHumanAttention: true },
      });
    }
  }

  // ─── AI Response ─────────────────────────────────────────────────────────

  private static async getAIResponse(
    history: ChatMessage[],
    pushName: string,
    meetingLink?: string | null,
    extraContext?: string,
  ): Promise<string> {
    const basePrompt = await getSystemPrompt();
    const context = getCurrentContext();
    let systemMessage = basePrompt + context;

    // Avoid re-introductions on existing conversations
    const hasAssistantHistory = history.some((m) => m.role === 'assistant');
    if (hasAssistantHistory) {
      const config = await prisma.whatsAppConfig.findFirst();
      const botName = config?.botName || 'Bia';
      systemMessage = systemMessage.replace(
        new RegExp(`SEMPRE se apresente como ${botName} na primeira mensagem\\.?`, 'i'),
        `Você já está em contato com este lead. NÃO se apresente novamente. NÃO diga "sou a ${botName}" ou "aqui é a ${botName}". Continue a conversa de forma natural.`,
      );
    }

    if (pushName) {
      systemMessage += `\n\nO nome do cliente é ${pushName}. Use o primeiro nome dele na conversa.`;
    }

    if (meetingLink) {
      systemMessage += `\n\nAGENDAMENTO: Existe um link de agendamento configurado. Quando o lead quiser agendar, diga algo como "Vou te mandar o link pra agendar!" — NÃO inclua a URL no texto. O sistema envia um botão clicável automaticamente.`;
    } else {
      systemMessage += `\nNão há link de agendamento configurado — combine dia e horário diretamente com o cliente.`;
    }

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
      max_tokens: 200,
      temperature: 0.7,
    });

    let reply = completion.choices[0].message.content || '';

    // Strip any URLs the AI might have included (system sends CTA button instead)
    if (meetingLink) {
      reply = reply.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text) => text || '');
      reply = reply.replace(/https?:\/\/[^\s),]+/g, '').replace(/\s{2,}/g, ' ').trim();
    }

    return reply;
  }

  // ─── Send Bot Response ───────────────────────────────────────────────────

  /**
   * Sends AI reply via WaMessageService.
   * Splits by double newline for multiple short messages.
   * Detects meeting intent to send CTA URL button (clickable link).
   */
  private static async sendBotResponse(
    conversationId: string,
    phone: string,
    aiReply: string,
    meetingLink?: string,
    _products?: Array<{ id: string; name: string; description?: string | null; priceRange?: string | null }>,
  ): Promise<void> {
    // Split by double newline or --- (legacy) into separate messages
    const parts = aiReply
      .split(/\n\n+|\s*-{3,}\s*/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Send each text part
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // Strip any leftover URLs from the text (AI shouldn't include them)
      const cleanPart = stripUrl(part) || part;
      if (cleanPart.length > 0) {
        await WaMessageService.sendText(conversationId, cleanPart, { senderType: 'WA_BOT' });
      }

      // Delay between messages (1.5s + 50ms per char, max 5s)
      if (parts.length > 1 && i < parts.length - 1) {
        const msgDelay = Math.min(1500 + cleanPart.length * 50, 5000);
        await delay(msgDelay);
      }
    }

    // Detect meeting intent and send CTA URL button
    if (meetingLink && MEETING_INTENT_REGEX.test(aiReply)) {
      // Check if deal is already in a post-scheduling stage — do NOT send Calendly CTA
      const conv = await prisma.waConversation.findUnique({
        where: { id: conversationId },
        select: { contactId: true },
      });
      if (conv?.contactId) {
        const deal = await prisma.deal.findFirst({
          where: { contactId: conv.contactId, status: 'OPEN' },
          include: { stage: { select: { name: true } } },
        });
        if (deal?.stage) {
          const stageLC = deal.stage.name.toLowerCase();
          const LATE_STAGES = ['reunião agendada', 'reuniao agendada', 'proposta', 'aguardando', 'ganho', 'fechado'];
          if (LATE_STAGES.some(s => stageLC.includes(s))) {
            console.log(`[WaBot] Etapa "${deal.stage.name}" — CTA Calendly bloqueado (reunião já agendada ou etapa avançada)`);
            return;
          }
        }
      }

      // Check if we already sent the meeting link (look for CTA marker in messages)
      const previousCta = await prisma.waMessage.findFirst({
        where: {
          conversationId,
          senderType: 'WA_BOT',
          body: { contains: '[CTA_MEETING_SENT]' },
        },
      });

      // Check if lead explicitly asked for link again
      const lastClientMsg = await prisma.waMessage.findFirst({
        where: { conversationId, senderType: 'WA_CLIENT', direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      });
      const leadAskedForLink = lastClientMsg?.body
        ? /link|agendar|marcar|hor[aá]rio/i.test(lastClientMsg.body)
        : false;

      const shouldSendLink = !previousCta || leadAskedForLink;

      if (shouldSendLink) {
        await delay(2000);
        try {
          const client = await WhatsAppCloudClient.fromDB();
          await client.sendCtaUrl(
            phone,
            'Clique abaixo para escolher o melhor horário:',
            'Agendar Reuniao',
            meetingLink,
          );
          console.log(`[WaBot] CTA URL button enviado para ${phone}`);

          // Mark meeting link as sent (internal marker, not visible to user)
          await prisma.waMessage.create({
            data: {
              direction: 'OUTBOUND',
              senderType: 'WA_BOT',
              type: 'INTERACTIVE_BUTTONS',
              body: '[CTA_MEETING_SENT]',
              status: 'WA_SENT',
              conversationId,
            },
          });
        } catch (ctaErr) {
          console.warn(`[WaBot] Falha ao enviar CTA URL button, enviando como texto:`, ctaErr);
          await WaMessageService.sendText(conversationId, meetingLink, { senderType: 'WA_BOT' });
        }
      } else {
        console.log(`[WaBot] Link já enviado anteriormente para ${phone}, não reenviando`);
      }
    }

    console.log(`[WaBot] Enviou ${parts.length} mensagem(ns) para ${phone}`);
  }

  // ─── Ensure Meeting Link ─────────────────────────────────────────────────

  /**
   * No-op: meeting link CTA is now handled directly in sendBotResponse.
   * Kept for backward compatibility — does nothing.
   */
  private static async ensureMeetingLink(
    _conversationId: string,
    _aiReply: string,
    _meetingLink?: string,
  ): Promise<void> {
    // CTA URL button is now sent in sendBotResponse when meeting intent is detected.
    // This method is intentionally empty to avoid duplicate sends.
  }

  // ─── Product Discovery (Interactive List) ────────────────────────────────

  /**
   * Send an interactive list of active products when the lead is
   * in discovery phase. Called externally by the message router if needed.
   */
  static async sendProductList(conversationId: string): Promise<void> {
    const config = await prisma.whatsAppConfig.findFirst({
      include: {
        botProducts: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!config?.botProducts || config.botProducts.length === 0) return;

    const sections = [
      {
        title: 'Nossos Produtos',
        rows: config.botProducts.slice(0, 10).map((p) => ({
          id: `product_${p.id}`,
          title: p.name.substring(0, 24),
          description: (p.priceRange || p.description || '').substring(0, 72),
        })),
      },
    ];

    try {
      await WaMessageService.sendInteractiveList(
        conversationId,
        'Temos algumas solucoes que podem ajudar. Qual te interessa mais?',
        'Ver produtos',
        sections,
        { senderType: 'WA_BOT' },
      );
      console.log(`[WaBot] Lista de produtos enviada para conversa ${conversationId}`);
    } catch (err) {
      console.error(`[WaBot] Erro ao enviar lista de produtos:`, err);
    }
  }

  // ─── Build Deal Context ──────────────────────────────────────────────────

  private static async buildDealContext(contactId?: string | null): Promise<string> {
    if (!contactId) return '';

    const deal = await prisma.deal.findFirst({
      where: { contactId, status: 'OPEN' },
      include: {
        stage: { select: { name: true } },
        organization: { select: { name: true } },
        contact: { select: { name: true } },
      },
    });

    if (!deal) return '';

    const stageName = deal.stage?.name || 'Desconhecida';
    let ctx = `\n\n=== CONTEXTO DA NEGOCIAÇÃO ===`;
    if (deal.contact?.name) {
      ctx += `\nNome do lead no CRM: ${deal.contact.name}`;
    }
    ctx += `\nEmpresa: ${deal.organization?.name || deal.title}`;
    ctx += `\nEtapa atual: ${stageName}`;

    const stageLC = stageName.toLowerCase();
    if (stageLC.includes('reunião agendada') || stageLC.includes('reuniao agendada')) {
      ctx += `\nREUNIÃO JÁ MARCADA. NÃO tente marcar outra reunião. Apenas confirme que está tudo certo e aguarde o dia da reunião. Seja cordial e tire dúvidas se o lead perguntar algo.`;
    } else if (stageLC.includes('proposta')) {
      ctx += `\nProposta já foi enviada. Pergunte se o lead tem dúvidas sobre a proposta e reforce o valor do serviço.`;
    } else if (stageLC.includes('aguardando dados')) {
      ctx += `\nO lead está na fase de aguardando dados/documentos. Pergunte se precisa de ajuda para enviar os dados pendentes.`;
    } else if (stageLC.includes('aguardando assinatura')) {
      ctx += `\nO contrato já foi enviado. Pergunte se precisa de alguma orientação para assinar o documento.`;
    }

    return ctx;
  }

  // ─── Cancel Debounce (for cleanup) ───────────────────────────────────────

  /**
   * Cancel a pending debounce timer for a phone number.
   * Useful when conversation is transferred to human agent.
   */
  static cancelDebounce(phone: string): void {
    const timer = debounceMap.get(phone);
    if (timer) {
      clearTimeout(timer);
      debounceMap.delete(phone);
      console.log(`[WaBot] Debounce cancelado para ${phone}`);
    }
  }
}
