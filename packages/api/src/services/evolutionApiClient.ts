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
    // Evolution API v2 accepts both formats; v2 prefers { number, text }
    // but we send both for backwards compatibility with v1 (textMessage: { text })
    const res = await this.client.post(`/message/sendText/${this.instance}`, {
      number,
      text,
      textMessage: { text },
    });
    return res.data;
  }

  // ─── Contacts ───────────────────────────────────────────────────────────

  async findContacts(): Promise<Contact[]> {
    const res = await this.client.post(`/chat/findContacts/${this.instance}`, {});
    return res.data;
  }

  async findContactById(contactId: string): Promise<Contact | null> {
    try {
      const res = await this.client.post(`/chat/findContacts/${this.instance}`, {
        where: { id: contactId },
      });
      const contacts: Contact[] = res.data || [];
      return contacts[0] || null;
    } catch {
      return null;
    }
  }

  async findContactByName(pushName: string): Promise<string | null> {
    const res = await this.client.post(`/chat/findContacts/${this.instance}`, {
      where: { pushName },
    });
    const contacts: Contact[] = res.data || [];
    const match = contacts.find((c) => c.id && c.id.includes('@s.whatsapp.net'));
    return match ? match.id.replace('@s.whatsapp.net', '') : null;
  }

  /**
   * Resolve a LID to a phone number using Evolution API's chat/findContacts.
   * Returns the phone number (digits only) or null.
   */
  async resolveLid(lid: string): Promise<string | null> {
    try {
      // Method 1: Query the LID directly — Evolution API may return the linked number
      const lidContact = await this.findContactById(lid);
      if (lidContact) {
        // Check if the contact object has a 'number' or 'wuid' field with the real phone
        const raw = lidContact as unknown as Record<string, unknown>;
        const number = raw.number || raw.wuid || raw.phone;
        if (number && typeof number === 'string' && number.length >= 10) {
          return number.replace(/\D/g, '');
        }
      }

      // Method 2: Fetch all contacts and cross-reference LID with @s.whatsapp.net entries
      const allContacts = await this.findContacts();
      const lidEntry = allContacts.find(c => c.id === lid);
      if (!lidEntry) return null;

      // Match by profilePictureUrl (most reliable) then by pushName
      for (const c of allContacts) {
        if (!c.id.includes('@s.whatsapp.net')) continue;
        if (lidEntry.profilePictureUrl && c.profilePictureUrl === lidEntry.profilePictureUrl) {
          return c.id.replace('@s.whatsapp.net', '');
        }
      }

      // pushName match as last resort (can be ambiguous)
      if (lidEntry.pushName) {
        const nameMatches = allContacts.filter(c =>
          c.id.includes('@s.whatsapp.net') &&
          c.pushName === lidEntry.pushName
        );
        // Only use if exactly ONE match (avoid ambiguity)
        if (nameMatches.length === 1) {
          return nameMatches[0].id.replace('@s.whatsapp.net', '');
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

export default EvolutionApiClient;
