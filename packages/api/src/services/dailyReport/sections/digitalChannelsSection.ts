import type { ReportSection, ConnectionStatus } from '../types';
import { getBgpMessengerDailyStats } from '../../bgpmassa';
import { getCampaignMetrics } from '../../emailMetrics';
import prisma from '../../../lib/prisma';

// ─── Constantes ───────────────────────────────────────────────────────────────

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

// ─── Helpers de data ─────────────────────────────────────────────────────────

function startOfDayBRT(utcDate: Date): Date {
  const brtTime = utcDate.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtTime);
  const midnightBRT = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()));
  return new Date(midnightBRT.getTime() - BRT_OFFSET_MS);
}

function formatDateBRT(d: Date): string {
  const brtMs = d.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtMs);
  const day   = String(brt.getUTCDate()).padStart(2, '0');
  const month = String(brt.getUTCMonth() + 1).padStart(2, '0');
  const year  = brt.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeBRT(d: Date): string {
  const brtMs = d.getTime() + BRT_OFFSET_MS;
  const brt = new Date(brtMs);
  const h   = String(brt.getUTCHours()).padStart(2, '0');
  const min = String(brt.getUTCMinutes()).padStart(2, '0');
  const day   = String(brt.getUTCDate()).padStart(2, '0');
  const month = String(brt.getUTCMonth() + 1).padStart(2, '0');
  return `${h}:${min} de ${day}/${month}`;
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface BiaData {
  msgEnviadas: number;
  convsAtivas: number;
  messengerTotal: number;
  messengerInbound: number;
  messengerStatus: ConnectionStatus;
  reunAgendadas: number;
}

interface CalendlyData {
  total: number;
  names: string[];
}

interface EmailData {
  subject: string;
  enviados: number;
  abertos: number;
  taxaAbertura: number;
  cliques: number;
  reunAgend: number;
  bounce: number;
  sentAt: Date;
}

interface DigitalChannelsData {
  referenceDate: Date;
  bia: BiaData;
  calendly: CalendlyData;
  email: EmailData | null;
}

// ─── Classe principal ─────────────────────────────────────────────────────────

export class DigitalChannelsSection implements ReportSection {
  constructor(private referenceDate: Date) {}

  async render(): Promise<string> {
    try {
      const data = await this.gatherData();
      return this.buildHtml(data);
    } catch (err) {
      console.error('[digitalChannelsSection] erro fatal:', err);
      return this.buildErrorFallback();
    }
  }

  // ─── Coleta de dados ────────────────────────────────────────────────────────

  private async gatherData(): Promise<DigitalChannelsData> {
    // "Ontem" em BRT
    const todayBRT  = startOfDayBRT(this.referenceDate);
    const yesterdayBRT = new Date(todayBRT.getTime() - 24 * 60 * 60 * 1000);

    const [bia, calendly, email] = await Promise.all([
      this.gatherBia(yesterdayBRT, todayBRT),
      this.gatherCalendly(yesterdayBRT, todayBRT),
      this.gatherEmail(yesterdayBRT, todayBRT),
    ]);

    return { referenceDate: yesterdayBRT, bia, calendly, email };
  }

  private async gatherBia(from: Date, to: Date): Promise<BiaData> {
    // Mensagens enviadas pelo BOT (outbound) no dia — usa WaMessage (Cloud API v2)
    const [msgEnviadas, convsAtivas, messenger, reunAgendadas] = await Promise.all([
      // MSGS ENVIADAS: mensagens outbound do bot WA no dia
      prisma.waMessage.count({
        where: {
          direction: 'OUTBOUND',
          senderType: 'WA_BOT',
          createdAt: { gte: from, lt: to },
        },
      }),

      // CONVERSAS ATIVAS: conversas com ao menos uma mensagem ontem
      prisma.waConversation.count({
        where: {
          lastMessageAt: { gte: from, lt: to },
        },
      }),

      // MESSENGER: via BGP Massa (endpoint externo)
      getBgpMessengerDailyStats(from).catch(() => ({
        date: from.toISOString().slice(0, 10),
        inbound: 0,
        outbound: 0,
        total: 0,
        connectionStatus: 'ERROR' as ConnectionStatus,
      })),

      // REUNIÕES AGENDADAS via BIA: WaConversation com meetingBooked=true
      // atualizado ontem (updatedAt dentro do dia)
      prisma.waConversation.count({
        where: {
          meetingBooked: true,
          updatedAt: { gte: from, lt: to },
        },
      }),
    ]);

    return {
      msgEnviadas,
      convsAtivas,
      messengerTotal: messenger.total,
      messengerInbound: messenger.inbound,
      messengerStatus: messenger.connectionStatus ?? 'OK',
      reunAgendadas,
    };
  }

  private async gatherCalendly(from: Date, to: Date): Promise<CalendlyData> {
    const events = await prisma.calendlyEvent.findMany({
      where: {
        startTime: { gte: from, lt: to },
        status: 'active',
      },
      select: { inviteeName: true, inviteeEmail: true },
      orderBy: { startTime: 'asc' },
    });

    const names = events.map((e) => {
      if (e.inviteeName && e.inviteeName.trim()) {
        // Primeira palavra (primeiro nome)
        return e.inviteeName.trim().split(' ')[0];
      }
      return e.inviteeEmail.split('@')[0];
    });

    return { total: events.length, names };
  }

  private async gatherEmail(from: Date, to: Date): Promise<EmailData | null> {
    // Última campanha com status SENT
    const campaign = await prisma.emailCampaign.findFirst({
      where: { status: 'SENT' },
      orderBy: { sentAt: 'desc' },
    });

    if (!campaign || !campaign.sentAt) return null;

    // Métricas via emailMetrics.ts
    const metrics = await getCampaignMetrics(campaign.id);

    // enviados = total de EmailSend registrados para a campanha
    const enviados = metrics.total || campaign.totalRecipients;
    const abertos  = metrics.opened;
    const taxaAbertura = enviados > 0 ? (abertos / enviados) * 100 : 0;
    const cliques  = metrics.clicked;
    const bounce   = metrics.bounced;

    // Reuniões agendadas vindas do email — filtra por Deal.meetingSource = CALENDLY_EMAIL
    // (UTM tag injetado nos links Calendly do email é detectado pelo webhook
    // Calendly e classificado em Deal.meetingSource).
    const sentAt = campaign.sentAt;
    const windowEnd = new Date(sentAt.getTime() + 24 * 60 * 60 * 1000);
    const reunAgend = await prisma.deal.count({
      where: {
        meetingSource: 'CALENDLY_EMAIL',
        updatedAt: { gte: sentAt, lt: windowEnd },
      },
    });

    return {
      subject:      campaign.subject,
      enviados,
      abertos,
      taxaAbertura,
      cliques,
      reunAgend,
      bounce,
      sentAt,
    };
  }

  // ─── Build HTML ─────────────────────────────────────────────────────────────

  private buildHtml(data: DigitalChannelsData): string {
    const { bia, calendly, email } = data;
    const refLabel = formatDateBRT(data.referenceDate);

    const allBiaZero =
      bia.msgEnviadas === 0 &&
      bia.convsAtivas === 0 &&
      bia.messengerTotal === 0 &&
      bia.reunAgendadas === 0;

    return `
<!-- SEÇÃO 3: CANAIS DIGITAIS -->
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto 32px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:10px 10px 0 0;padding:18px 24px;">
    <h2 style="margin:0;color:#fff;font-size:18px;font-weight:700;letter-spacing:0.3px;">
      Canais Digitais — BIA &amp; Email Marketing
    </h2>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Data de referência: ${refLabel}</p>
  </div>

  <!-- Body -->
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:20px 24px;background:#fff;">

    <!-- BIA -->
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;">
      BIA — Assistente WhatsApp
    </p>

    ${allBiaZero
      ? `<p style="color:#6b7280;font-size:13px;margin:0 0 20px;">Sem atividade BIA ontem.</p>`
      : this.buildBiaCards(bia)
    }

    <!-- Calendly -->
    ${calendly.total > 0 ? this.buildCalendlyBox(calendly) : ''}

    <!-- Email Marketing -->
    ${email ? this.buildEmailSection(email) : ''}

    <!-- Rodapé -->
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px;">
      Fonte: CRM BGPGO (WhatsApp/Email) &middot; BGP Messenger &middot; Calendly — Gerado automaticamente
    </p>
  </div>
</div>`;
  }

  private buildBiaCards(bia: BiaData): string {
    const messengerSub = bia.messengerStatus !== 'OK'
      ? `<span style="color:#dc2626;">⚠ sem conexão</span>`
      : `${bia.messengerInbound} recebidas`;

    const cards: Array<{ valor: string; label: string; sub: string }> = [
      {
        valor: String(bia.msgEnviadas),
        label: 'MSGS ENVIADAS<br>(CRM)',
        sub: 'bot SDR / pré-venda',
      },
      {
        valor: String(bia.convsAtivas),
        label: 'CONVERSAS<br>ATIVAS',
        sub: 'leads em interação',
      },
      {
        valor: String(bia.messengerTotal),
        label: 'MSGS<br>MESSENGER',
        sub: messengerSub,
      },
      {
        valor: String(bia.reunAgendadas),
        label: 'REUNIÃO AGENDADA<br>BIA',
        sub: 'rastreado pelo CRM',
      },
    ];

    const cells = cards.map((c) => `
      <td style="width:25%;padding:12px 8px;text-align:center;border-right:1px solid #e5e7eb;vertical-align:top;">
        <div style="font-size:24px;font-weight:700;color:#1e40af;line-height:1.2;">${c.valor}</div>
        <div style="font-size:11px;color:#374151;margin:6px 0 4px;line-height:1.4;">${c.label}</div>
        <div style="font-size:11px;color:#9ca3af;line-height:1.4;">${c.sub}</div>
      </td>`).join('');

    // Remove border-right on last cell
    const fixedCells = cells.replace(/border-right:1px solid #e5e7eb;([^"]*")([^"]*"[^>]*>(?:[^<]|<(?!\/td>))*<\/td>)(\s*)$/s,
      (match, style, rest) => match.replace('border-right:1px solid #e5e7eb;', ''));

    return `
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <tr>${cells}</tr>
    </table>`;
  }

  private buildCalendlyBox(calendly: CalendlyData): string {
    // Agrupa nomes: até 3 por linha, separados por " · "
    const chunkSize = 3;
    const lines: string[] = [];
    for (let i = 0; i < calendly.names.length; i += chunkSize) {
      lines.push(calendly.names.slice(i, i + chunkSize).join(' &middot; '));
    }

    return `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:8px;">
        Calendly — ${calendly.total} reuni${calendly.total === 1 ? 'ão agendada' : 'ões agendadas'} no dia (multicanal)
      </div>
      <div style="font-size:13px;color:#374151;line-height:1.8;">
        ${lines.map((l) => `<div>${l}</div>`).join('')}
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:10px;line-height:1.5;">
        Origem: Calendly — pode vir de email, WhatsApp, orgânico ou pago.
        O campo meetingBooked do CRM não registrou atribuição direta da BIA.
      </div>
    </div>`;
  }

  private buildEmailSection(email: EmailData): string {
    const taxaColor = email.taxaAbertura >= 15 ? '#16a34a' : '#dc2626';
    const taxaStr   = email.taxaAbertura.toFixed(1) + '%';
    const ctrStr    = email.enviados > 0
      ? ((email.cliques / email.enviados) * 100).toFixed(1) + '%'
      : '0.0%';
    const bounceStr = email.enviados > 0
      ? `${email.bounce} (${((email.bounce / email.enviados) * 100).toFixed(1)}%)`
      : String(email.bounce);
    const horarioStr = formatTimeBRT(email.sentAt);

    const mainCards: Array<{ valor: string; label: string; sub: string; color?: string }> = [
      {
        valor: email.enviados.toLocaleString('pt-BR'),
        label: 'ENVIA-<br>DOS',
        sub: 'base<br>total',
      },
      {
        valor: String(email.abertos),
        label: 'ABER-<br>TOS',
        sub: `${taxaStr}<br>base`,
      },
      {
        valor: taxaStr,
        label: 'TAXA<br>ABERT.',
        sub: 'bench<br>20-25%',
        color: taxaColor,
      },
      {
        valor: String(email.cliques),
        label: 'CLIQ.',
        sub: `${ctrStr} da<br>base`,
      },
      {
        valor: String(email.reunAgend),
        label: 'REUNIÃO<br>AGENDADA',
        sub: 'via Calendly',
      },
    ];

    const mainCells = mainCards.map((c, i) => `
      <td style="width:20%;padding:12px 6px;text-align:center;border-right:${i < 4 ? '1px solid #e5e7eb' : 'none'};vertical-align:top;">
        <div style="font-size:22px;font-weight:700;color:${c.color || '#1e40af'};line-height:1.2;">${c.valor}</div>
        <div style="font-size:11px;color:#374151;margin:6px 0 4px;line-height:1.4;">${c.label}</div>
        <div style="font-size:11px;color:#9ca3af;line-height:1.4;">${c.sub}</div>
      </td>`).join('');

    const insights = this.buildInsights(email);

    return `
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;">
      Email Marketing
    </p>
    <p style="margin:0 0 12px;font-size:13px;color:#374151;">
      Campanha: <strong>"${this.escapeHtml(email.subject)}"</strong>
    </p>

    <!-- Métricas principais -->
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:12px;">
      <tr>${mainCells}</tr>
    </table>

    <!-- Bounce + Horário -->
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr>
        <td style="width:50%;padding:12px 16px;border-right:1px solid #e5e7eb;vertical-align:top;">
          <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">BOUNCE</div>
          <div style="font-size:18px;font-weight:700;color:#6b7280;">${bounceStr}</div>
        </td>
        <td style="width:50%;padding:12px 16px;vertical-align:top;">
          <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">HORÁRIO ENVIO</div>
          <div style="font-size:18px;font-weight:700;color:#6b7280;">${horarioStr}</div>
        </td>
      </tr>
    </table>

    <!-- Análise -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:8px;">Análise</div>
      <div style="font-size:13px;color:#374151;line-height:1.6;">
        ${insights.map((i) => `<p style="margin:0 0 6px;">${i}</p>`).join('')}
      </div>
    </div>`;
  }

  private buildInsights(email: EmailData): string[] {
    const insights: string[] = [];
    const sentAtHora = new Date(email.sentAt.getTime() + BRT_OFFSET_MS).getUTCHours();

    if (email.taxaAbertura < 15) {
      insights.push('Taxa de abertura abaixo do benchmark de mercado (20-25%).');
    }
    if (sentAtHora < 7 || sentAtHora > 22) {
      insights.push(
        `Possíveis causas: horário de envio (${formatTimeBRT(email.sentAt)}) fora da janela recomendada.`
      );
    }
    if (email.enviados > 0 && email.cliques / email.enviados < 0.005) {
      insights.push('Taxa de clique baixa, compatível com baixa abertura.');
    }
    if (email.reunAgend > 0) {
      const plural = email.reunAgend > 1;
      insights.push(
        `${email.reunAgend} reuni${plural ? 'ões' : 'ão'} agendada${plural ? 's' : ''} via Calendly logo após o envio.`
      );
    }
    if (insights.length === 0) {
      insights.push('Métricas dentro do esperado para o segmento.');
    }

    const recomendacao =
      sentAtHora < 7 || sentAtHora > 22
        ? 'Recomendação: testar envio entre 08h–10h ou 18h–19h e linha de assunto mais provocativa.'
        : email.taxaAbertura < 15
        ? 'Recomendação: testar variações de assunto e segmentação de lista.'
        : 'Recomendação: manter cadência e monitorar taxa de clique.';

    insights.push(recomendacao);
    return insights;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Fallback de erro ────────────────────────────────────────────────────────

  private buildErrorFallback(): string {
    return `
<!-- SEÇÃO 3: CANAIS DIGITAIS (fallback) -->
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto 32px;">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:10px 10px 0 0;padding:18px 24px;">
    <h2 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Canais Digitais — BIA &amp; Email Marketing</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:20px 24px;background:#fff;">
    <p style="color:#dc2626;font-size:13px;margin:0;">
      Erro ao gerar seção de Canais Digitais. Os dados serão exibidos na próxima execução.
    </p>
  </div>
</div>`;
  }
}

export default DigitalChannelsSection;
