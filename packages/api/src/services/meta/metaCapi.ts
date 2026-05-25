/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Meta Conversions API (CAPI) — envio server-side de eventos ao Meta Pixel
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quando um Deal vira WON, dispara evento `Purchase` (configurável) para o
 * pixel da Meta via Graph API, usando matching de usuário hasheado (SHA-256)
 * + cookies _fbp/_fbc capturados no webhook de entrada (GreatPages).
 *
 * Config: tabela `MetaCapiConfig` (por brand). Tela: /settings/meta-capi.
 *
 * Spec: https://developers.facebook.com/docs/marketing-api/conversions-api/
 * ═══════════════════════════════════════════════════════════════════════════
 */

import crypto from 'crypto';
import { Brand } from '@prisma/client';
import prisma from '../../lib/prisma';

const GRAPH_VERSION = 'v21.0';
const TIMEOUT_MS = 8_000;

// ─── Hashing helpers ────────────────────────────────────────────────────────

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, '');
  return digits.length > 0 ? digits : null;
}

export function normalizeName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function splitName(fullName: string | null | undefined): { fn: string | null; ln: string | null } {
  if (!fullName) return { fn: null, ln: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { fn: null, ln: null };
  const first = parts[0];
  const last = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { fn: normalizeName(first), ln: normalizeName(last) };
}

// ─── User data builder ──────────────────────────────────────────────────────

type ContactLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
};

type LeadTrackingLike = {
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
} | null;

export type UserData = {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
};

export function buildUserData(contact: ContactLike, lead: LeadTrackingLike): UserData {
  const userData: UserData = {};

  const email = normalizeEmail(contact.email);
  if (email) userData.em = [sha256(email)];

  const phone = normalizePhone(contact.phone);
  if (phone) userData.ph = [sha256(phone)];

  const { fn, ln } = splitName(contact.name);
  if (fn) userData.fn = [sha256(fn)];
  if (ln) userData.ln = [sha256(ln)];

  if (contact.id) userData.external_id = [sha256(contact.id)];

  if (lead) {
    if (lead.ip) userData.client_ip_address = lead.ip;
    if (lead.userAgent) userData.client_user_agent = lead.userAgent;
    if (lead.fbc) userData.fbc = lead.fbc;
    if (lead.fbp) userData.fbp = lead.fbp;
  }

  return userData;
}

// ─── Meta API call ──────────────────────────────────────────────────────────

type CapiEventPayload = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: string;
  event_source_url?: string;
  user_data: UserData;
  custom_data?: Record<string, unknown>;
};

type CapiResponse = {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: unknown;
};

export type SendResult = {
  success: boolean;
  response?: CapiResponse;
  error?: string;
};

async function postToMeta(
  pixelId: string,
  accessToken: string,
  events: CapiEventPayload[],
  testEventCode?: string | null
): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`;

  const body: Record<string, unknown> = { data: events };
  if (testEventCode) body.test_event_code = testEventCode;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => ({}))) as CapiResponse;

    if (!res.ok) {
      return {
        success: false,
        response: json,
        error: `Meta CAPI HTTP ${res.status}: ${JSON.stringify(json?.error ?? json)}`,
      };
    }

    return { success: true, response: json };
  } catch (err: any) {
    return {
      success: false,
      error: err?.name === 'AbortError' ? 'Meta CAPI timeout' : `Meta CAPI error: ${err?.message ?? String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main entrypoint: Deal WON ──────────────────────────────────────────────

type DealLike = {
  id: string;
  brand: Brand;
  contactId: string | null;
  value: unknown; // Prisma Decimal | number | null
  closedAt?: Date | null;
};

function dealValueToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  // Prisma Decimal exposes toNumber()
  const anyVal = value as { toNumber?: () => number };
  if (typeof anyVal.toNumber === 'function') {
    try { return anyVal.toNumber(); } catch { /* fall through */ }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function sendDealWonEvent(deal: DealLike): Promise<SendResult> {
  try {
    const config = await prisma.metaCapiConfig.findUnique({ where: { brand: deal.brand } });

    if (!config || !config.isActive) {
      return { success: false, error: 'Meta CAPI not configured or inactive for this brand' };
    }
    if (!config.pixelId || !config.accessToken) {
      return { success: false, error: 'Meta CAPI missing pixelId or accessToken' };
    }

    if (!deal.contactId) {
      return { success: false, error: 'Deal has no contact — cannot send CAPI event' };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: deal.contactId },
      select: { id: true, email: true, phone: true, name: true },
    });
    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }

    // Pega LeadTracking mais recente do contato (fbp/fbc/ip/UA)
    const lead = await prisma.leadTracking.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      select: { ip: true, userAgent: true, fbp: true, fbc: true },
    });

    const closedAt = deal.closedAt ? new Date(deal.closedAt) : new Date();
    const eventTime = Math.floor(closedAt.getTime() / 1000);
    const eventId = `deal_${deal.id}_${eventTime}`;

    const baseUrl = process.env.PUBLIC_WEB_URL || process.env.CRM_PUBLIC_URL || 'https://crm.bgpgo.com';
    const eventSourceUrl = `${baseUrl.replace(/\/$/, '')}/deals/${deal.id}`;

    const event: CapiEventPayload = {
      event_name: config.eventName || 'Purchase',
      event_time: eventTime,
      event_id: eventId,
      action_source: 'system_generated',
      event_source_url: eventSourceUrl,
      user_data: buildUserData(contact, lead),
      custom_data: {
        currency: 'BRL',
        value: dealValueToNumber(deal.value),
      },
    };

    const result = await postToMeta(config.pixelId, config.accessToken, [event], config.testEventCode);

    if (result.success) {
      console.log(`[meta-capi] Deal ${deal.id} WON → enviado (events_received=${result.response?.events_received}, fbtrace=${result.response?.fbtrace_id})`);
    } else {
      console.error(`[meta-capi] Deal ${deal.id} WON falhou:`, result.error, result.response);
    }

    return result;
  } catch (err: any) {
    console.error('[meta-capi] sendDealWonEvent unexpected error:', err);
    return { success: false, error: err?.message ?? String(err) };
  }
}

// ─── Lead Qualificado (transição pra "Reunião agendada") ───────────────────

const MEETING_STAGE_PATTERNS = ['reunião agendada', 'reuniao agendada', 'reunião marcada', 'reuniao marcada'];

export function isMeetingScheduledStage(stageName: string | null | undefined): boolean {
  if (!stageName) return false;
  const lower = stageName.toLowerCase();
  return MEETING_STAGE_PATTERNS.some(p => lower.includes(p));
}

export async function sendLeadQualifiedEvent(deal: DealLike & { stageChangedAt?: Date | null }): Promise<SendResult> {
  try {
    const config = await prisma.metaCapiConfig.findUnique({ where: { brand: deal.brand } });
    if (!config || !config.isActive) {
      return { success: false, error: 'Meta CAPI not configured or inactive for this brand' };
    }
    if (!config.pixelId || !config.accessToken) {
      return { success: false, error: 'Meta CAPI missing pixelId or accessToken' };
    }
    if (!deal.contactId) {
      return { success: false, error: 'Deal has no contact — cannot send Lead_Qualificado' };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: deal.contactId },
      select: { id: true, email: true, phone: true, name: true },
    });
    if (!contact) return { success: false, error: 'Contact not found' };

    const lead = await prisma.leadTracking.findFirst({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      select: { ip: true, userAgent: true, fbp: true, fbc: true },
    });

    const eventTime = Math.floor(Date.now() / 1000);
    // event_id estável por deal — Meta deduplica re-entradas na stage automaticamente
    const eventId = `leadq_${deal.id}`;

    const baseUrl = process.env.PUBLIC_WEB_URL || process.env.CRM_PUBLIC_URL || 'https://crm.bgpgo.com';

    const event: CapiEventPayload = {
      event_name: 'Lead_Qualificado',
      event_time: eventTime,
      event_id: eventId,
      action_source: 'system_generated',
      event_source_url: `${baseUrl.replace(/\/$/, '')}/deals/${deal.id}`,
      user_data: buildUserData(contact, lead),
      custom_data: {
        currency: 'BRL',
        value: dealValueToNumber(deal.value),
      },
    };

    const result = await postToMeta(config.pixelId, config.accessToken, [event], config.testEventCode);

    if (result.success) {
      console.log(`[meta-capi] Deal ${deal.id} Lead_Qualificado → enviado (events_received=${result.response?.events_received}, fbtrace=${result.response?.fbtrace_id})`);
    } else {
      console.error(`[meta-capi] Deal ${deal.id} Lead_Qualificado falhou:`, result.error, result.response);
    }
    return result;
  } catch (err: any) {
    console.error('[meta-capi] sendLeadQualifiedEvent unexpected error:', err);
    return { success: false, error: err?.message ?? String(err) };
  }
}

// ─── Test event (UI) ────────────────────────────────────────────────────────

export type TestEventInput = {
  email?: string | null;
  phone?: string | null;
  value?: number | null;
  eventName?: string | null;
};

export async function sendTestEvent(brand: Brand, input: TestEventInput): Promise<SendResult> {
  const config = await prisma.metaCapiConfig.findUnique({ where: { brand } });
  if (!config) return { success: false, error: 'Meta CAPI config not found for this brand' };
  if (!config.pixelId || !config.accessToken) {
    return { success: false, error: 'Meta CAPI missing pixelId or accessToken' };
  }

  const userData: UserData = {};
  const email = normalizeEmail(input.email);
  if (email) userData.em = [sha256(email)];
  const phone = normalizePhone(input.phone);
  if (phone) userData.ph = [sha256(phone)];

  const eventTime = Math.floor(Date.now() / 1000);

  const event: CapiEventPayload = {
    event_name: input.eventName || config.eventName || 'Purchase',
    event_time: eventTime,
    event_id: `test_${brand}_${eventTime}`,
    action_source: 'system_generated',
    user_data: userData,
    custom_data: {
      currency: 'BRL',
      value: typeof input.value === 'number' && Number.isFinite(input.value) ? input.value : 0,
    },
  };

  // Test events sempre forçam test_event_code se configurado
  return postToMeta(config.pixelId, config.accessToken, [event], config.testEventCode);
}
