import prisma from '../lib/prisma';
import { buildEdition } from './newsletterBuilder';
import { sendNewsletterTo } from './newsletterService';
import { buildSegmentWhere, SegmentFilter, FilterGroup } from './segmentEngine';

const SEND_DELAY_MS = 600; // Resend: ~10 req/s — folga confortável

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getOrCreateConfig() {
  return prisma.newsletterConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
}

export interface AudienceConfig {
  recipients: unknown;
  segmentId: string | null;
  engagedOnly?: boolean;
  engagedWindowDays?: number;
  graceWindowDays?: number;
}

export interface AudienceBreakdown {
  emails: string[];
  /** Contatos do segmento antes do filtro de engajamento. */
  segmentTotal: number;
  engaged: number;
  /** Cadastro recente demais pra ter tido chance de interagir. */
  grace: number;
  /** Assinantes da LP — opt-in explícito, entram mesmo sem interação. */
  subscribers: number;
  manual: number;
}

/** Emails que abriram ou clicaram alguma edição nos últimos `days` dias. */
async function engagedEmails(days: number): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.newsletterEvent.findMany({
    where: { createdAt: { gte: since }, email: { not: null } },
    select: { email: true },
    distinct: ['email'],
  });
  return new Set(rows.map((r) => r.email!.trim().toLowerCase()).filter(Boolean));
}

/**
 * Audiência final: contatos do segmento (se houver) + emails avulsos,
 * dedupado e sem quem está na UnsubscribeList.
 *
 * Com `engagedOnly`, o segmento é filtrado pela base engajada (decisão do
 * Oliver 06/08, pra parar de queimar reputação com 6,6k de base fria):
 * fica quem interagiu na janela, quem foi cadastrado dentro da carência (ainda
 * não teve chance de interagir) e quem é assinante da LP — esse pediu a news, e
 * a régua da jornada já cuida de esfriá-lo. Avulsos e descadastro não mudam.
 */
export async function resolveAudienceDetailed(
  config: AudienceConfig
): Promise<AudienceBreakdown> {
  const manual = (Array.isArray(config.recipients) ? config.recipients : []) as string[];

  let segmentEmails: string[] = [];
  let segmentTotal = 0;
  let engaged = 0;
  let grace = 0;
  let subscribers = 0;

  if (config.segmentId) {
    const segment = await prisma.segment.findUnique({ where: { id: config.segmentId } });
    if (segment) {
      const where = buildSegmentWhere(
        segment.filters as unknown as SegmentFilter[] | FilterGroup[],
        segment.brand
      );
      const contacts = await prisma.contact.findMany({
        where: { ...where, email: { not: null }, brand: segment.brand },
        select: { email: true, createdAt: true },
      });
      segmentTotal = contacts.length;

      if (!config.engagedOnly) {
        segmentEmails = contacts.map((c) => c.email).filter((e): e is string => Boolean(e));
      } else {
        const engagedSet = await engagedEmails(config.engagedWindowDays ?? 90);
        const subs = await prisma.newsletterSubscriber.findMany({
          where: { estado: { not: 'descadastrado' } },
          select: { email: true },
        });
        const subSet = new Set(subs.map((s) => s.email.trim().toLowerCase()).filter(Boolean));
        const graceSince = new Date(
          Date.now() - (config.graceWindowDays ?? 90) * 24 * 60 * 60 * 1000
        );

        const keep: string[] = [];
        for (const c of contacts) {
          const email = c.email?.trim().toLowerCase();
          if (!email) continue;
          if (engagedSet.has(email)) {
            engaged++;
          } else if (subSet.has(email)) {
            subscribers++;
          } else if (c.createdAt >= graceSince) {
            grace++;
          } else {
            continue;
          }
          keep.push(email);
        }
        segmentEmails = keep;
      }
    } else {
      console.warn(`[newsletter] segmento ${config.segmentId} não existe mais — usando só avulsos`);
    }
  }

  const unsub = await prisma.unsubscribeList.findMany({ select: { email: true } });
  const unsubSet = new Set(unsub.map((u) => u.email.toLowerCase()));

  const emails = [
    ...new Set([...manual, ...segmentEmails].map((e) => e.trim().toLowerCase())),
  ].filter((e) => e && !unsubSet.has(e));

  return { emails, segmentTotal, engaged, grace, subscribers, manual: manual.length };
}

export async function resolveAudience(config: AudienceConfig): Promise<string[]> {
  return (await resolveAudienceDetailed(config)).emails;
}

/**
 * Envia uma edição de teste (monta uma edição nova e manda só pro email dado).
 */
export async function runNewsletterTest(testEmail: string): Promise<{ editionId: string }> {
  const { id } = await buildEdition({ isTest: true });
  const result = await sendNewsletterTo(id, testEmail);
  if (result.error) throw new Error(result.error);
  await prisma.newsletterEdition.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date(), recipientCount: 1 },
  });
  return { editionId: id };
}

/**
 * Execução completa da automação (o que o cron de segunda 5h roda):
 * monta a edição e envia pra lista configurada.
 */
export async function runNewsletterAutomation(opts?: { force?: boolean }): Promise<{
  editionId: string | null;
  sent: number;
  skipped: string | null;
}> {
  const config = await getOrCreateConfig();

  if (!config.enabled && !opts?.force) {
    console.log('[newsletter] automação desativada — pulando');
    return { editionId: null, sent: 0, skipped: 'desativada' };
  }

  const recipients = await resolveAudience(config);
  if (recipients.length === 0) {
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: { lastRunAt: new Date(), lastRunStatus: 'erro: audiência vazia (sem segmento nem avulsos)' },
    });
    console.warn('[newsletter] audiência vazia — nada enviado');
    return { editionId: null, sent: 0, skipped: 'lista vazia' };
  }
  console.log(`[newsletter] audiência resolvida: ${recipients.length} destinatários`);

  try {
    const { id, subject } = await buildEdition();
    console.log(`[newsletter] edição montada: ${id} — "${subject}"`);

    let sent = 0;
    for (const email of recipients) {
      const result = await sendNewsletterTo(id, email);
      if (result.error) {
        console.error(`[newsletter] falha pra ${email}:`, result.error);
      } else {
        sent++;
      }
      await sleep(SEND_DELAY_MS);
    }

    await prisma.newsletterEdition.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: sent },
    });
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: sent === recipients.length ? 'ok' : `ok parcial: ${sent}/${recipients.length}`,
      },
    });

    console.log(`[newsletter] enviada pra ${sent}/${recipients.length} destinatários`);
    return { editionId: id, sent, skipped: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await prisma.newsletterConfig.update({
      where: { id: 'singleton' },
      data: { lastRunAt: new Date(), lastRunStatus: `erro: ${msg.slice(0, 180)}` },
    });
    throw error;
  }
}
