// bgpmassaClient.ts
// Cliente do Messenger interno (bgpmassa) — canal Comercial (número humano).
//
// A Z-API só aceita um webhook por instância e o da linha Comercial pertence ao
// Messenger. Então o CRM NÃO fala com a Z-API: lê e envia PELO Messenger, com uma
// conta de serviço restrita à instância Comercial. O que o CRM envia sai pelo
// número Comercial e aparece no Messenger na hora pro resto do time.
//
// Env vars (adicionar no Coolify antes do deploy):
//   BGPMASSA_API_URL                — default https://messenger.bertuzzipatrimonial.com.br/api
//   BGPMASSA_SERVICE_EMAIL          — conta de serviço (ex.: crm@bgpmassa.com)
//   BGPMASSA_SERVICE_PASSWORD
//   BGPMASSA_COMERCIAL_INSTANCE_ID  — uuid da instância Comercial no Messenger

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.BGPMASSA_API_URL || 'https://messenger.bertuzzipatrimonial.com.br/api';

// Access token do Messenger expira em 15min; o refresh é cookie httpOnly (inviável
// server-to-server), então refazemos o login com margem de 1min.
const TOKEN_TTL_MS = 14 * 60 * 1000;

export function comercialInstanceId(): string {
  return process.env.BGPMASSA_COMERCIAL_INSTANCE_ID || '';
}

export function isComercialConfigured(): boolean {
  return Boolean(
    process.env.BGPMASSA_SERVICE_EMAIL &&
    process.env.BGPMASSA_SERVICE_PASSWORD &&
    comercialInstanceId()
  );
}

// ─── Token cache ─────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  const res = await axios.post(
    `${BASE_URL}/auth/login`,
    {
      email: process.env.BGPMASSA_SERVICE_EMAIL,
      password: process.env.BGPMASSA_SERVICE_PASSWORD,
    },
    { timeout: 10_000 }
  );
  const token = (res.data as { accessToken?: string })?.accessToken;
  if (!token) throw new Error('Login no Messenger não retornou accessToken');
  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return login();
}

async function client(): Promise<AxiosInstance> {
  const token = await getToken();
  return axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

/** Executa a chamada; num 401 (token vencido/invalidado) refaz o login e tenta 1x. */
async function withAuthRetry<T>(fn: (c: AxiosInstance) => Promise<T>): Promise<T> {
  try {
    return await fn(await client());
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      cachedToken = null;
      return fn(await client());
    }
    throw err;
  }
}

// ─── Shapes (conforme a API do bgpmassa) ─────────────────────────────────────

export interface MassaConversation {
  id: string;
  isGroup?: boolean;
  contact?: { id: string; phone: string; name: string | null } | null;
  lastMessageAt?: string | null;
  // última mensagem (array de 1 elemento no list endpoint)
  messages?: Array<{
    id: string;
    body: string | null;
    direction: 'INBOUND' | 'OUTBOUND';
    type?: string;
    createdAt: string;
  }>;
  [key: string]: unknown;
}

export interface MassaMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  // TEXT | IMAGE | AUDIO | VIDEO | DOCUMENT | STICKER | LOCATION | TEMPLATE | CONTACT
  type?: string;
  // texto quando TEXT; string JSON ({url, caption, fileName...}) quando mídia
  body?: string | null;
  senderName?: string | null; // participante de grupo (inbound)
  sender?: { id: string; name: string } | null; // quem da equipe enviou (outbound)
  createdAt?: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Procura a conversa privada do telefone na instância Comercial (sem criar).
 * `search` do Messenger casa contact.phone por `contains` (dígito puro) — busca
 * pelos 8 dígitos finais e confere o resto aqui, cobrindo a variante sem o 9.
 */
export async function findConversationByPhone(phone: string): Promise<MassaConversation | null> {
  const digits = phone.replace(/\D/g, '');
  const suffix = digits.slice(-8);
  return withAuthRetry(async (c) => {
    const res = await c.get('/conversations', {
      params: { instanceId: comercialInstanceId(), search: suffix, chatType: 'private', limit: 30 },
    });
    const items = ((res.data as { items?: MassaConversation[] })?.items) || [];
    return (
      items.find(
        (conv) => !conv.isGroup && (conv.contact?.phone || '').endsWith(suffix)
      ) || null
    );
  });
}

/**
 * Lista conversas privadas da instância Comercial.
 * status 'UNANSWERED' = timer de SLA rodando (lead esperando resposta) — definição do próprio Messenger.
 */
export async function listConversations(opts: {
  status?: string;
  limit?: number;
  page?: number;
}): Promise<MassaConversation[]> {
  return withAuthRetry(async (c) => {
    const res = await c.get('/conversations', {
      params: {
        instanceId: comercialInstanceId(),
        chatType: 'private',
        page: opts.page || 1,
        limit: opts.limit || 100,
        ...(opts.status ? { status: opts.status } : {}),
      },
    });
    return ((res.data as { items?: MassaConversation[] })?.items) || [];
  });
}

/** Acha OU CRIA a conversa privada do telefone na instância Comercial. Retorna só o id. */
export async function openPrivateConversation(phone: string): Promise<{ id: string }> {
  const digits = phone.replace(/\D/g, '');
  return withAuthRetry(async (c) => {
    const res = await c.post('/conversations/open-private', {
      instanceId: comercialInstanceId(),
      phone: digits, // sempre com DDI 55 — o normalize do Messenger não adiciona o 55
    });
    return res.data as { id: string };
  });
}

/** Mensagens da conversa — page 1 = mais recente; items em ordem ascendente. */
export async function getMessages(conversationId: string, limit = 100): Promise<MassaMessage[]> {
  return withAuthRetry(async (c) => {
    const res = await c.get(`/messages/${conversationId}`, { params: { page: 1, limit } });
    return ((res.data as { items?: MassaMessage[] })?.items) || [];
  });
}

/**
 * Envia texto pela instância da conversa (sai pelo número Comercial).
 * signatureName = quem está enviando de verdade — o Messenger assina *Nome:* no corpo
 * (versões antigas do Messenger ignoram o campo e assinam com a conta de serviço).
 */
export async function sendMessage(
  conversationId: string,
  content: string,
  signatureName?: string
): Promise<MassaMessage> {
  return withAuthRetry(async (c) => {
    const res = await c.post(`/messages/${conversationId}`, {
      body: content,
      ...(signatureName ? { signatureName } : {}),
    });
    return res.data as MassaMessage;
  });
}
