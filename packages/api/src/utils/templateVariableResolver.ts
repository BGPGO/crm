/**
 * Resolve variáveis de template WABA com base no mapeamento configurado.
 *
 * Fontes disponíveis:
 * - contact.name       — Nome do contato
 * - contact.email      — Email do contato
 * - contact.phone      — Telefone do contato
 * - contact.position   — Cargo do contato
 * - organization.name  — Nome da empresa
 * - deal.title         — Título da negociação
 * - deal.value         — Valor da negociação (formatado em BRL)
 * - deal.stage         — Nome da etapa atual
 * - user.name          — Nome do vendedor responsável
 * - meeting.date       — Data da reunião (dd/mm/yyyy)
 * - meeting.time       — Horário da reunião (HH:MM)
 * - meeting.datetime   — Data e hora (dd/mm às HH:MM)
 * - custom.TEXTO       — Texto fixo literal
 */

import prisma from '../lib/prisma';

interface VariableMapping {
  var: string;    // "{{1}}", "{{2}}", etc.
  source: string; // "contact.name", "meeting.time", "custom.Olá!", etc.
}

interface ResolveContext {
  contactId?: string | null;
  dealId?: string | null;
  meetingId?: string | null;
}

function formatBRL(value: unknown): string {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  });
}

function sortMappings(mappings: VariableMapping[]): VariableMapping[] {
  return [...mappings].sort((a, b) => {
    const numA = parseInt(a.var.replace(/\D/g, ''), 10);
    const numB = parseInt(b.var.replace(/\D/g, ''), 10);
    return numA - numB;
  });
}

export interface ResolveResult {
  parameters: Array<{ type: 'text'; text: string }>;
  /** Se alguma variável não pôde ser resolvida (dado não existe). Não enviar o template. */
  missingVars: Array<{ var: string; source: string }>;
}

export async function resolveTemplateVariables(
  mappings: VariableMapping[] | null | undefined,
  context: ResolveContext,
): Promise<ResolveResult> {
  // Fallback se não há mapeamento configurado
  const effectiveMappings: VariableMapping[] =
    mappings && mappings.length > 0
      ? mappings
      : [{ var: '{{1}}', source: 'contact.name' }];

  const sorted = sortMappings(effectiveMappings);

  // Cache local para evitar múltiplas queries ao mesmo recurso
  let contact: Awaited<ReturnType<typeof prisma.contact.findUnique>> | null | undefined;
  let organization: Awaited<ReturnType<typeof prisma.organization.findUnique>> | null | undefined;
  let deal: Awaited<ReturnType<typeof prisma.deal.findFirst>> | null | undefined;
  let user: Awaited<ReturnType<typeof prisma.user.findUnique>> | null | undefined;
  let meeting: Awaited<ReturnType<typeof prisma.calendlyEvent.findFirst>> | null | undefined;

  const getContact = async () => {
    if (contact !== undefined) return contact;
    if (!context.contactId) { contact = null; return null; }
    contact = await prisma.contact.findUnique({ where: { id: context.contactId } });
    return contact;
  };

  const getOrganization = async () => {
    if (organization !== undefined) return organization;
    const c = await getContact();
    if (!c?.organizationId) { organization = null; return null; }
    organization = await prisma.organization.findUnique({ where: { id: c.organizationId } });
    return organization;
  };

  const getDeal = async () => {
    if (deal !== undefined) return deal;
    if (context.dealId) {
      deal = await prisma.deal.findFirst({
        where: { id: context.dealId },
        include: { stage: true },
      });
    } else if (context.contactId) {
      deal = await prisma.deal.findFirst({
        where: { contactId: context.contactId, status: 'OPEN' },
        include: { stage: true },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      deal = null;
    }
    return deal;
  };

  const getUser = async () => {
    if (user !== undefined) return user;
    const d = await getDeal();
    if (!d?.userId) { user = null; return null; }
    user = await prisma.user.findUnique({ where: { id: d.userId } });
    return user;
  };

  const getMeeting = async () => {
    if (meeting !== undefined) return meeting;
    if (context.meetingId) {
      meeting = await prisma.calendlyEvent.findFirst({
        where: { id: context.meetingId },
      });
    } else if (context.contactId) {
      meeting = await prisma.calendlyEvent.findFirst({
        where: { contactId: context.contactId, status: 'active' },
        orderBy: { startTime: 'desc' },
      });
    } else {
      meeting = null;
    }
    return meeting;
  };

  const results: Array<{ type: 'text'; text: string }> = [];
  const missingVars: Array<{ var: string; source: string }> = [];

  for (const mapping of sorted) {
    const source = mapping.source || '';
    let value = '';

    try {
      if (source.startsWith('contact.')) {
        const c = await getContact();
        const field = source.slice('contact.'.length) as keyof NonNullable<typeof c>;
        value = String(c?.[field] ?? '');

      } else if (source.startsWith('organization.')) {
        const org = await getOrganization();
        const field = source.slice('organization.'.length) as keyof NonNullable<typeof org>;
        value = String(org?.[field] ?? '');

      } else if (source.startsWith('deal.')) {
        const d = await getDeal();
        const sub = source.slice('deal.'.length);
        if (sub === 'title') {
          value = d?.title ?? '';
        } else if (sub === 'value') {
          value = d?.value != null ? formatBRL(d.value) : '';
        } else if (sub === 'stage') {
          // deal is included with stage relation
          const dealWithStage = d as (typeof d & { stage?: { name?: string } }) | null;
          value = dealWithStage?.stage?.name ?? '';
        } else {
          const field = sub as keyof NonNullable<typeof d>;
          value = String(d?.[field] ?? '');
        }

      } else if (source.startsWith('user.')) {
        const u = await getUser();
        const field = source.slice('user.'.length) as keyof NonNullable<typeof u>;
        value = String(u?.[field] ?? '');

      } else if (source.startsWith('meeting.')) {
        const m = await getMeeting();
        const sub = source.slice('meeting.'.length);
        if (m?.startTime) {
          const dt = new Date(m.startTime);
          if (sub === 'date') {
            value = formatDate(dt);
          } else if (sub === 'time') {
            value = formatTime(dt);
          } else if (sub === 'datetime') {
            const day = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
            value = `${day} às ${formatTime(dt)}`;
          } else {
            value = dt.toISOString();
          }
        }

      } else if (source.startsWith('custom.')) {
        value = source.slice('custom.'.length);

      }
    } catch (err) {
      console.error(`[templateVariableResolver] Erro ao resolver source "${source}":`, err);
      value = '';
    }

    // Se variável ficou vazia e não é custom/contact.name (que pode ser vazio OK),
    // marcar como missing pra o chamador decidir se pula o envio
    if (!value && !source.startsWith('custom.')) {
      missingVars.push({ var: mapping.var, source });
      console.warn(`[templateVariableResolver] Variável ${mapping.var} (${source}) não resolvida — dado não encontrado`);
    }

    results.push({ type: 'text', text: value });
  }

  return { parameters: results, missingVars };
}
