import prisma from '../../lib/prisma';
import { WhatsAppCloudClient } from '../whatsappCloudClient';
// Cloud API limits are managed by Meta (tier-based: 250/2000/10000/unlimited per day).
// Local dailyLimitService is for Z-API warmup only — not used here.
import { WindowService } from './windowService';

interface SendOpts {
  senderType?: 'WA_BOT' | 'WA_HUMAN' | 'WA_SYSTEM';
  senderUserId?: string;
  isFollowUp?: boolean;
  followUpStep?: number;
  metadata?: any;
}

// ─── Pair rate limit: max 1 msg per 6s per phone ────────────────────────────
const lastSentMap = new Map<string, number>(); // phone -> timestamp ms

async function enforcePairRateLimit(phone: string): Promise<void> {
  const now = Date.now();
  const lastSent = lastSentMap.get(phone) || 0;
  const elapsed = now - lastSent;
  if (elapsed < 6000) {
    await new Promise(resolve => setTimeout(resolve, 6000 - elapsed));
  }
  lastSentMap.set(phone, Date.now());
  // Cleanup old entries every 1000 entries
  if (lastSentMap.size > 1000) {
    const cutoff = now - 60000;
    for (const [k, v] of lastSentMap) {
      if (v < cutoff) lastSentMap.delete(k);
    }
  }
}

// ─── Meta error handling helper ─────────────────────────────────────────────
function handleMetaSendError(err: any, conversationId: string): never {
  const metaCode = (err as any)?.metaCode;
  if (metaCode === 131047) {
    // Outside 24h window — clear window and suggest template
    prisma.waConversation.update({
      where: { id: conversationId },
      data: { windowExpiresAt: null },
    }).catch(() => {}); // fire-and-forget
    throw new Error('[WA] Mensagem fora da janela de 24h. Use um template aprovado.');
  }
  if (metaCode === 131051) {
    throw new Error('[WA] Este numero nao possui WhatsApp.');
  }
  if (metaCode === 131056) {
    throw new Error('[WA] Limite de envio atingido para este numero. Aguarde alguns segundos.');
  }
  throw err;
}

export class WaMessageService {
  /** Check quality gate — block sends if quality is RED */
  private static async checkQualityGate(): Promise<void> {
    const config = await prisma.cloudWaConfig.findFirst({ select: { qualityRating: true } });
    if (config?.qualityRating === 'RED') {
      throw new Error('[WA] Envios pausados — quality rating RED. Verifique a qualidade das mensagens no painel da Meta.');
    }
  }

  /** Check daily volume limit */
  private static async checkDailyVolume(senderType: string): Promise<void> {
    const config = await prisma.cloudWaConfig.findFirst({
      select: { dailyMessageLimit: true },
    });
    const baseLimit = config?.dailyMessageLimit || 2000;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await prisma.waMessage.count({
      where: { direction: 'OUTBOUND', createdAt: { gte: today } },
    });

    // Bot responses get soft limit (150%), human/system get hard limit
    const effectiveLimit = senderType === 'WA_BOT'
      ? Math.floor(baseLimit * 1.5)
      : baseLimit;

    if (todayCount >= effectiveLimit) {
      throw new Error(`[WA] Limite diario atingido (${todayCount}/${effectiveLimit}). Aguarde ate amanha.`);
    }
  }
  private static async getClient(): Promise<WhatsAppCloudClient> {
    return WhatsAppCloudClient.fromDB();
  }

  /** Get conversation with phone, throws if not found */
  private static async getConversation(conversationId: string) {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, phone: true },
    });
    if (!conv) throw new Error(`[WaMessageService] Conversa ${conversationId} não encontrada`);
    return conv;
  }

  /** Save outbound message and update conversation lastMessageAt */
  private static async saveOutbound(conversationId: string, phone: string, waMessageId: string, opts: {
    type: string;
    body?: string;
    templateName?: string;
    templateParams?: any;
    interactiveData?: any;
    mediaUrl?: string;
    mediaId?: string;
    senderType: string;
    senderUserId?: string;
    isFollowUp?: boolean;
    followUpStep?: number;
    metadata?: any;
  }) {
    const [message] = await Promise.all([
      prisma.waMessage.create({
        data: {
          waMessageId,
          direction: 'OUTBOUND',
          senderType: opts.senderType as any,
          type: opts.type as any,
          body: opts.body || null,
          templateName: opts.templateName || null,
          templateParams: opts.templateParams || null,
          interactiveData: opts.interactiveData || null,
          mediaUrl: opts.mediaUrl || null,
          mediaId: opts.mediaId || null,
          status: 'WA_PENDING',
          isFollowUp: opts.isFollowUp || false,
          followUpStep: opts.followUpStep || null,
          metadata: opts.metadata || null,
          conversationId,
          senderUserId: opts.senderUserId || null,
        },
      }),
      prisma.waConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return message;
  }

  /** Send a text message (requires open 24h window) */
  static async sendText(conversationId: string, text: string, opts: SendOpts = {}): Promise<any> {
    const conv = await this.getConversation(conversationId);
    const senderType = opts.senderType || 'WA_SYSTEM';

    // ── Security gates ──
    await this.checkQualityGate();
    await this.checkDailyVolume(senderType);
    await enforcePairRateLimit(conv.phone);

    const client = await this.getClient();
    console.log(`[WaMessageService] sendText to=${conv.phone} phoneNumberId=${(client as any).phoneNumberId}`);
    let response: any;
    try {
      response = await client.sendText(conv.phone, text);
      console.log(`[WaMessageService] sendText response:`, JSON.stringify(response));
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendText FAILED:`, sendErr?.response?.data || sendErr?.message || sendErr);
      handleMetaSendError(sendErr, conversationId);
    }
    const waMessageId = response.messages?.[0]?.id;

    const message = await this.saveOutbound(conversationId, conv.phone, waMessageId, {
      type: 'TEXT',
      body: text,
      senderType,
      senderUserId: opts.senderUserId,
      isFollowUp: opts.isFollowUp,
      followUpStep: opts.followUpStep,
      metadata: opts.metadata,
    });

    return message;
  }

  /** Send a template message (works outside 24h window) */
  static async sendTemplate(
    conversationId: string,
    templateName: string,
    language: string,
    components?: any[],
    opts: SendOpts = {},
  ): Promise<any> {
    const conv = await this.getConversation(conversationId);
    const senderType = opts.senderType || 'WA_SYSTEM';

    // ── Security gates ──
    await this.checkQualityGate();
    await this.checkDailyVolume(senderType);
    await enforcePairRateLimit(conv.phone);

    // Fetch template from DB for display (body + header + buttons + footer)
    const tplRecord = await prisma.cloudWaTemplate.findFirst({
      where: { name: templateName },
      select: { body: true, headerType: true, headerContent: true, footer: true, buttons: true },
    });
    const templateBody = tplRecord?.body || `[template: ${templateName}]`;
    // Replace {{N}} placeholders with actual params if provided
    let displayBody = templateBody;
    if (components && Array.isArray(components)) {
      const bodyComp = components.find((c: any) => c.type === 'body');
      if (bodyComp?.parameters) {
        bodyComp.parameters.forEach((p: any, i: number) => {
          displayBody = displayBody.replace(`{{${i + 1}}}`, p.text || p.value || `{{${i + 1}}}`);
        });
      }
    }

    // Build template metadata for frontend rendering
    const templateMeta: Record<string, any> = {};
    if (tplRecord?.headerType && tplRecord?.headerContent) {
      templateMeta.headerType = tplRecord.headerType;
      templateMeta.headerContent = tplRecord.headerContent;
    }
    if (tplRecord?.footer) templateMeta.footer = tplRecord.footer;
    if (tplRecord?.buttons) templateMeta.buttons = tplRecord.buttons;

    const client = await this.getClient();
    let response: any;
    try {
      response = await client.sendTemplate(conv.phone, templateName, language, components);
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendTemplate FAILED:`, sendErr?.message || sendErr);
      handleMetaSendError(sendErr, conversationId);
    }
    const waMessageId = response.messages?.[0]?.id;

    const message = await this.saveOutbound(conversationId, conv.phone, waMessageId, {
      type: 'TEMPLATE',
      body: displayBody,
      templateName,
      templateParams: components || null,
      senderType,
      senderUserId: opts.senderUserId,
      isFollowUp: opts.isFollowUp,
      followUpStep: opts.followUpStep,
      metadata: { ...opts.metadata, ...templateMeta },
    });

    return message;
  }

  /** Send interactive buttons (max 3 buttons, requires open window) */
  static async sendInteractiveButtons(
    conversationId: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    opts: SendOpts = {},
  ): Promise<any> {
    const conv = await this.getConversation(conversationId);
    const senderType = opts.senderType || 'WA_BOT';

    // ── Security gates ──
    await this.checkQualityGate();
    await this.checkDailyVolume(senderType);
    await enforcePairRateLimit(conv.phone);

    // ── Validate interactive buttons (Meta limits) ──
    const validatedButtons = buttons.slice(0, 3).map(b => ({
      ...b,
      title: b.title.substring(0, 20),
    }));

    const client = await this.getClient();
    let response: any;
    try {
      response = await client.sendButtons(conv.phone, bodyText, validatedButtons);
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendInteractiveButtons FAILED:`, sendErr?.message || sendErr);
      handleMetaSendError(sendErr, conversationId);
    }
    const waMessageId = response.messages?.[0]?.id;

    const interactiveData = { type: 'button', bodyText, buttons: validatedButtons };

    const message = await this.saveOutbound(conversationId, conv.phone, waMessageId, {
      type: 'INTERACTIVE_BUTTONS',
      body: bodyText,
      interactiveData,
      senderType,
      senderUserId: opts.senderUserId,
      isFollowUp: opts.isFollowUp,
      followUpStep: opts.followUpStep,
      metadata: opts.metadata,
    });

    return message;
  }

  /** Send interactive list (max 10 items, requires open window) */
  static async sendInteractiveList(
    conversationId: string,
    bodyText: string,
    buttonText: string,
    sections: any[],
    opts: SendOpts = {},
  ): Promise<any> {
    const conv = await this.getConversation(conversationId);
    const senderType = opts.senderType || 'WA_BOT';

    // ── Security gates ──
    await this.checkQualityGate();
    await this.checkDailyVolume(senderType);
    await enforcePairRateLimit(conv.phone);

    // ── Validate interactive list (Meta limits) ──
    let totalRows = 0;
    const validatedSections = sections.map(section => ({
      ...section,
      rows: section.rows
        .filter(() => { totalRows++; return totalRows <= 10; })
        .map((row: any) => ({
          ...row,
          title: row.title?.substring(0, 24) || row.title,
          description: row.description?.substring(0, 72) || row.description,
        })),
    }));

    const client = await this.getClient();
    let response: any;
    try {
      response = await client.sendList(conv.phone, bodyText, buttonText, validatedSections);
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendInteractiveList FAILED:`, sendErr?.message || sendErr);
      handleMetaSendError(sendErr, conversationId);
    }
    const waMessageId = response.messages?.[0]?.id;

    const interactiveData = { type: 'list', bodyText, buttonText, sections: validatedSections };

    const message = await this.saveOutbound(conversationId, conv.phone, waMessageId, {
      type: 'INTERACTIVE_LIST',
      body: bodyText,
      interactiveData,
      senderType,
      senderUserId: opts.senderUserId,
      isFollowUp: opts.isFollowUp,
      followUpStep: opts.followUpStep,
      metadata: opts.metadata,
    });

    return message;
  }

  /** Send media (IMAGE, VIDEO, AUDIO, DOCUMENT) — requires open window */
  static async sendMedia(
    conversationId: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT',
    url: string,
    caption?: string,
    opts: SendOpts = {},
  ): Promise<any> {
    const conv = await this.getConversation(conversationId);
    const senderType = opts.senderType || 'WA_SYSTEM';

    // ── Security gates ──
    await this.checkQualityGate();
    await this.checkDailyVolume(senderType);
    await enforcePairRateLimit(conv.phone);

    const client = await this.getClient();
    let response: any;

    try {
      switch (mediaType) {
        case 'IMAGE':
          response = await client.sendImage(conv.phone, url, caption);
          break;
        case 'VIDEO':
          response = await client.sendVideo(conv.phone, url, caption);
          break;
        case 'AUDIO':
          response = await client.sendAudio(conv.phone, url);
          break;
        case 'DOCUMENT':
          response = await client.sendDocument(conv.phone, url, caption || 'documento', caption);
          break;
      }
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendMedia FAILED:`, sendErr?.message || sendErr);
      handleMetaSendError(sendErr, conversationId);
    }

    const waMessageId = response.messages?.[0]?.id;

    const message = await this.saveOutbound(conversationId, conv.phone, waMessageId, {
      type: mediaType,
      body: caption || null,
      mediaUrl: url,
      senderType,
      senderUserId: opts.senderUserId,
      isFollowUp: opts.isFollowUp,
      followUpStep: opts.followUpStep,
      metadata: opts.metadata,
    });

    return message;
  }

  /**
   * Smart send: checks 24h window, sends text if open, falls back to template if closed.
   * If window is closed and no fallbackTemplate is provided, throws an error.
   */
  static async smartSend(
    conversationId: string,
    text: string,
    fallbackTemplate?: string,
    opts: SendOpts = {},
  ): Promise<any> {
    const windowOpen = await WindowService.isWindowOpen(conversationId);

    if (windowOpen) {
      return this.sendText(conversationId, text, opts);
    }

    if (fallbackTemplate) {
      return this.sendTemplate(conversationId, fallbackTemplate, 'pt_BR', undefined, opts);
    }

    throw new Error(
      `[WaMessageService] Janela de 24h fechada para conversa ${conversationId}. ` +
      'Forneça um fallbackTemplate ou envie um template diretamente.'
    );
  }

  /** Mark a message as read (blue checks) on Meta and update local record */
  static async markAsRead(waMessageId: string): Promise<void> {
    try {
      const client = await this.getClient();
      await client.markAsRead(waMessageId);
    } catch (err) {
      console.error(`[WaMessageService] Erro ao marcar como lido na Meta (${waMessageId}):`, err);
    }

    await prisma.waMessage.updateMany({
      where: { waMessageId },
      data: { readAt: new Date(), status: 'WA_READ' },
    });
  }
}
