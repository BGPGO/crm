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
 * Lógica reutilizada do bot original:
 *   - Prompt building por blocos (buildPromptFromBlocks)
 *   - Debounce de 25s
 *   - Separação de resposta por ---
 *   - Delay entre mensagens (1.5s + 50ms/char)
 *   - Histórico IA com cap de 20
 *   - Opt-out e cold contact checks
 * ═══════════════════════════════════════════════════════════════════════════
 */

import OpenAI from 'openai';
import prisma from '../../lib/prisma';
import { WaMessageService } from './messageService';
import { WindowService } from './windowService';

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
  prompt += `FORMATO: Separe mensagens com ---. Cada bloco entre --- vira uma mensagem separada no WhatsApp. Mande 2-3 mensagens curtas por vez.\n\n`;
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
- Para agendamento: SEMPRE envie o link do Calendly. NÃO sugira horários específicos. O lead escolhe pelo link.`;
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
    const config = await prisma.whatsAppConfig.findFirst();
    if (!config || !config.botEnabled) {
      console.log(`[WaBot] Bot desabilitado, ignorando`);
      return;
    }

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
    if (!config || !config.botEnabled) return;

    // 2. Re-check conversation state
    const conversation = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      include: {
        contact: { select: { id: true } },
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

    // 6. Load AI history
    const aiHistory = await prisma.waAIHistory.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const history: ChatMessage[] = aiHistory.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));
    history.push({ role: 'user', content: combinedText });

    try {
      // 7. Build system prompt + deal context
      const dealContext = await WaBotService.buildDealContext(conversation.contactId);

      const aiReply = await WaBotService.getAIResponse(
        history,
        pushName,
        config.meetingLink || null,
        dealContext || undefined,
      );

      // 8. Save bot message to WaMessage
      await prisma.waMessage.create({
        data: {
          direction: 'OUTBOUND',
          senderType: 'WA_BOT',
          type: 'TEXT',
          body: aiReply,
          status: 'WA_PENDING',
          conversationId,
        },
      });

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
      systemMessage += `\n\nLINK DE AGENDAMENTO (use exatamente este): ${meetingLink}\nREGRA ABSOLUTA: quando enviar o link, cole EXATAMENTE "${meetingLink}" sozinho em uma mensagem. NUNCA use markdown [texto](url). NUNCA escreva "calendly.com" genérico. SEMPRE o link completo acima.`;
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
      max_tokens: 400,
      temperature: 0.7,
    });

    let reply = completion.choices[0].message.content || '';

    // Sanitize: replace markdown links with raw URLs
    if (meetingLink) {
      reply = reply.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, _text, url) => {
        if (url.toLowerCase().includes('calendly')) return meetingLink;
        return url;
      });
      reply = reply.replace(/(?<!\S)calendly\.com(?!\S)/gi, meetingLink);
    }

    return reply;
  }

  // ─── Send Bot Response ───────────────────────────────────────────────────

  /**
   * Splits AI reply by --- separator and sends each part via WaMessageService.
   * Detects meeting intent to send interactive buttons instead of plain URLs.
   * Detects product discovery to send interactive list.
   */
  private static async sendBotResponse(
    conversationId: string,
    phone: string,
    aiReply: string,
    meetingLink?: string,
    products?: Array<{ id: string; name: string; description?: string | null; priceRange?: string | null }>,
  ): Promise<void> {
    // Primary split: by --- separator
    let parts = aiReply.split(/\s*-{3,}\s*/).map((p) => p.trim()).filter((p) => p.length > 0);

    // Fallback: split by double newlines
    if (parts.length === 1) {
      parts = aiReply.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const url = extractMeetingUrl(part);

      if (url && meetingLink) {
        // Part contains a meeting URL — send as interactive button
        const cleanText = stripUrl(part);
        if (cleanText && cleanText.length > 2) {
          await WaMessageService.sendText(conversationId, cleanText, { senderType: 'WA_BOT' });
          await delay(1500);
        }

        // Send meeting link as interactive button
        try {
          await WaMessageService.sendInteractiveButtons(
            conversationId,
            'Clique no botao abaixo para agendar sua reuniao:',
            [{ id: 'btn_agendar', title: 'Agendar reuniao' }],
            { senderType: 'WA_BOT' },
          );
        } catch (btnErr) {
          // Fallback: send as plain text if interactive fails
          console.warn(`[WaBot] Falha ao enviar botao interativo, enviando como texto:`, btnErr);
          await WaMessageService.sendText(conversationId, meetingLink, { senderType: 'WA_BOT' });
        }
      } else {
        // Regular text message
        await WaMessageService.sendText(conversationId, part, { senderType: 'WA_BOT' });
      }

      // Delay between messages (1.5s + 50ms per char, max 5s)
      if (parts.length > 1 && i < parts.length - 1) {
        const msgDelay = Math.min(1500 + part.length * 50, 5000);
        await delay(msgDelay);
      }
    }

    console.log(`[WaBot] Enviou ${parts.length} mensagem(ns) para ${phone}`);
  }

  // ─── Ensure Meeting Link ─────────────────────────────────────────────────

  /**
   * If the AI mentioned a meeting but forgot to include the link,
   * automatically send it as an interactive button.
   */
  private static async ensureMeetingLink(
    conversationId: string,
    aiReply: string,
    meetingLink?: string,
  ): Promise<void> {
    if (!meetingLink) return;
    if (!MEETING_INTENT_REGEX.test(aiReply)) return;
    if (URL_REGEX.test(aiReply)) return;

    await delay(2000);

    try {
      await WaMessageService.sendInteractiveButtons(
        conversationId,
        'Segue o link para agendar:',
        [{ id: 'btn_agendar', title: 'Agendar reuniao' }],
        { senderType: 'WA_BOT' },
      );
      console.log(`[WaBot] Link do Calendly enviado automaticamente via botao (IA mencionou reuniao sem link)`);
    } catch {
      // Fallback to plain text
      await WaMessageService.sendText(conversationId, meetingLink, { senderType: 'WA_BOT' });
      console.log(`[WaBot] Link do Calendly enviado como texto (fallback)`);
    }
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
