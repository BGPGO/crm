import prisma from '../../lib/prisma';
import { WhatsAppCloudClient } from '../whatsappCloudClient';
import { canSend, registerSent } from '../dailyLimitService';
import { WindowService } from './windowService';

interface SendOpts {
  senderType?: 'WA_BOT' | 'WA_HUMAN' | 'WA_SYSTEM';
  senderUserId?: string;
  isFollowUp?: boolean;
  followUpStep?: number;
  metadata?: any;
}

export class WaMessageService {
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

    // Skip daily limit check for human agents (manual sends)
    if (senderType !== 'WA_HUMAN') {
      const allowed = await canSend(opts.isFollowUp ? 'followUp' : 'botResponse');
      if (!allowed) {
        throw new Error('[WaMessageService] Limite diário de mensagens atingido');
      }
    }

    const client = await this.getClient();
    console.log(`[WaMessageService] sendText to=${conv.phone} phoneNumberId=${(client as any).phoneNumberId}`);
    let response: any;
    try {
      response = await client.sendText(conv.phone, text);
      console.log(`[WaMessageService] sendText response:`, JSON.stringify(response));
    } catch (sendErr: any) {
      console.error(`[WaMessageService] sendText FAILED:`, sendErr?.response?.data || sendErr?.message || sendErr);
      throw sendErr;
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

    await registerSent(opts.isFollowUp ? 'followUp' : 'botResponse');

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

    if (senderType !== 'WA_HUMAN') {
      const allowed = await canSend(opts.isFollowUp ? 'followUp' : 'botResponse');
      if (!allowed) {
        throw new Error('[WaMessageService] Limite diário de mensagens atingido');
      }
    }

    // Fetch template body from DB for display
    const tplRecord = await prisma.cloudWaTemplate.findFirst({
      where: { name: templateName },
      select: { body: true },
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

    const client = await this.getClient();
    const response = await client.sendTemplate(conv.phone, templateName, language, components);
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
      metadata: opts.metadata,
    });

    await registerSent(opts.isFollowUp ? 'followUp' : 'botResponse');

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

    const allowed = await canSend('botResponse');
    if (!allowed) {
      throw new Error('[WaMessageService] Limite diário de mensagens atingido');
    }

    const client = await this.getClient();
    const response = await client.sendButtons(conv.phone, bodyText, buttons);
    const waMessageId = response.messages?.[0]?.id;

    const interactiveData = { type: 'button', bodyText, buttons };

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

    await registerSent('botResponse');

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

    const allowed = await canSend('botResponse');
    if (!allowed) {
      throw new Error('[WaMessageService] Limite diário de mensagens atingido');
    }

    const client = await this.getClient();
    const response = await client.sendList(conv.phone, bodyText, buttonText, sections);
    const waMessageId = response.messages?.[0]?.id;

    const interactiveData = { type: 'list', bodyText, buttonText, sections };

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

    await registerSent('botResponse');

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

    const allowed = await canSend('botResponse');
    if (!allowed) {
      throw new Error('[WaMessageService] Limite diário de mensagens atingido');
    }

    const client = await this.getClient();
    let response: any;

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

    await registerSent('botResponse');

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
