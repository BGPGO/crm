import { Resend } from 'resend';
import prisma from '../lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

const TRACKING_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';

export const NEWSLETTER_FROM = 'BGP Insights <insights@bertuzzipatrimonial.app.br>';

export interface NewsletterLink {
  url: string;
  label: string;
}

export type NewsletterLinksMap = Record<string, NewsletterLink>;

/**
 * Extrai o mapa de links do HTML cru: todo <a ... data-slot="x" ... href="y">.
 * O label vem do texto visível do anchor (ou do alt da imagem interna).
 */
export function extractLinks(html: string): NewsletterLinksMap {
  const links: NewsletterLinksMap = {};
  const anchorRe = /<a\b[^>]*data-slot="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const slot = m[1];
    const hrefMatch = m[0].match(/href="([^"]+)"/i);
    if (!hrefMatch) continue;
    const inner = m[2];
    const label =
      inner
        .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || slot;
    // Primeiro anchor do slot define o destino (thumb e título compartilham slot)
    if (!links[slot]) {
      links[slot] = { url: hrefMatch[1], label };
    } else if (links[slot].label === slot && label !== slot) {
      links[slot].label = label;
    }
  }
  return links;
}

/**
 * Reescreve os hrefs de todo <a data-slot> para o redirect de tracking e
 * injeta o pixel de abertura. `email` identifica o destinatário nos eventos.
 */
export function instrumentHtml(html: string, editionId: string, email: string): string {
  const emailB64 = Buffer.from(email, 'utf-8').toString('base64url');

  let out = html.replace(
    /(<a\b[^>]*data-slot="([^"]+)"[^>]*)href="[^"]+"/gi,
    (_full, prefix: string, slot: string) =>
      `${prefix}href="${TRACKING_BASE_URL}/nl/c/${editionId}/${encodeURIComponent(slot)}/${emailB64}"`
  );

  // Alguns anchors podem ter href ANTES de data-slot — segunda passada cobre essa ordem.
  out = out.replace(
    /(<a\b[^>]*)href="[^"]+"([^>]*data-slot="([^"]+)")/gi,
    (_full, pre: string, post: string, slot: string) =>
      `${pre}href="${TRACKING_BASE_URL}/nl/c/${editionId}/${encodeURIComponent(slot)}/${emailB64}"${post}`
  );

  const pixel = `<img src="${TRACKING_BASE_URL}/nl/o/${editionId}/${emailB64}" width="1" height="1" style="display:none" alt="" />`;
  if (out.includes('</body>')) {
    out = out.replace('</body>', `${pixel}</body>`);
  } else {
    out += pixel;
  }
  return out;
}

/**
 * Envia uma edição para um destinatário com todos os links instrumentados.
 */
export async function sendNewsletterTo(
  editionId: string,
  email: string
): Promise<{ id: string | null; error: string | null }> {
  const edition = await prisma.newsletterEdition.findUnique({ where: { id: editionId } });
  if (!edition || !edition.html) {
    return { id: null, error: 'Edição não encontrada ou sem HTML' };
  }

  const html = instrumentHtml(edition.html, edition.id, email);

  const { data, error } = await resend.emails.send({
    from: NEWSLETTER_FROM,
    to: [email],
    subject: edition.subject,
    html,
  });

  if (error) {
    return { id: null, error: error.message };
  }
  return { id: data?.id ?? null, error: null };
}

export interface SlotMetric {
  slot: string;
  label: string;
  url: string;
  uniqueClicks: number;
  totalClicks: number;
}

export interface EditionMetrics {
  recipientCount: number;
  uniqueOpens: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
  slots: SlotMetric[];
}

/**
 * Métricas agregadas de uma edição: aberturas/cliques únicos (por email)
 * e quebra por slot (botão).
 */
export async function getEditionMetrics(editionId: string): Promise<EditionMetrics> {
  const edition = await prisma.newsletterEdition.findUniqueOrThrow({
    where: { id: editionId },
    select: { recipientCount: true, links: true },
  });

  const events = await prisma.newsletterEvent.findMany({
    where: { editionId },
    select: { type: true, slot: true, email: true },
  });

  const openEmails = new Set<string>();
  const clickEmails = new Set<string>();
  let totalOpens = 0;
  let totalClicks = 0;
  const bySlot = new Map<string, { unique: Set<string>; total: number }>();

  for (const ev of events) {
    const who = ev.email || 'anon';
    if (ev.type === 'OPEN') {
      totalOpens++;
      openEmails.add(who);
    } else if (ev.type === 'CLICK') {
      totalClicks++;
      clickEmails.add(who);
      const slot = ev.slot || 'desconhecido';
      if (!bySlot.has(slot)) bySlot.set(slot, { unique: new Set(), total: 0 });
      const s = bySlot.get(slot)!;
      s.total++;
      s.unique.add(who);
    }
  }

  const linksMap = (edition.links as unknown as NewsletterLinksMap | null) || {};
  const slotKeys = new Set<string>([...Object.keys(linksMap), ...bySlot.keys()]);

  const slots: SlotMetric[] = [...slotKeys].map((slot) => ({
    slot,
    label: linksMap[slot]?.label || slot,
    url: linksMap[slot]?.url || '',
    uniqueClicks: bySlot.get(slot)?.unique.size || 0,
    totalClicks: bySlot.get(slot)?.total || 0,
  }));
  slots.sort((a, b) => b.uniqueClicks - a.uniqueClicks || b.totalClicks - a.totalClicks);

  return {
    recipientCount: edition.recipientCount,
    uniqueOpens: openEmails.size,
    totalOpens,
    uniqueClicks: clickEmails.size,
    totalClicks,
    slots,
  };
}
