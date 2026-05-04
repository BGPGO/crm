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
import { Send, ArrowLeft, Loader2 } from "lucide-react";
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

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<"not_found" | "network" | null>(null);

  useEffect(() => {
    async function fetchCampaign() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.get<{ data: Campaign }>(`/email-campaigns/${id}`);
        setCampaign(result.data);
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

  const handleSend = async () => {
    if (!confirm("Tem certeza que deseja enviar esta campanha agora?")) return;
    setSending(true);
    try {
      await api.post(`/email-campaigns/${id}/send`, {});
      const updated = await api.get<{ data: Campaign }>(`/email-campaigns/${id}`);
      setCampaign(updated.data);
    } catch (err) {
      console.error("Erro ao enviar campanha:", err);
    } finally {
      setSending(false);
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
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
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

          {campaign.status === "DRAFT" && (
            <Button
              variant="primary"
              size="sm"
              loading={sending}
              onClick={handleSend}
            >
              <Send size={14} />
              Enviar Agora
            </Button>
          )}
        </div>

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
