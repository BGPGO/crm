"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MarketingNav from "@/components/marketing/MarketingNav";
import CampaignMetrics from "@/components/marketing/CampaignMetrics";
import EmailPreview from "@/components/marketing/EmailPreview";
import { Send, ArrowLeft, Loader2, Clock, X, Save, CalendarClock, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";

type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  status: CampaignStatus;
  htmlContent: string;
  recipientCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  brand?: "BGP" | "AIMO";
  segment?: { id: string; name: string; contactCount: number } | null;
  totalRecipients?: number;
}

interface SegmentLite {
  id: string;
  name: string;
}

const statusConfig: Record<
  CampaignStatus,
  { variant: "gray" | "blue" | "yellow" | "green" | "red"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  SCHEDULED: { variant: "blue", label: "Agendado" },
  SENDING: { variant: "yellow", label: "Enviando" },
  SENT: { variant: "green", label: "Enviado" },
  FAILED: { variant: "red", label: "Falhou" },
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-500 focus:border-transparent";

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [showScheduleInput, setShowScheduleInput] = useState(false);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [error, setError] = useState<"not_found" | "network" | null>(null);

  // ── Edição (DRAFT) ──────────────────────────────────────────────────────
  const [segments, setSegments] = useState<SegmentLite[]>([]);
  const [editSubject, setEditSubject] = useState("");
  const [editFromName, setEditFromName] = useState("");
  const [editFromEmail, setEditFromEmail] = useState("");
  const [editSegmentId, setEditSegmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  function hydrateEdit(c: Campaign) {
    setEditSubject(c.subject ?? "");
    setEditFromName(c.fromName ?? "");
    setEditFromEmail(c.fromEmail ?? "");
    setEditSegmentId(c.segment?.id ?? "");
  }

  useEffect(() => {
    async function fetchCampaign() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.get<{ data: Campaign }>(`/email-campaigns/${id}`);
        setCampaign(result.data);
        hydrateEdit(result.data);
      } catch (err: unknown) {
        console.error("Erro ao buscar campanha:", err);
        const status = (err as { status?: number })?.status ?? (err as { response?: { status?: number } })?.response?.status;
        setError(status === 404 ? "not_found" : "network");
      } finally {
        setLoading(false);
      }
    }
    fetchCampaign();
  }, [id]);

  // Carrega segmentos da marca atual (X-Brand vai automático no client)
  useEffect(() => {
    api
      .get<{ data: SegmentLite[] }>(`/segments?limit=100`)
      .then((resp) => setSegments(resp?.data ?? []))
      .catch(() => setSegments([]));
  }, []);

  const refetch = async () => {
    const updated = await api.get<{ data: Campaign }>(`/email-campaigns/${id}`);
    setCampaign(updated.data);
    hydrateEdit(updated.data);
  };

  const handleSend = async () => {
    if (!confirm("Tem certeza que deseja enviar esta campanha agora?")) return;
    setSending(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await api.post(`/email-campaigns/${id}/send`, {});
      await refetch();
    } catch (err) {
      console.error("Erro ao enviar campanha:", err);
      setActionError(err instanceof Error ? err.message : "Erro ao enviar campanha");
    } finally {
      setSending(false);
    }
  };

  const handleSave = async () => {
    if (!editSubject.trim()) {
      setActionError("O assunto não pode ficar vazio.");
      return;
    }
    setSaving(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await api.put(`/email-campaigns/${id}`, {
        subject: editSubject.trim(),
        fromName: editFromName.trim() || undefined,
        fromEmail: editFromEmail.trim() || undefined,
        segmentId: editSegmentId || null,
      });
      await refetch();
      setActionMsg("Alterações salvas.");
    } catch (err) {
      console.error("Erro ao salvar campanha:", err);
      setActionError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSendApproval = async () => {
    if (!confirm("Enviar este email para a lista de aprovação da AiMO?")) return;
    setApproving(true);
    setActionError(null);
    setActionMsg(null);
    try {
      const resp = await api.post<{ data: { recipients: string[] } }>(
        `/email-campaigns/${id}/send-approval`,
        {},
      );
      const list = resp?.data?.recipients ?? [];
      setActionMsg(
        `Email de aprovação enviado para ${list.length} pessoa(s)${list.length ? ": " + list.join(", ") : ""}.`,
      );
    } catch (err) {
      console.error("Erro ao enviar para aprovação:", err);
      setActionError(err instanceof Error ? err.message : "Erro ao enviar para aprovação");
    } finally {
      setApproving(false);
    }
  };

  const toLocalDatetimeInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openSchedule = () => {
    setNewScheduleDate(campaign?.scheduledAt ? toLocalDatetimeInput(campaign.scheduledAt) : "");
    setShowScheduleInput(true);
    setActionError(null);
    setActionMsg(null);
  };

  const handleSchedule = async () => {
    if (!newScheduleDate) return;
    const parsed = new Date(newScheduleDate);
    if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setActionError("A data precisa estar no futuro.");
      return;
    }
    setRescheduling(true);
    setActionError(null);
    try {
      await api.post(`/email-campaigns/${id}/schedule`, {
        scheduledAt: parsed.toISOString(),
      });
      await refetch();
      setShowScheduleInput(false);
      setActionMsg("Campanha agendada.");
    } catch (err) {
      console.error("Erro ao agendar campanha:", err);
      setActionError(err instanceof Error ? err.message : "Erro ao agendar");
    } finally {
      setRescheduling(false);
    }
  };

  const handleUnschedule = async () => {
    if (!confirm("Desagendar esta campanha? Ela voltará para Rascunho.")) return;
    setUnscheduling(true);
    setActionError(null);
    try {
      await api.post(`/email-campaigns/${id}/unschedule`, {});
      await refetch();
      setShowScheduleInput(false);
    } catch (err) {
      console.error("Erro ao desagendar campanha:", err);
      setActionError(err instanceof Error ? err.message : "Erro ao desagendar");
    } finally {
      setUnscheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Campanha" breadcrumb={["Marketing", "Emails", "..."]} />
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      </div>
    );
  }

  if (error === "network") {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Campanha" breadcrumb={["Marketing", "Emails"]} />
        <MarketingNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-gray-500 text-sm">Erro de conexão ao carregar a campanha.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-petrol-600 hover:text-petrol-700 bg-petrol-50 hover:bg-petrol-100 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Campanha" breadcrumb={["Marketing", "Emails"]} />
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Campanha não encontrada.
        </div>
      </div>
    );
  }

  const config = statusConfig[campaign.status] ?? statusConfig.DRAFT;
  const isDraft = campaign.status === "DRAFT";
  const isAimo = campaign.brand === "AIMO";
  const canApprove = isAimo && (campaign.status === "DRAFT" || campaign.status === "SCHEDULED");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title={campaign.name}
        breadcrumb={["Marketing", "Emails", campaign.name]}
      />
      <MarketingNav />

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Back + Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            onClick={() => router.push("/marketing/emails")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {canApprove && (
              <Button
                variant="secondary"
                size="sm"
                loading={approving}
                disabled={sending || rescheduling}
                onClick={handleSendApproval}
              >
                <ShieldCheck size={14} />
                Enviar pra aprovação
              </Button>
            )}

            {isDraft && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openSchedule}
                  disabled={sending || rescheduling || approving}
                >
                  <CalendarClock size={14} />
                  Agendar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={sending}
                  disabled={rescheduling || approving}
                  onClick={handleSend}
                >
                  <Send size={14} />
                  Enviar Agora
                </Button>
              </>
            )}

            {campaign.status === "SCHEDULED" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openSchedule}
                  disabled={rescheduling || unscheduling || sending}
                >
                  <Clock size={14} />
                  Alterar horário
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={unscheduling}
                  disabled={rescheduling || sending}
                  onClick={handleUnschedule}
                >
                  <X size={14} />
                  Desagendar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={sending}
                  disabled={rescheduling || unscheduling}
                  onClick={handleSend}
                >
                  <Send size={14} />
                  Enviar Agora
                </Button>
              </>
            )}
          </div>
        </div>

        {showScheduleInput && (campaign.status === "DRAFT" || campaign.status === "SCHEDULED") && (
          <Card padding="md">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {campaign.status === "DRAFT" ? "Agendar para" : "Novo horário"}
                </label>
                <input
                  type="datetime-local"
                  value={newScheduleDate}
                  onChange={(e) => setNewScheduleDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  loading={rescheduling}
                  disabled={!newScheduleDate}
                  onClick={handleSchedule}
                >
                  {campaign.status === "DRAFT" ? "Agendar" : "Salvar"}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={rescheduling}
                  onClick={() => {
                    setShowScheduleInput(false);
                    setActionError(null);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </div>
        )}
        {actionMsg && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {actionMsg}
          </div>
        )}

        {/* Edição (DRAFT) — assunto, remetente, audiência */}
        {isDraft && (
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Editar campanha</h3>
              <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
                <Save size={14} />
                Salvar
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Assunto</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className={inputCls}
                  placeholder="Assunto do email"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do remetente</label>
                <input
                  type="text"
                  value={editFromName}
                  onChange={(e) => setEditFromName(e.target.value)}
                  className={inputCls}
                  placeholder="AiMO"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email do remetente</label>
                <input
                  type="text"
                  value={editFromEmail}
                  onChange={(e) => setEditFromEmail(e.target.value)}
                  className={inputCls}
                  placeholder="noreply@aimocorp.app.br"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Audiência</label>
                <select
                  value={editSegmentId}
                  onChange={(e) => setEditSegmentId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Todos os contatos</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Selecione um segmento ou deixe em &quot;Todos os contatos&quot;. Salve para atualizar os destinatários.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Campaign info */}
        <Card padding="md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {campaign.name}
                </h2>
                <Badge variant={config.variant}>{config.label}</Badge>
              </div>
              <p className="text-sm text-gray-500">
                Assunto: <span className="text-gray-700">{campaign.subject}</span>
              </p>
              <p className="text-sm text-gray-500">
                Remetente:{" "}
                <span className="text-gray-700">
                  {campaign.fromName} &lt;{campaign.fromEmail}&gt;
                </span>
              </p>
              <p className="text-sm text-gray-500">
                Audiência:{" "}
                <span className="text-gray-700">
                  {campaign.segment
                    ? `${campaign.segment.name} (${campaign.segment.contactCount} contatos)`
                    : "Todos os contatos"}
                </span>
                {" — "}
                <span className="text-gray-700 font-medium">
                  {campaign.recipientCount} destinatários
                </span>
              </p>
            </div>
            <div className="text-right space-y-1 text-sm text-gray-500">
              <p>
                Criado em: <span className="text-gray-700">{formatDateTime(campaign.createdAt)}</span>
              </p>
              {campaign.scheduledAt && (
                <p>
                  Agendado para:{" "}
                  <span className="text-gray-700">
                    {formatDateTime(campaign.scheduledAt)}
                  </span>
                </p>
              )}
              {campaign.sentAt && (
                <p>
                  Enviado em:{" "}
                  <span className="text-gray-700">
                    {formatDateTime(campaign.sentAt)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Metrics */}
        {(campaign.status === "SENT" ||
          campaign.status === "SENDING") && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Métricas
            </h3>
            <CampaignMetrics campaignId={id} />
          </div>
        )}

        {/* Email Preview */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Preview do Email
          </h3>
          <EmailPreview
            html={campaign.htmlContent || "<p style='color:#999;text-align:center;padding:40px;'>Sem conteúdo</p>"}
            className="h-[500px]"
            branded
            brand={campaign.brand ?? "BGP"}
          />
        </div>
      </main>
    </div>
  );
}
