import { Resend } from 'resend';
import prisma from '../lib/prisma';

// ─── Alertas da jornada da newsletter (pedido do Oliver 06/08/2026) ──────────
//
// Dois canais, de públicos diferentes:
//   1. RESUMO DIÁRIO pro Oliver e o Fabrício — tudo que os assinantes fizeram
//      nas últimas 24h (inscrição, welcome, abertura/clique, qualificação,
//      esfriou, descadastro). Escolhido em vez de alerta por ação: abertura
//      individual daria centenas de emails por edição.
//   2. ALERTA NA HORA pro comercial quando o assinante qualifica — 3-4 pts
//      (contato exploratório) e 5-6 pts (contato direto).
//
// Destinatários e liga/desliga saem do NotificationConfig (chave/valor), mesmo
// padrão do leadNotificationService — dá pra mudar sem deploy.

const ALERT_FROM = 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>';

export async function getNotificationConfig(key: string, fallback: string): Promise<string> {
  const row = await prisma.notificationConfig.findUnique({ where: { key } });
  const value = row?.value?.trim();
  return value ? value : fallback;
}

async function recipients(key: string, fallback: string): Promise<string[]> {
  const raw = await getNotificationConfig(key, fallback);
  return [...new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[news-alert] SKIP: RESEND_API_KEY não configurado');
    return null;
  }
  return new Resend(key);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CRM_URL = process.env.WEB_URL || 'https://crm.bertuzzipatrimonial.com.br';

// ─── 1. Alerta na hora: assinante qualificou → comercial ─────────────────────

export interface QualifiedAlert {
  nome: string;
  email: string;
  telefone?: string | null;
  cargo?: string | null;
  setor?: string | null;
  faturamento?: string | null;
  tipo: 'qualificado_direto' | 'qualificado_exploratorio';
  pontos: number;
  edicoes: number;
  viaCta: boolean;
  dealId?: string | null;
  responsavel?: string | null;
}

export async function sendQualifiedAlert(data: QualifiedAlert): Promise<void> {
  try {
    if ((await getNotificationConfig('news_qualified_enabled', 'true')) !== 'true') return;
    const to = await recipients(
      'news_qualified_emails',
      'oliver@bertuzzipatrimonial.com.br'
    );
    if (to.length === 0) return;
    const resend = resendClient();
    if (!resend) return;

    const direto = data.tipo === 'qualificado_direto';
    const rotulo = direto ? 'Contato direto' : 'Contato exploratório';
    const faixa = direto ? '5-6 pts' : '3-4 pts';
    const cor = direto ? '#1f7a4d' : '#B8860B';
    const motivo = data.viaCta
      ? 'clicou no CTA “Falar com a BGP”'
      : `${data.pontos} pts em ${data.edicoes} edições (${faixa})`;

    const linha = (label: string, value?: string | null) =>
      value
        ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:130px;">${esc(label)}</td>
             <td style="padding:6px 0;font-size:14px;color:#1d2b30;">${esc(value)}</td></tr>`
        : '';

    await resend.emails.send({
      from: ALERT_FROM,
      to,
      subject: `${rotulo} — ${data.nome} qualificou na newsletter`,
      html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1d2b30;">
        <div style="background:${cor};padding:20px 24px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Jornada da newsletter</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;">${esc(rotulo)}</h1>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:22px 24px;">
          <p style="margin:0 0 14px;font-size:15px;">
            <strong>${esc(data.nome)}</strong> qualificou — ${esc(motivo)}.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
            ${linha('Email', data.email)}
            ${linha('Telefone', data.telefone)}
            ${linha('Cargo', data.cargo)}
            ${linha('Setor', data.setor)}
            ${linha('Faturamento', data.faturamento)}
            ${linha('Responsável', data.responsavel)}
          </table>
          ${
            data.dealId
              ? `<p style="margin:18px 0 0;">
                   <a href="${CRM_URL}/deals/${esc(data.dealId)}"
                      style="display:inline-block;background:#244C5A;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 22px;border-radius:999px;">
                     Abrir negociação
                   </a>
                 </p>`
              : `<p style="margin:18px 0 0;font-size:13px;color:#6b7280;">
                   Sem funil definido pelo cadastro — escolher em Marketing → Newsletter → Jornada.
                 </p>`
          }
        </div>
      </div>`,
    });
  } catch (err) {
    console.error('[news-alert] qualificado:', err);
  }
}

// ─── 2. Resumo diário da jornada → Oliver + Fabrício ─────────────────────────

interface DigestRow {
  quando: Date;
  quem: string;
  o_que: string;
}

export async function sendJourneyDailyDigest(): Promise<number> {
  if ((await getNotificationConfig('news_journey_digest_enabled', 'true')) !== 'true') return 0;

  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows: DigestRow[] = [];

  const subs = await prisma.newsletterSubscriber.findMany({
    where: {
      OR: [
        { subscribedAt: { gte: desde } },
        { qualifiedAt: { gte: desde } },
        { updatedAt: { gte: desde } },
      ],
    },
  });
  const porEmail = new Map(subs.map((s) => [s.email.trim().toLowerCase(), s]));

  for (const s of subs) {
    const nome = s.email;
    if (s.subscribedAt >= desde) {
      rows.push({
        quando: s.subscribedAt,
        quem: nome,
        o_que: `Novo inscrito${s.cargo ? ` — ${s.cargo}` : ''}${s.tier ? ` (tier ${s.tier})` : ''}`,
      });
    }
    if (s.qualifiedAt && s.qualifiedAt >= desde) {
      rows.push({
        quando: s.qualifiedAt,
        quem: nome,
        o_que: `Qualificou: ${
          s.estado === 'qualificado_direto' ? 'contato direto' : 'contato exploratório'
        } (${s.pontos} pts em ${s.edicoesContadas} edições)`,
      });
    }
    if (s.convertedAt && s.convertedAt >= desde) {
      rows.push({ quando: s.convertedAt, quem: nome, o_que: 'Virou negociação no funil (handoff)' });
    }
    if (s.estado === 'frio' && s.updatedAt >= desde) {
      rows.push({ quando: s.updatedAt, quem: nome, o_que: `Esfriou no checkpoint (${s.pontos} pts)` });
    }
    if (s.welcomeStatus === 'failed' && s.updatedAt >= desde) {
      rows.push({ quando: s.updatedAt, quem: nome, o_que: '⚠ Falha no envio do welcome' });
    }
  }

  // Ação na edição — só dos assinantes da jornada (a base geral abre ~600
  // vezes por edição e afogaria o resumo).
  if (porEmail.size > 0 || subs.length > 0) {
    const eventos = await prisma.newsletterEvent.findMany({
      where: { createdAt: { gte: desde }, email: { not: null } },
      select: { type: true, email: true, slot: true, createdAt: true },
    });
    const agrupado = new Map<string, { abriu: number; clicou: number; ultimo: Date; slots: Set<string> }>();
    for (const ev of eventos) {
      const email = ev.email!.trim().toLowerCase();
      if (!porEmail.has(email)) continue;
      const acc =
        agrupado.get(email) ?? { abriu: 0, clicou: 0, ultimo: ev.createdAt, slots: new Set<string>() };
      if (ev.type === 'OPEN') acc.abriu++;
      else if (ev.type === 'CLICK') {
        acc.clicou++;
        if (ev.slot) acc.slots.add(ev.slot);
      }
      if (ev.createdAt > acc.ultimo) acc.ultimo = ev.createdAt;
      agrupado.set(email, acc);
    }
    for (const [email, acc] of agrupado) {
      const partes = [
        acc.abriu ? `abriu ${acc.abriu}×` : null,
        acc.clicou ? `clicou ${acc.clicou}× (${[...acc.slots].join(', ')})` : null,
      ].filter(Boolean);
      if (partes.length === 0) continue;
      rows.push({ quando: acc.ultimo, quem: email, o_que: `Ação na edição: ${partes.join(' · ')}` });
    }
  }

  const descadastros = await prisma.unsubscribeList.findMany({
    where: { createdAt: { gte: desde } },
    select: { email: true, createdAt: true, reason: true },
  });
  for (const u of descadastros) {
    rows.push({
      quando: u.createdAt,
      quem: u.email,
      o_que: `Descadastrou${u.reason ? ` — ${u.reason}` : ''}`,
    });
  }

  if (rows.length === 0) return 0; // dia parado não vira email

  const to = await recipients(
    'news_journey_digest_emails',
    'oliver@bertuzzipatrimonial.com.br'
  );
  if (to.length === 0) return 0;
  const resend = resendClient();
  if (!resend) return 0;

  rows.sort((a, b) => b.quando.getTime() - a.quando.getTime());
  const hora = (d: Date) =>
    d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const corpo = rows
    .map(
      (r) => `<tr>
        <td style="padding:8px 12px 8px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${hora(r.quando)}</td>
        <td style="padding:8px 12px 8px 0;font-size:13px;color:#1d2b30;">${esc(r.quem)}</td>
        <td style="padding:8px 0;font-size:13px;color:#1d2b30;">${esc(r.o_que)}</td>
      </tr>`
    )
    .join('');

  await resend.emails.send({
    from: ALERT_FROM,
    to,
    subject: `Newsletter — ${rows.length} movimento${rows.length === 1 ? '' : 's'} na jornada (últimas 24h)`,
    html: `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#1d2b30;">
      <div style="background:#244C5A;padding:20px 24px;border-radius:12px 12px 0 0;">
        <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Radar BGP · Jornada</p>
        <h1 style="margin:6px 0 0;color:#ffffff;font-size:21px;">O que os assinantes fizeram nas últimas 24h</h1>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:18px 24px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">${corpo}</table>
        <p style="margin:18px 0 0;font-size:12px;color:#6b7280;">
          Detalhe por assinante em Marketing → Newsletter → Jornada.
        </p>
      </div>
    </div>`,
  });

  console.log(`[news-alert] resumo diário enviado (${rows.length} linhas) para ${to.join(', ')}`);
  return rows.length;
}
