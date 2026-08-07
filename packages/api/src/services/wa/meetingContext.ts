import prisma from '../../lib/prisma';

/**
 * Contexto de reunião do lead pra BIA (bloco "REUNIÃO DO LEAD").
 *
 * Máquina de estados:
 * - Evento ativo com endTime futuro (marcado OU em andamento) → reunião atual +
 *   links de reagendar/cancelar (e de entrar, quando houver location/join_url).
 * - Sem futuro + noShow  → teve reunião e não compareceu; remarcar = NOVO
 *   agendamento (reschedule_url de evento passado não funciona).
 * - Sem futuro + passado → já fez reunião; não oferecer diagnóstico como novidade.
 * - Sem histórico algum  → retorna '' (lead frio: contexto idêntico ao atual).
 *
 * Falha segura: qualquer erro → '' (comportamento de hoje). Só leitura.
 */

const TZ = 'America/Sao_Paulo';

function fmtDataHora(d: Date): string {
  const data = d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ,
  });
  const hora = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
  return `${data} às ${hora}`;
}

interface DealNoShowInfo {
  noShow: boolean;
  noShowAt: Date | null;
}

/**
 * Contatos-irmãos com o MESMO telefone (comparação só por dígitos, sufixo de
 * 9 — o número local BR, imune a DDI/DDD e formatação). Caso Sardis 21/07:
 * o Calendly criou contato duplicado (email diferente + fone formatado) e a
 * reunião ficou pendurada no irmão — a conversa do WhatsApp apontava pro
 * contato sem reunião e a BIA mandou CTA de agendamento com reunião marcada
 * pra dali a 1h. A reunião vale pro TELEFONE, não pro registro de contato.
 */
async function contactIdsSharingPhone(contactId: string): Promise<string[]> {
  const self = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { phone: true },
  });
  const digits = (self?.phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return [contactId];
  const suffix = digits.slice(-9);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Contact"
    WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE ${'%' + suffix}
  `;
  const ids = new Set(rows.map((r) => r.id));
  ids.add(contactId);
  return [...ids];
}

export interface UpcomingMeetingLinks {
  event: {
    id: string;
    calendlyEventId: string;
    startTime: Date;
    endTime: Date;
    hostName: string | null;
  };
  rescheduleUrl: string | null;
  cancelUrl: string | null;
  joinUrl: string | null;
}

/**
 * Reunião ativa atual (marcada OU em andamento) + os links do Calendly.
 *
 * Os links vivem em Activity.metadata, gravados pelo calendly-webhook, e são
 * casados pelo calendlyEventId do MESMO evento (nunca de outro).
 */
async function findUpcomingWithLinks(
  contactIds: string[],
  now: Date,
): Promise<UpcomingMeetingLinks | null> {
  // endTime (não startTime): reunião EM ANDAMENTO ainda é a reunião atual —
  // o lead que pede o link às 9h02 de uma reunião das 9h00 quer ENTRAR nela,
  // não cair no fluxo de "não existe reunião futura" (caso Ezequiel 15/07).
  const event = await prisma.calendlyEvent.findFirst({
    where: { contactId: { in: contactIds }, status: 'active', endTime: { gt: now } },
    orderBy: { startTime: 'asc' },
    select: { id: true, calendlyEventId: true, startTime: true, endTime: true, hostName: true },
  });
  if (!event) return null;

  const act = await prisma.activity.findFirst({
    where: {
      type: 'MEETING',
      contactId: { in: contactIds },
      metadata: { path: ['calendlyEventId'], equals: event.calendlyEventId },
    },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const meta = (act?.metadata ?? {}) as Record<string, unknown>;
  const location = meta.location as Record<string, unknown> | null | undefined;

  return {
    event,
    rescheduleUrl: typeof meta.rescheduleUrl === 'string' ? meta.rescheduleUrl : null,
    cancelUrl: typeof meta.cancelUrl === 'string' ? meta.cancelUrl : null,
    joinUrl:
      location && typeof location === 'object' && typeof location.join_url === 'string'
        ? location.join_url
        : null,
  };
}

/**
 * Reunião ativa + links do lead, pelo telefone (contatos-irmãos incluídos).
 * Falha segura: qualquer erro → null. Só leitura.
 */
export async function getUpcomingMeetingLinks(
  contactId: string,
): Promise<UpcomingMeetingLinks | null> {
  try {
    const contactIds = await contactIdsSharingPhone(contactId);
    return await findUpcomingWithLinks(contactIds, new Date());
  } catch (err) {
    console.error('[meetingContext] Falha ao buscar links da reunião:', err);
    return null;
  }
}

export async function buildMeetingContext(
  contactId: string,
  deal?: DealNoShowInfo | null
): Promise<string> {
  try {
    const now = new Date();
    const contactIds = await contactIdsSharingPhone(contactId);
    const [links, lastPast] = await Promise.all([
      findUpcomingWithLinks(contactIds, now),
      prisma.calendlyEvent.findFirst({
        where: { contactId: { in: contactIds }, startTime: { lte: now } },
        orderBy: { startTime: 'desc' },
      }),
    ]);

    if (links) {
      const { event: upcoming, rescheduleUrl, cancelUrl, joinUrl } = links;
      const emAndamento = upcoming.startTime <= now;
      let ctx = `\n\n=== REUNIÃO DO LEAD (única fonte da verdade — NUNCA invente horário ou link) ===`;
      ctx += `\nReunião ${emAndamento ? 'EM ANDAMENTO (já começou' : 'MARCADA'}: ${fmtDataHora(
        upcoming.startTime
      )} (horário de Brasília)${upcoming.hostName ? `, com ${upcoming.hostName}` : ''}${
        emAndamento ? ' — estão te esperando na sala AGORA)' : ''
      }.`;
      if (emAndamento) {
        ctx += `\nPrioridade absoluta: fazer o lead ENTRAR na reunião o mais rápido possível. Nada de conversa longa.`;
      }
      ctx += `\nSe o lead perguntar o horário: responda com a data/hora acima, direto.`;
      ctx += `\nNÃO tente marcar outra reunião — já existe uma.`;
      if (joinUrl) {
        ctx += `\nSe pedir o link pra ENTRAR na reunião (videochamada): envie ${joinUrl}`;
      } else {
        ctx += `\nLink pra ENTRAR na reunião (videochamada): você NÃO tem. Se o lead pedir, diga que vai acionar o time pra enviar imediatamente — NUNCA responda com link/botão de agendamento e NUNCA diga "vou te mandar o link" sem explicar que vem de um humano. Nesse caso, termine sua resposta com o marcador [ACIONAR_HUMANO] (interno — o lead não vê; ele aciona o time de verdade).`;
      }
      if (rescheduleUrl) {
        // O link sai num botão que o sistema envia sozinho (sendBotResponse) —
        // URL escrita no texto é apagada antes do envio, então pedir pra IA
        // "mandar o link" só produzia promessa sem link (23 de 24 pedidos de
        // reagendamento ficaram sem link em 35 dias, medido em 07/08).
        ctx += `\nSe quiser REAGENDAR: confirme que vai mandar o link (ex.: "Claro! Já te mando o link pra remarcar") — NÃO escreva a URL no texto. O sistema envia o botão de reagendar automaticamente.`;
      }
      if (cancelUrl) {
        ctx += `\nSe quiser CANCELAR: ${cancelUrl}`;
      }
      return ctx;
    }

    const teveNoShow = deal?.noShow === true;
    if (!teveNoShow && !lastPast) return '';

    let ctx = `\n\n=== SITUAÇÃO DE REUNIÃO (única fonte da verdade) ===`;
    ctx += `\nNÃO existe reunião futura marcada. Se o histórico da conversa mencionar reunião com data/hora, ela JÁ PASSOU — nunca fale dela como se fosse hoje ou como compromisso atual.`;
    if (teveNoShow) {
      ctx += `\nO lead tinha reunião${
        lastPast ? ` (${fmtDataHora(lastPast.startTime)})` : ''
      } e NÃO COMPARECEU (no-show${
        deal?.noShowAt
          ? ` registrado em ${deal.noShowAt.toLocaleDateString('pt-BR', { timeZone: TZ })}`
          : ''
      }).`;
      ctx += `\nObjetivo: remarcar com leveza, sem tom de cobrança e sem tratar como lead novo. Remarcar = NOVO agendamento (o sistema envia o botão quando houver intenção); link de reagendamento da reunião perdida NÃO funciona mais.`;
    } else if (lastPast) {
      ctx += `\nÚltima reunião registrada: ${fmtDataHora(lastPast.startTime)}${
        lastPast.hostName ? `, com ${lastPast.hostName}` : ''
      }. O lead JÁ CONVERSOU com a gente — não ofereça o diagnóstico como se fosse a primeira vez; reconheça o histórico e foque no próximo passo da etapa atual.`;
    }
    return ctx;
  } catch (err) {
    console.error('[meetingContext] Falha ao montar contexto de reunião (seguindo sem ele):', err);
    return '';
  }
}
