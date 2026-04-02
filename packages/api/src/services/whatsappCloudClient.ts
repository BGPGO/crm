/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WhatsApp Cloud API Client (API Oficial da Meta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este client é INDEPENDENTE do zapiClient.ts (Z-API legado).
 * Os dois coexistem durante a migração. Quando a migração estiver completa,
 * o zapiClient.ts será aposentado e este será o único client.
 *
 * Nomenclatura:
 *   - zapiClient.ts     → Z-API (legado, não-oficial)
 *   - whatsappCloudClient.ts → Cloud API (oficial Meta) ← ESTE ARQUIVO
 *
 * Referência: crm/WHATSAPP-CLOUD-API-REFERENCE.md
 * ═══════════════════════════════════════════════════════════════════════════
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import prisma from '../lib/prisma';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CloudApiConfig {
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  appSecret: string;
}

interface SendMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}

interface TemplateComponent {
  type: string;        // HEADER, BODY, FOOTER, BUTTONS
  format?: string;     // TEXT, IMAGE, VIDEO, DOCUMENT (for HEADER)
  text?: string;
  example?: any;
  buttons?: Array<{
    type: string;      // QUICK_REPLY, URL, PHONE_NUMBER, COPY_CODE
    text: string;
    url?: string;
    phone_number?: string;
    example?: any;
  }>;
}

interface CreateTemplatePayload {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: TemplateComponent[];
}

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  quality_score?: { score: string };
  components: any[];
  rejected_reason?: string;
}

// ─── Class ──────────────────────────────────────────────────────────────────

export class WhatsAppCloudClient {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private wabaId: string;

  constructor(config: CloudApiConfig) {
    this.phoneNumberId = config.phoneNumberId;
    this.wabaId = config.wabaId;

    this.client = axios.create({
      baseURL: GRAPH_API_BASE,
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });

    // Interceptor: transforma erros da Meta em mensagens legíveis
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const metaError = error.response?.data?.error;
        if (metaError) {
          const enriched = new Error(
            `[CloudAPI ${metaError.code || '?'}] ${metaError.message || 'Erro desconhecido'} (subcode: ${metaError.error_subcode || 'N/A'})`
          );
          (enriched as any).metaCode = metaError.code;
          (enriched as any).metaSubcode = metaError.error_subcode;
          (enriched as any).fbtraceId = metaError.fbtrace_id;
          (enriched as any).statusCode = error.response?.status;
          throw enriched;
        }
        throw error;
      }
    );
  }

  /**
   * Factory: cria instância a partir das configurações no banco (CloudWaConfig)
   */
  static async fromDB(): Promise<WhatsAppCloudClient> {
    const config = await prisma.cloudWaConfig.findFirst();

    if (!config || !config.phoneNumberId || !config.accessToken) {
      throw new Error(
        '[WhatsAppCloudClient] Cloud API não configurada. ' +
        'Preencha phoneNumberId, wabaId e accessToken em CloudWaConfig.'
      );
    }

    return new WhatsAppCloudClient({
      phoneNumberId: config.phoneNumberId,
      wabaId: config.wabaId,
      accessToken: config.accessToken,
      appSecret: config.appSecret,
    });
  }

  /** Alias para compatibilidade com o padrão do zapiClient */
  static async fromConfig(): Promise<WhatsAppCloudClient> {
    return WhatsAppCloudClient.fromDB();
  }

  /**
   * Verifica assinatura do webhook (X-Hub-Signature-256)
   * Usar no middleware do webhook para validar que o request veio da Meta
   */
  static verifySignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSig, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIO DE MENSAGENS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envia mensagem de texto livre (só funciona dentro da janela de 24h)
   */
  async sendText(to: string, text: string, previewUrl = false): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: previewUrl, body: text },
    });
    return res.data;
  }

  /**
   * Responde a uma mensagem específica (quoted reply)
   */
  async sendReplyText(to: string, text: string, messageId: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      context: { message_id: messageId },
      type: 'text',
      text: { body: text },
    });
    return res.data;
  }

  /**
   * Envia template (funciona dentro e fora da janela de 24h)
   * @param to - Número do destinatário (ex: "5511999999999")
   * @param templateName - Nome do template aprovado
   * @param language - Código do idioma (ex: "pt_BR")
   * @param components - Parâmetros do template (header, body, buttons)
   */
  async sendTemplate(
    to: string,
    templateName: string,
    language: string,
    components?: Array<{
      type: string;
      parameters?: Array<{ type: string; text?: string; image?: any; video?: any; document?: any; currency?: any; date_time?: any }>;
      sub_type?: string;
      index?: number;
    }>
  ): Promise<SendMessageResponse> {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
      },
    };

    if (components && components.length > 0) {
      payload.template.components = components;
    }

    const res = await this.client.post(`/${this.phoneNumberId}/messages`, payload);
    return res.data;
  }

  /**
   * Envia imagem (dentro da janela de 24h)
   */
  private mediaRef(urlOrId: string): { link: string } | { id: string } {
    // Meta media IDs are numeric strings; URLs start with http
    return urlOrId.startsWith('http') ? { link: urlOrId } : { id: urlOrId };
  }

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { ...this.mediaRef(imageUrl), caption },
    });
    return res.data;
  }

  /**
   * Envia documento (dentro da janela de 24h)
   */
  async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: { ...this.mediaRef(documentUrl), filename, caption },
    });
    return res.data;
  }

  /**
   * Envia vídeo (dentro da janela de 24h)
   */
  async sendVideo(to: string, videoUrl: string, caption?: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      video: { ...this.mediaRef(videoUrl), caption },
    });
    return res.data;
  }

  /**
   * Envia áudio (dentro da janela de 24h)
   */
  async sendAudio(to: string, audioUrl: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'audio',
      audio: this.mediaRef(audioUrl),
    });
    return res.data;
  }

  /**
   * Envia botões interativos (dentro da janela de 24h, max 3 botões)
   */
  async sendButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<SendMessageResponse> {
    const interactive: any = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    };
    if (headerText) interactive.header = { type: 'text', text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
    return res.data;
  }

  /**
   * Envia botão CTA com URL (dentro da janela de 24h)
   * O usuário clica e abre o link no navegador.
   */
  async sendCtaUrl(
    to: string,
    bodyText: string,
    buttonText: string,
    url: string,
    headerText?: string,
    footerText?: string,
  ): Promise<SendMessageResponse> {
    const interactive: any = {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: { display_text: buttonText, url },
      },
    };
    if (headerText) interactive.header = { type: 'text', text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
    return res.data;
  }

  /**
   * Envia lista interativa (dentro da janela de 24h, max 10 items)
   */
  async sendList(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    headerText?: string,
    footerText?: string
  ): Promise<SendMessageResponse> {
    const interactive: any = {
      type: 'list',
      body: { text: bodyText },
      action: { button: buttonText, sections },
    };
    if (headerText) interactive.header = { type: 'text', text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    });
    return res.data;
  }

  /**
   * Envia reação a uma mensagem
   */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<SendMessageResponse> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
    return res.data;
  }

  /**
   * Marca mensagem como lida (blue checks)
   */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    const res = await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    return res.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATES (CRUD via Meta API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Cria template e submete para aprovação da Meta
   */
  async createTemplate(payload: CreateTemplatePayload): Promise<{ id: string; status: string; category: string }> {
    const res = await this.client.post(`/${this.wabaId}/message_templates`, payload);
    return res.data;
  }

  /**
   * Lista todos os templates da WABA (com filtros opcionais)
   */
  async listTemplates(filters?: {
    status?: string;
    category?: string;
    name?: string;
    limit?: number;
    after?: string;
  }): Promise<{ data: MetaTemplate[]; paging?: any }> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.category) params.category = filters.category;
    if (filters?.name) params.name = filters.name;
    if (filters?.limit) params.limit = String(filters.limit);
    if (filters?.after) params.after = filters.after;

    const res = await this.client.get(`/${this.wabaId}/message_templates`, { params });
    return res.data;
  }

  /**
   * Busca template por ID na Meta
   */
  async getTemplate(templateId: string): Promise<MetaTemplate> {
    const res = await this.client.get(`/${templateId}`);
    return res.data;
  }

  /**
   * Edita template existente (só componentes, não muda nome/categoria/idioma)
   * Atenção: Máximo 10 edições por 30 dias para templates APPROVED
   */
  async editTemplate(templateId: string, components: TemplateComponent[]): Promise<{ success: boolean }> {
    const res = await this.client.post(`/${templateId}`, { components });
    return res.data;
  }

  /**
   * Deleta template (por nome = deleta todas as línguas)
   */
  async deleteTemplate(templateName: string): Promise<{ success: boolean }> {
    const res = await this.client.delete(`/${this.wabaId}/message_templates`, {
      params: { name: templateName },
    });
    return res.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MÍDIA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Upload de mídia para os servidores da Meta
   * Retorna media_id (válido por 30 dias)
   */
  async uploadMedia(filePath: string, mimeType: string): Promise<{ id: string }> {
    const FormData = (await import('form-data')).default;
    const fs = await import('fs');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('type', mimeType);
    form.append('messaging_product', 'whatsapp');

    const res = await this.client.post(`/${this.phoneNumberId}/media`, form, {
      headers: form.getHeaders(),
    });
    return res.data;
  }

  /**
   * Obtém URL de download de uma mídia (URL temporária, ~5 min)
   */
  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    const res = await this.client.get(`/${mediaId}`);
    return res.data;
  }

  /**
   * Download do arquivo de mídia (retorna Buffer)
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const res = await this.client.get(mediaUrl, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SAÚDE & STATUS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Consulta status e qualidade do número
   */
  async getPhoneStatus(): Promise<{
    quality_rating: string;
    status: string;
    messaging_limit_tier?: string;
    display_phone_number?: string;
  }> {
    const res = await this.client.get(
      `/${this.phoneNumberId}`,
      { params: { fields: 'quality_rating,status,messaging_limit_tier,display_phone_number,verified_name' } }
    );
    return res.data;
  }

  /**
   * Consulta perfil comercial
   */
  async getBusinessProfile(): Promise<any> {
    const res = await this.client.get(
      `/${this.phoneNumberId}/whatsapp_business_profile`,
      { params: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' } }
    );
    return res.data;
  }

  /**
   * Atualiza perfil comercial
   */
  async updateBusinessProfile(profile: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    websites?: string[];
    vertical?: string;
  }): Promise<{ success: boolean }> {
    const res = await this.client.post(
      `/${this.phoneNumberId}/whatsapp_business_profile`,
      { messaging_product: 'whatsapp', ...profile }
    );
    return res.data;
  }
}

export default WhatsAppCloudClient;
