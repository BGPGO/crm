import axios, { AxiosInstance } from 'axios';
import prisma from '../lib/prisma';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ZApiConfig {
  zapiInstanceId: string;
  zapiToken: string;
  zapiClientToken: string;
}

interface ConnectionStateResponse {
  instance: { instanceName: string; state: string };
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

export class ZApiClient {
  private client: AxiosInstance;
  private instanceId: string;

  constructor(config: ZApiConfig) {
    this.instanceId = config.zapiInstanceId;

    const baseURL = `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiToken}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.zapiClientToken) {
      headers['Client-Token'] = config.zapiClientToken;
    }

    this.client = axios.create({ baseURL, headers });
  }

  static async fromConfig(): Promise<ZApiClient> {
    return ZApiClient.fromDB();
  }

  static async fromDB(): Promise<ZApiClient> {
    let config = await prisma.whatsAppConfig.findFirst();

    if (!config) {
      config = await prisma.whatsAppConfig.create({
        data: {
          zapiInstanceId: process.env.ZAPI_INSTANCE_ID || '',
          zapiToken: process.env.ZAPI_TOKEN || '',
          zapiClientToken: process.env.ZAPI_CLIENT_TOKEN || '',
          botEnabled: false,
          followUpEnabled: false,
        },
      });
    }

    return new ZApiClient({
      zapiInstanceId: config.zapiInstanceId,
      zapiToken: config.zapiToken,
      zapiClientToken: config.zapiClientToken,
    });
  }

  // ─── Instance Management ────────────────────────────────────────────────

  async createInstance(): Promise<any> {
    // Z-API instances are managed via the Z-API dashboard
    return {
      message: 'Z-API instances are managed via the Z-API dashboard (https://app.z-api.io). Create and configure instances there.',
    };
  }

  async connectInstance(): Promise<{ base64?: string }> {
    const res = await this.client.get('/qr-code/image');
    const data = res.data as { value?: string };
    return { base64: data.value };
  }

  async getInstanceStatus(): Promise<ConnectionStateResponse> {
    const res = await this.client.get('/status');
    const data = res.data as { connected?: boolean; error?: string; smartphoneConnected?: boolean };
    return {
      instance: {
        instanceName: this.instanceId,
        state: data.connected ? 'open' : 'close',
      },
    };
  }

  async logoutInstance(): Promise<{ status: string }> {
    // Z-API uses GET for disconnect
    await this.client.get('/disconnect');
    return { status: 'success' };
  }

  async deleteInstance(): Promise<{ status: string }> {
    // Z-API instances are managed via the Z-API dashboard
    return {
      status: 'Z-API instances are managed via the Z-API dashboard. Delete instances there.',
    };
  }

  // ─── Webhook ────────────────────────────────────────────────────────────

  async setWebhook(webhookUrl: string): Promise<any> {
    const res = await this.client.put('/update-every-webhooks', {
      value: webhookUrl,
      notifySentByMe: false,
    });
    return res.data;
  }

  // ─── Messaging ──────────────────────────────────────────────────────────

  async sendText(number: string, text: string): Promise<SendTextResponse> {
    const res = await this.client.post('/send-text', {
      phone: number,
      message: text,
    });
    const data = res.data as { zaapId?: string; messageId?: string };
    // Map Z-API response to match the old interface
    return {
      key: { remoteJid: `${number}@s.whatsapp.net`, fromMe: true, id: data.messageId || data.zaapId || '' },
      message: data as Record<string, unknown>,
      messageTimestamp: String(Date.now()),
      status: 'PENDING',
    };
  }

  // ─── Contacts ───────────────────────────────────────────────────────────

  async findContacts(): Promise<Contact[]> {
    const res = await this.client.get('/contacts', {
      params: { page: 1, pageSize: 100 },
    });
    return res.data;
  }

  async findContactByName(pushName: string): Promise<string | null> {
    const contacts = await this.findContacts();
    const match = contacts.find(
      (c) => c.pushName === pushName && c.id && c.id.includes('@s.whatsapp.net'),
    );
    return match ? match.id.replace('@s.whatsapp.net', '') : null;
  }
}

// Backward compatibility alias
export { ZApiClient as EvolutionApiClient };
export default ZApiClient;
