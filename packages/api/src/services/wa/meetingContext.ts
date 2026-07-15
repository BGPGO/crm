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

export async function buildMeetingContext(
  contactId: string,
  deal?: DealNoShowInfo | null
): Promise<string> {
  try {
    const now = new Date();
    const [upcoming, lastPast] = await Promise.all([
      // endTime (não startTime): reunião EM ANDAMENTO ainda é a reunião atual —
      // o lead que pede o link às 9h02 de uma reunião das 9h00 quer ENTRAR nela,
      // não cair no fluxo de "não existe reunião futura" (caso Ezequiel 15/07).
      prisma.calendlyEvent.findFirst({
        where: { contactId, status: 'active', endTime: { gt: now } },
        orderBy: { startTime: 'asc' },
      }),
      prisma.calendlyEvent.findFirst({
        where: { contactId, startTime: { lte: now } },
        orderBy: { startTime: 'desc' },
      }),
    ]);

    if (upcoming) {
      // Links persistidos pelo calendly-webhook em Activity.metadata,
      // casando pelo calendlyEventId do MESMO evento (nunca de outro).
      const act = await prisma.activity.findFirst({
        where: {
          type: 'MEETING',
          contactId,
          metadata: { path: ['calendlyEventId'], equals: upcoming.calendlyEventId },
        },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      });
      const meta = (act?.metadata ?? {}) as Record<string, unknown>;
      const rescheduleUrl = typeof meta.rescheduleUrl === 'string' ? meta.rescheduleUrl : null;
      const cancelUrl = typeof meta.cancelUrl === 'string' ? meta.cancelUrl : null;
      const location = meta.location as Record<string, unknown> | null | undefined;
      const joinUrl =
        location && typeof location === 'object' && typeof location.join_url === 'string'
          ? location.join_url
          : null;

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
        ctx += `\nSe quiser REAGENDAR: envie este link na própria resposta: ${rescheduleUrl}`;
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
