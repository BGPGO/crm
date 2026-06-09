/**
 * finhubActiveClients — sincroniza o segmento "Clientes Ativos" a partir do FinHub.
 *
 * Modelo PULL: chama a edge function `active-clients-export` do FinHub (que é o
 * dono da verdade sobre quem é cliente ativo), resolve o melhor email de cada
 * cliente cruzando com os dados do próprio CRM, faz upsert do contato e aplica a
 * tag "Cliente Ativo (FinHub)". Um Segment salvo filtra por essa tag.
 *
 * Resolução de email (prioridade — decisor primeiro, escolha do usuário):
 *   1. Contract do CRM por CNPJ        → emailRepresentante (assina) > emailFinanceiro
 *   2. Contract do CRM por razão/fantasia → idem
 *   3. Emails vindos do FinHub          (clients.email > login real do portal)
 *   4. Organization do CRM por nome     → primeiro contato com email
 *
 * Sem fuzzy (decisão do usuário): só CNPJ e nome exato. Quem não resolve email
 * vai pro relatório de gaps (guardado na description do Segment).
 *
 * Não-bloqueante e idempotente: pode rodar todo dia sem efeito colateral.
 */
import prisma from '../lib/prisma';

const TAG_NAME = 'Cliente Ativo (FinHub)';
const TAG_COLOR = '#16a34a';
const SEGMENT_NAME = 'Clientes Ativos';

const JUNK_EMAIL =
  /(@bgpgo\.com\.br|@bgp\.com\.br|@bgp\.com$|@temp\.bgp|@bgp\.temp|\.temp$|^client_[0-9]|^cliente-|preencha\.meuemail|@bertuzzipatrimonial\.com\.br|@aimocorp\.com\.br)/i;

interface ActiveClient {
  finhubClientId: string;
  name: string;
  cnpj: string | null;
  emails: string[];
}

const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/[^0-9]/g, '');
const cleanEmail = (e: string | null | undefined): string | null => {
  const v = (e ?? '').trim().toLowerCase();
  if (!v || !v.includes('@') || JUNK_EMAIL.test(v)) return null;
  return v;
};

async function fetchActiveClients(url: string, secret: string): Promise<ActiveClient[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-crm-secret': secret },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { clients?: ActiveClient[] };
    return json.clients ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Mapas de Contract do CRM (decisor = emailRepresentante) por CNPJ e por nome. */
async function loadContractEmailMaps() {
  const contracts = await prisma.contract.findMany({
    select: { cnpj: true, razaoSocial: true, nomeFantasia: true, emailRepresentante: true, emailFinanceiro: true },
  });
  const byCnpj = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of contracts) {
    const email = cleanEmail(c.emailRepresentante) ?? cleanEmail(c.emailFinanceiro);
    if (!email) continue;
    const cnpj = onlyDigits(c.cnpj);
    if (cnpj && !byCnpj.has(cnpj)) byCnpj.set(cnpj, email);
    for (const n of [c.razaoSocial, c.nomeFantasia]) {
      const key = (n ?? '').trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, email);
    }
  }
  return { byCnpj, byName };
}

type Maps = Awaited<ReturnType<typeof loadContractEmailMaps>>;

/** Resolve o melhor email + a fonte; null se não achar nada. */
async function resolveEmail(
  client: ActiveClient,
  maps: Maps,
): Promise<{ email: string; source: string } | null> {
  const cnpj = onlyDigits(client.cnpj);
  const nameKey = client.name.trim().toLowerCase();

  // 1 + 2. Contract (decisor) por CNPJ, depois por nome.
  if (cnpj && maps.byCnpj.has(cnpj)) return { email: maps.byCnpj.get(cnpj)!, source: 'crm_contract_cnpj' };
  if (maps.byName.has(nameKey)) return { email: maps.byName.get(nameKey)!, source: 'crm_contract_nome' };

  // 3. Emails do FinHub (já filtrados na origem, mas revalida).
  for (const e of client.emails) {
    const clean = cleanEmail(e);
    if (clean) return { email: clean, source: 'finhub' };
  }

  // 4. Organization do CRM por nome exato (ou CNPJ) → primeiro contato com email.
  const org = await prisma.organization.findFirst({
    where: cnpj
      ? { OR: [{ cnpj }, { name: { equals: client.name, mode: 'insensitive' } }] }
      : { name: { equals: client.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (org) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId: org.id, email: { not: null } },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });
    const clean = cleanEmail(contact?.email);
    if (clean) return { email: clean, source: 'crm_organization_nome' };
  }

  return null;
}

/** Acha contato por email (case-insensitive) ou cria, ligando à organização. */
async function upsertContact(client: ActiveClient, email: string): Promise<string> {
  const existing = await prisma.contact.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const cnpj = onlyDigits(client.cnpj) || null;
  let org = await prisma.organization.findFirst({
    where: cnpj
      ? { OR: [{ cnpj }, { name: { equals: client.name, mode: 'insensitive' } }] }
      : { name: { equals: client.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: client.name, cnpj: cnpj ?? undefined },
      select: { id: true },
    });
  }

  const created = await prisma.contact.create({
    data: { name: client.name, email, organizationId: org.id },
    select: { id: true },
  });
  return created.id;
}

async function ensureTagId(): Promise<string> {
  const tag = await prisma.tag.upsert({
    where: { name: TAG_NAME },
    update: {},
    create: { name: TAG_NAME, color: TAG_COLOR },
  });
  return tag.id;
}

async function ensureSegment(tagId: string, description: string, contactCount: number): Promise<void> {
  const filters = [{ field: 'tags', operator: 'IN', value: [tagId] }];
  const existing = await prisma.segment.findFirst({ where: { name: SEGMENT_NAME } });
  if (existing) {
    await prisma.segment.update({
      where: { id: existing.id },
      data: { filters, description, contactCount, isActive: true },
    });
  } else {
    await prisma.segment.create({
      data: { name: SEGMENT_NAME, description, filters, contactCount, isActive: true },
    });
  }
}

export interface SyncSummary {
  totalAtivos: number;
  comEmail: number;
  semEmail: number;
  porFonte: Record<string, number>;
  gaps: string[];
  removidos: number;
  details?: Array<{ name: string; email: string; source: string; novo: boolean }>;
}

export async function runFinhubActiveClientsSync(
  opts: { dryRun?: boolean } = {},
): Promise<SyncSummary | null> {
  const { dryRun = false } = opts;
  const url = process.env.FINHUB_ACTIVE_CLIENTS_URL;
  const secret = process.env.FINHUB_ACTIVE_CLIENTS_SECRET;
  if (!url || !secret) {
    console.warn('[finhubActiveClients] FINHUB_ACTIVE_CLIENTS_URL/SECRET ausentes — sync não executado');
    return null;
  }

  const clients = await fetchActiveClients(url, secret);
  if (clients.length === 0) {
    console.warn('[finhubActiveClients] edge function retornou 0 clientes — abortando (não mexe nas tags)');
    return null;
  }

  const maps = await loadContractEmailMaps();

  const keepContactIds = new Set<string>();
  const porFonte: Record<string, number> = {};
  const gaps: string[] = [];
  const details: NonNullable<SyncSummary['details']> = [];

  for (const client of clients) {
    try {
      const resolved = await resolveEmail(client, maps);
      if (!resolved) {
        gaps.push(client.name);
        continue;
      }
      porFonte[resolved.source] = (porFonte[resolved.source] ?? 0) + 1;

      if (dryRun) {
        const existing = await prisma.contact.findFirst({
          where: { email: { equals: resolved.email, mode: 'insensitive' } },
          select: { id: true },
        });
        details.push({ name: client.name, email: resolved.email, source: resolved.source, novo: !existing });
      } else {
        const contactId = await upsertContact(client, resolved.email);
        keepContactIds.add(contactId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[finhubActiveClients] erro no cliente "${client.name}": ${msg}`);
      gaps.push(client.name);
    }
  }

  if (dryRun) {
    const comEmail = details.length;
    console.log(
      `[finhubActiveClients] DRY-RUN — ${clients.length} ativos, ${comEmail} com email, ` +
        `${gaps.length} sem email. Fontes:`,
      porFonte,
    );
    return { totalAtivos: clients.length, comEmail, semEmail: gaps.length, porFonte, gaps, removidos: 0, details };
  }

  const tagId = await ensureTagId();

  // Aplica a tag em todos os resolvidos.
  for (const contactId of keepContactIds) {
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      update: {},
      create: { contactId, tagId },
    });
  }

  // Remove a tag de quem saiu da lista de ativos. Guard: só mexe se resolvemos
  // pelo menos um — evita zerar o segmento por um run anômalo.
  const removed =
    keepContactIds.size > 0
      ? await prisma.contactTag.deleteMany({
          where: { tagId, contactId: { notIn: Array.from(keepContactIds) } },
        })
      : { count: 0 };

  const summary: SyncSummary = {
    totalAtivos: clients.length,
    comEmail: keepContactIds.size,
    semEmail: gaps.length,
    porFonte,
    gaps,
    removidos: removed.count,
  };

  // Relatório de gaps na description do Segment (visível na UI).
  const stamp = new Date().toISOString().slice(0, 10);
  let description = `Sincronizado do FinHub em ${stamp}: ${summary.comEmail} clientes ativos no segmento`;
  if (gaps.length > 0) {
    description += ` · ${gaps.length} sem email (cadastrar manual): ${gaps.join(', ')}`;
  }
  if (description.length > 950) description = description.slice(0, 947) + '...';
  await ensureSegment(tagId, description, summary.comEmail);

  console.log(
    `[finhubActiveClients] OK — ${summary.totalAtivos} ativos, ${summary.comEmail} com email, ` +
      `${summary.semEmail} sem email, ${summary.removidos} desmarcados. Fontes:`,
    porFonte,
  );
  if (gaps.length > 0) console.log('[finhubActiveClients] sem email:', gaps.join(', '));

  return summary;
}
