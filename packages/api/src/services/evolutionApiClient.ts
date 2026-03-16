import axios, { AxiosInstance } from 'axios';
import prisma from '../lib/prisma';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvolutionApiConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
}

interface CreateInstanceResponse {
  instance: Record<string, unknown>;
  hash: string;
  qrcode?: { base64: string };
}

interface ConnectionStateResponse {
  instance: { instanceName: string; state: string };
}

interface WebhookSetResponse {
  webhook: Record<string, unknown>;
}

interface SendTextResponse {
  key: { remoteJid: string; fromMe: boolean; id: string };
  message: Record<string, unknown>;
  messageTimestamp: string;
  status: string;
}

interface Contact {
  id: string;
  pushName?: string;
  profilePictureUrl?: string;
}

// ─── Class ──────────────────────────────────────────────────────────────────

export class EvolutionApiClient {
  private client: AxiosInstance;
  private instance: string;

  constructor(config: EvolutionApiConfig) {
    this.instance = config.instanceName;
    this.client = axios.create({
      baseURL: config.evolutionApiUrl,
      headers: {
        'Content-Type': 'application/json',
        apikey: config.evolutionApiKey,
      },
    });
  }

  /**
   * Creates an EvolutionApiClient from the first WhatsAppConfig record in the DB.
   * If no record exists, creates a default one using environment variables.
   */
  /** Alias for fromDB — used by routes */
  static async fromConfig(): Promise<EvolutionApiClient> {
    return EvolutionApiClient.fromDB();
  }

  static async fromDB(): Promise<EvolutionApiClient> {
    let config = await prisma.whatsAppConfig.findFirst();

    if (!config) {
      config = await prisma.whatsAppConfig.create({
        data: {
          evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
          evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
          instanceName: process.env.INSTANCE_NAME || 'bgpgo-bot',
          botEnabled: false,
          followUpEnabled: false,
        },
      });
    }

    return new EvolutionApiClient({
      evolutionApiUrl: config.evolutionApiUrl,
      evolutionApiKey: config.evolutionApiKey,
      instanceName: config.instanceName,
    });
  }

  // ─── Instance Management ────────────────────────────────────────────────

  async createInstance(): Promise<CreateInstanceResponse> {
    const res = await this.client.post('/instance/create', {
      instanceName: this.instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      rejectCall: true,
      msgCall: 'Não consigo atender ligações por aqui. Me envie uma mensagem de texto!',
      webhookByEvents: false,
      webhookBase64: true,
      webhookEvents: [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    });
    return res.data;
  }

  async connectInstance(): Promise<{ base64?: string }> {
    const res = await this.client.get(`/instance/connect/${this.instance}`);
    return res.data;
  }

  async getInstanceStatus(): Promise<ConnectionStateResponse> {
    const res = await this.client.get(`/instance/connectionState/${this.instance}`);
    return res.data;
  }

  async logoutInstance(): Promise<{ status: string }> {
    const res = await this.client.delete(`/instance/logout/${this.instance}`);
    return res.data;
  }

  async deleteInstance(): Promise<{ status: string }> {
    const res = await this.client.delete(`/instance/delete/${this.instance}`);
    return res.data;
  }

  // ─── Webhook ────────────────────────────────────────────────────────────

  async setWebhook(webhookUrl: string): Promise<WebhookSetResponse> {
    const res = await this.client.post(`/webhook/set/${this.instance}`, {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: true,
      events: [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
      ],
    });
    return res.data;
  }

  // ─── Messaging ──────────────────────────────────────────────────────────

  async sendText(number: string, text: string): Promise<SendTextResponse> {
    const res = await this.client.post(`/message/sendText/${this.instance}`, {
      number,
      textMessage: { text },
    });
    return res.data;
  }

  // ─── Contacts ───────────────────────────────────────────────────────────

  async findContacts(): Promise<Contact[]> {
    const res = await this.client.post(`/chat/findContacts/${this.instance}`, {});
    return res.data;
  }

  async findContactByName(pushName: string): Promise<string | null> {
    const res = await this.client.post(`/chat/findContacts/${this.instance}`, {
      where: { pushName },
    });
    const contacts: Contact[] = res.data || [];
    const match = contacts.find((c) => c.id && c.id.includes('@s.whatsapp.net'));
    return match ? match.id.replace('@s.whatsapp.net', '') : null;
  }
}

export default EvolutionApiClient;
