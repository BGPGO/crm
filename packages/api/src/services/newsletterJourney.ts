import { Resend } from 'resend';
import prisma from '../lib/prisma';
import { logActivity } from './activityLogger';
import { sendLeadNotifications } from './leadNotificationService';
import {
  resolveLeadPipeline,
  stageIdFor,
  SDR_BY_PIPELINE,
  PIPELINE_BI,
  PIPELINE_CONTROLADORIA,
  LEGACY_DEFAULT_OWNER_ID,
} from '../lib/pipelines';
import { NEWSLETTER_FROM } from './newsletterService';

// ─── Jornada da newsletter (fluxograma 08/2026) ─────────────────────────────
//
// Inscrito pela LP NÃO é lead de venda: vira Contact + NewsletterSubscriber,
// sem deal. A jornada: welcome 5min após o cadastro → nutrição pelas 3
// primeiras edições (abriu +1, clicou +1, máx 2/edição, máx 6) → checkpoint:
// 5-6 pts contato direto, 3-4 exploratório, 0-2 frio. Tier 3 (analista) não
// pontua — fica no radar do CS e o gatilho é o clique no CTA "Falar com a BGP".
// Só no handoff nasce o deal no funil de venda, com tarefa pro SDR do funil.
//
// O welcome NÃO usa o motor de automações de propósito: processEnrollments()
// auto-completa enrollment de contato sem deal aberto — assinante não tem deal.

const resend = new Resend(process.env.RESEND_API_KEY);
const TRACKING_BASE_URL = process.env.API_URL || 'http://localhost:3001/api';

const WELCOME_DELAY_MS = 5 * 60 * 1000; // fluxograma: disparo 5min após o cadastro
const CTA_SLOT = 'cta-falar';
// Clique em 4+ slots distintos na mesma edição = scanner de provedor varrendo
// links (medido em 20/07: ~92% dos "cliques" da news). Descarta os cliques.
const SCANNER_MIN_SLOTS = 4;
const CHECKPOINT_EDICOES = 3;

export const ESTADOS = [
  'inscrito',
  'nutricao',
  'radar_cs',
  'qualificado_direto',
  'qualificado_exploratorio',
  'convertido',
  'frio',
  'descadastrado',
] as const;
export type EstadoJornada = (typeof ESTADOS)[number];

// ─── Tier pelo cargo ─────────────────────────────────────────────────────────

const TIER1_RX = /s[oó]ci|diretor|c-?level|ceo|cfo|coo|founder|fundador|presidente|dono|propriet/i;
const TIER2_RX = /gerente|gestor|coordenador|supervisor|head|l[ií]der/i;
const TIER3_RX = /analista|assistente|auxiliar|estagi/i;

export function tierFromCargo(cargo: string | null | undefined): number | null {
  if (!cargo) return null;
  if (TIER1_RX.test(cargo)) return 1;
  if (TIER2_RX.test(cargo)) return 2;
  if (TIER3_RX.test(cargo)) return 3;
  return null; // "Outro" e cargos não mapeados seguem o caminho do checkpoint
}

// ─── Inscrição (chamada pelo webhook incoming) ──────────────────────────────

export interface SubscribePayload {
  contactId: string;
  email: string;
  cargo?: string | null;
  setor?: string | null;
  segmentoDetalhe?: string | null;
  faturamento?: string | null;
}

export async function subscribeFromWebhook(payload: SubscribePayload) {
  const { contactId, email } = payload;
  const tier = tierFromCargo(payload.cargo);

  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { contactId },
  });

  let subscriber;
  if (existing) {
    // Re-inscrição: atualiza a qualificação; quem tinha esfriado/descadastrado
    // volta pra jornada (sem novo welcome — já recebeu um dia).
    const reativa = existing.estado === 'frio' || existing.estado === 'descadastrado';
    subscriber = await prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: {
        email,
        ...(payload.cargo ? { cargo: payload.cargo, tier } : {}),
        ...(payload.setor ? { setor: payload.setor } : {}),
        ...(payload.segmentoDetalhe ? { segmentoDetalhe: payload.segmentoDetalhe } : {}),
        ...(payload.faturamento ? { faturamento: payload.faturamento } : {}),
        ...(reativa
          ? { estado: tier === 3 ? 'radar_cs' : 'nutricao', pontos: 0, edicoesContadas: 0, subscribedAt: new Date() }
          : {}),
      },
    });
  } else {
    subscriber = await prisma.newsletterSubscriber.create({
      data: {
        contactId,
        email,
        tier,
        cargo: payload.cargo ?? null,
        setor: payload.setor ?? null,
        segmentoDetalhe: payload.segmentoDetalhe ?? null,
        faturamento: payload.faturamento ?? null,
        estado: 'inscrito',
        welcomeStatus: 'pending',
        welcomeDueAt: new Date(Date.now() + WELCOME_DELAY_MS),
      },
    });
  }

  // Enriquece o contato com a qualificação do form (sem sobrescrever o que já existe).
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (contact) {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(payload.cargo && !contact.position ? { position: payload.cargo } : {}),
        ...(payload.setor && !contact.sector ? { sector: payload.setor } : {}),
        ...(payload.faturamento && !contact.revenueRange
          ? { revenueRange: payload.faturamento }
          : {}),
      },
    });
  }

  return subscriber;
}

// ─── Welcome email ───────────────────────────────────────────────────────────

function buildWelcomeHtml(firstName: string, email: string): string {
  const emailB64 = Buffer.from(email, 'utf-8').toString('base64url');
  const unsubUrl = `${TRACKING_BASE_URL}/unsubscribe/email/${emailB64}`;
  const nome = firstName ? `, ${firstName}` : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f3;font-family:Arial,Helvetica,sans-serif;color:#1d2b30;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:24px;">
      <img src="https://messenger.bertuzzipatrimonial.com.br/brand/bgp-logo.png" alt="BGP" width="140" style="max-width:140px;">
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:32px 28px;">
      <p style="font-size:12px;letter-spacing:2px;color:#244C5A;margin:0 0 12px;text-transform:uppercase;">News BGP</p>
      <h1 style="font-size:24px;line-height:1.3;margin:0 0 16px;color:#1d2b30;">Bem-vindo(a) à News BGP${nome}.</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
        Toda <strong>segunda-feira</strong>, você recebe no seu e-mail a inteligência financeira de quem
        senta na mesa de decisão com mais de 500 empresas:
      </p>
      <ul style="font-size:15px;line-height:1.8;margin:0 0 16px;padding-left:20px;">
        <li><strong>Radar do setor</strong> — o que se moveu no mercado e por que importa pra você;</li>
        <li><strong>BGP Academy</strong> — conteúdo próprio, do orçamento ao dashboard financeiro;</li>
        <li><strong>O indicador da semana</strong> — um número por edição, o que ele denuncia e o que fazer.</li>
      </ul>
      <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
        Sem spam, sem feed infinito. Só o que muda uma decisão — e você sai em 1 clique quando quiser.
      </p>
      <div style="text-align:center;margin:0 0 8px;">
        <a href="https://wa.me/5551992091726?text=${encodeURIComponent('Olá! Acabei de assinar a News BGP e quero falar com a BGP.')}"
           style="display:inline-block;background:#244C5A;color:#ffffff;text-decoration:none;font-size:15px;padding:12px 28px;border-radius:999px;">
          Falar com a BGP
        </a>
      </div>
    </div>
    <p style="font-size:11px;color:#8a9694;text-align:center;line-height:1.6;margin:20px 0 0;">
      Bertuzzi Gestão Patrimonial · Você recebe este e-mail porque assinou a News BGP.<br>
      <a href="${unsubUrl}" style="color:#8a9694;">Descadastrar</a>
    </p>
  </div>
</body>
</html>`;
}

/**
 * Envia os welcomes vencidos (welcomeDueAt <= agora). Roda no tick do cron.
 * Depois do welcome o assinante entra na nutrição (ou no radar do CS, tier 3).
 */
export async function processWelcomeDue(): Promise<number> {
  const due = await prisma.newsletterSubscriber.findMany({
    where: { welcomeStatus: 'pending', welcomeDueAt: { lte: new Date() } },
    take: 50,
  });
  if (due.length === 0) return 0;

  let sent = 0;
  for (const sub of due) {
    const posWelcome = sub.tier === 3 ? 'radar_cs' : 'nutricao';
    try {
      // Descadastrou entre o cadastro e o welcome? Não envia.
      const unsub = await prisma.unsubscribeList.findFirst({
        where: { email: { equals: sub.email, mode: 'insensitive' } },
      });
      if (unsub) {
        await prisma.newsletterSubscriber.update({
          where: { id: sub.id },
          data: { welcomeStatus: 'skipped', estado: 'descadastrado' },
        });
        continue;
      }

      const contact = await prisma.contact.findUnique({ where: { id: sub.contactId } });
      const firstName = (contact?.name ?? '').trim().split(/\s+/)[0] ?? '';

      const { error } = await resend.emails.send({
        from: NEWSLETTER_FROM,
        to: [sub.email],
        subject: 'Bem-vindo(a) à News BGP — toda segunda, no seu e-mail',
        html: buildWelcomeHtml(firstName, sub.email),
      });

      await prisma.newsletterSubscriber.update({
        where: { id: sub.id },
        data: error
          ? { welcomeStatus: 'failed' }
          : { welcomeStatus: 'sent', estado: sub.estado === 'inscrito' ? posWelcome : sub.estado },
      });
      if (error) {
        console.error(`[newsletter-journey] welcome falhou para ${sub.email}:`, error.message);
      } else {
        sent++;
      }
    } catch (err) {
      console.error(`[newsletter-journey] welcome exceção para ${sub.email}:`, err);
      await prisma.newsletterSubscriber
        .update({ where: { id: sub.id }, data: { welcomeStatus: 'failed' } })
        .catch(() => {});
    }
  }
  if (sent > 0) console.log(`[newsletter-journey] ${sent} welcome(s) enviados`);
  return sent;
}

// ─── Régua de pontos + checkpoint ────────────────────────────────────────────

interface EdicaoScore {
  abriu: boolean;
  clicou: boolean;
  scanner: boolean;
}

function scoreEdicao(
  events: { type: string; slot: string | null }[]
): EdicaoScore {
  const abriu = events.some((e) => e.type === 'OPEN');
  const slots = new Set(
    events
      .filter((e) => e.type === 'CLICK' && e.slot && e.slot !== 'footer-descadastrar')
      .map((e) => e.slot as string)
  );
  const scanner = slots.size >= SCANNER_MIN_SLOTS;
  return { abriu, clicou: !scanner && slots.size > 0, scanner };
}

/**
 * Roda a jornada inteira: pontua as 3 primeiras edições de cada assinante
 * ativo, aplica o checkpoint, observa o CTA do radar CS e sincroniza
 * descadastros. Idempotente — pode rodar quantas vezes for.
 */
export async function runJourneyCheckpoints(): Promise<{
  avaliados: number;
  qualificados: number;
}> {
  const ativos = await prisma.newsletterSubscriber.findMany({
    where: { estado: { in: ['inscrito', 'nutricao', 'radar_cs'] } },
  });
  if (ativos.length === 0) return { avaliados: 0, qualificados: 0 };

  const edicoes = await prisma.newsletterEdition.findMany({
    where: { status: 'SENT', isTest: false, sentAt: { not: null } },
    orderBy: { sentAt: 'asc' },
    select: { id: true, sentAt: true },
  });

  let qualificados = 0;

  for (const sub of ativos) {
    try {
      // Descadastrado some da jornada (o resolveAudience já não envia pra ele).
      const unsub = await prisma.unsubscribeList.findFirst({
        where: { email: { equals: sub.email, mode: 'insensitive' } },
      });
      if (unsub) {
        await prisma.newsletterSubscriber.update({
          where: { id: sub.id },
          data: { estado: 'descadastrado' },
        });
        continue;
      }

      const minhas = edicoes.filter((e) => (e.sentAt as Date) > sub.subscribedAt);
      const contadas = minhas.slice(0, CHECKPOINT_EDICOES);

      const events = minhas.length
        ? await prisma.newsletterEvent.findMany({
            where: {
              editionId: { in: minhas.map((e) => e.id) },
              email: { equals: sub.email, mode: 'insensitive' },
            },
            select: { editionId: true, type: true, slot: true },
          })
        : [];

      // CTA "Falar com a BGP" clicado (em QUALQUER edição desde a inscrição):
      // intenção direta — qualifica na hora, não importa tier nem checkpoint.
      const clicouCta = events.some((e) => e.type === 'CLICK' && e.slot === CTA_SLOT);

      let pontos = 0;
      for (const ed of contadas) {
        const s = scoreEdicao(events.filter((e) => e.editionId === ed.id));
        pontos += (s.abriu ? 1 : 0) + (s.clicou ? 1 : 0);
      }

      let estado = sub.estado as EstadoJornada;
      if (estado === 'inscrito' && sub.welcomeStatus !== 'pending') {
        estado = sub.tier === 3 ? 'radar_cs' : 'nutricao';
      }

      let qualificou: 'qualificado_direto' | 'qualificado_exploratorio' | null = null;
      if (clicouCta) {
        qualificou = 'qualificado_direto';
      } else if (estado === 'nutricao' && contadas.length >= CHECKPOINT_EDICOES) {
        if (pontos >= 5) qualificou = 'qualificado_direto';
        else if (pontos >= 3) qualificou = 'qualificado_exploratorio';
        else estado = 'frio';
      }

      if (qualificou) {
        estado = qualificou;
        qualificados++;
      }

      const mudou =
        estado !== sub.estado || pontos !== sub.pontos || contadas.length !== sub.edicoesContadas;
      if (mudou) {
        await prisma.newsletterSubscriber.update({
          where: { id: sub.id },
          data: {
            estado,
            pontos,
            edicoesContadas: contadas.length,
            ...(qualificou ? { qualifiedAt: new Date() } : {}),
          },
        });
      }

      if (qualificou) {
        await onSubscriberQualified(sub.id, qualificou, pontos, clicouCta);
      }
    } catch (err) {
      console.error(`[newsletter-journey] checkpoint falhou para ${sub.email}:`, err);
    }
  }

  return { avaliados: ativos.length, qualificados };
}

/**
 * Assinante qualificou. Se o cadastro/tracking aponta um produto (LP ou
 * campanha com sinal explícito), o handoff é automático; sem sinal, o time
 * escolhe o funil na aba Jornada — e o Oliver ganha uma tarefa pra não passar
 * batido.
 */
async function onSubscriberQualified(
  subscriberId: string,
  tipo: 'qualificado_direto' | 'qualificado_exploratorio',
  pontos: number,
  viaCta: boolean
) {
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub || sub.handoffDealId) return;

  const tracking = await prisma.leadTracking.findFirst({
    where: { contactId: sub.contactId },
    orderBy: { createdAt: 'desc' },
  });

  const destino = resolveLeadPipeline({
    landingPage: tracking?.landingPage ?? null,
    campaign: tracking?.utmCampaign ?? null,
  });

  if (destino.motivo !== 'default') {
    // Sinal explícito de produto → handoff automático.
    await handoffSubscriber(sub.id, destino.pipelineId, { tipo, pontos, viaCta });
    return;
  }

  // Sem sinal: o time escolhe. Tarefa pro Oliver apontando pra aba Jornada.
  const motivo = viaCta
    ? 'clicou no CTA "Falar com a BGP"'
    : `${pontos} pts em ${CHECKPOINT_EDICOES} edições`;
  const contact = await prisma.contact.findUnique({ where: { id: sub.contactId } });
  await prisma.task.create({
    data: {
      title: `News: ${contact?.name ?? sub.email} qualificou (${motivo}) — definir funil na aba Jornada`,
      type: 'OTHER',
      status: 'PENDING',
      dueDate: new Date(),
      userId: LEGACY_DEFAULT_OWNER_ID, // Oliver
      contactId: sub.contactId,
    },
  });
}

// ─── Handoff → funil de venda ────────────────────────────────────────────────

export async function handoffSubscriber(
  subscriberId: string,
  pipelineId: string,
  opts: { tipo?: string; pontos?: number; viaCta?: boolean; byUserId?: string } = {}
) {
  if (pipelineId !== PIPELINE_BI && pipelineId !== PIPELINE_CONTROLADORIA) {
    throw new Error(`Funil inválido para handoff: ${pipelineId}`);
  }

  const sub = await prisma.newsletterSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) throw new Error('Assinante não encontrado');
  if (sub.handoffDealId) return { dealId: sub.handoffDealId, reused: true };

  const contact = await prisma.contact.findUnique({ where: { id: sub.contactId } });
  if (!contact) throw new Error('Contato do assinante não existe mais');

  // SDR do funil (fallback: admin ativo mais antigo — perder lead é pior).
  const sdrId = SDR_BY_PIPELINE[pipelineId];
  const sdr = await prisma.user.findUnique({ where: { id: sdrId } });
  const owner = sdr?.isActive
    ? sdr
    : await prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true },
        orderBy: { createdAt: 'asc' },
      });
  if (!owner) throw new Error('Nenhum responsável ativo para o handoff');

  // Assinante pode já ser lead por outro caminho — não duplica deal.
  let deal = await prisma.deal.findFirst({
    where: { contactId: contact.id, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });
  let reused = true;

  if (!deal) {
    reused = false;
    let source = await prisma.source.findFirst({
      where: { name: { equals: 'Newsletter', mode: 'insensitive' } },
    });
    if (!source) source = await prisma.source.create({ data: { name: 'Newsletter' } });

    deal = await prisma.deal.create({
      data: {
        title: `Lead - ${contact.name}`,
        status: 'OPEN',
        pipelineId,
        stageId: stageIdFor(pipelineId, 'LEAD'),
        contactId: contact.id,
        userId: owner.id,
        sourceId: source.id,
      },
    });
  }

  const motivo = opts.viaCta
    ? 'clicou no CTA "Falar com a BGP"'
    : `${opts.pontos ?? sub.pontos} pts na jornada da news`;
  const contatoTipo =
    opts.tipo === 'qualificado_exploratorio' || sub.estado === 'qualificado_exploratorio'
      ? 'Contato exploratório'
      : 'Contato direto';

  await prisma.task.create({
    data: {
      title: `${contatoTipo} — assinante da News qualificado (${motivo})`,
      description: [
        sub.cargo ? `Cargo: ${sub.cargo}` : null,
        sub.setor ? `Setor: ${sub.setor}` : null,
        sub.segmentoDetalhe ? `Segmento: ${sub.segmentoDetalhe}` : null,
        sub.faturamento ? `Faturamento: ${sub.faturamento}` : null,
        `Pontos: ${sub.pontos} em ${sub.edicoesContadas} edições`,
      ]
        .filter(Boolean)
        .join('\n'),
      type: 'CALL',
      status: 'PENDING',
      dueDate: new Date(),
      userId: owner.id,
      dealId: deal.id,
      contactId: contact.id,
    },
  });

  await logActivity({
    type: 'DEAL_CREATED',
    content: reused
      ? `Assinante da News qualificado (${motivo}) — deal OPEN existente reaproveitado`
      : `Deal criado pela jornada da newsletter (${motivo})`,
    userId: opts.byUserId ?? owner.id,
    contactId: contact.id,
    dealId: deal.id,
    metadata: {
      origem: 'newsletter-journey',
      subscriberId: sub.id,
      tier: sub.tier,
      pontos: sub.pontos,
      viaCta: opts.viaCta ?? false,
    },
  });

  sendLeadNotifications({
    dealId: deal.id,
    contactName: contact.name,
    contactEmail: contact.email,
    contactPhone: contact.phone,
    sourceName: 'Newsletter',
    campaignName: null,
    utmUrl: null,
  }).catch((err) => console.error('[newsletter-journey] notificação falhou:', err));

  await prisma.newsletterSubscriber.update({
    where: { id: sub.id },
    data: { estado: 'convertido', convertedAt: new Date(), handoffDealId: deal.id },
  });

  return { dealId: deal.id, reused };
}
