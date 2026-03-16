"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { Play } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface CampaignContact {
  phone: string;
  status: string;
  sentAt: string | null;
  error: string | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  message: string;
  status: "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";
  totalContacts: number;
  sentCount: number;
  contacts: CampaignContact[];
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Rascunho", classes: "bg-gray-100 text-gray-600" },
  RUNNING: { label: "Enviando", classes: "bg-blue-100 text-blue-700 animate-pulse" },
  PAUSED: { label: "Pausada", classes: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "Concluída", classes: "bg-green-100 text-green-700" },
};

const contactStatusConfig: Record<string, { label: string; classes: string }> = {
  pending: { label: "Pendente", classes: "bg-gray-100 text-gray-600" },
  sent: { label: "Enviado", classes: "bg-green-100 text-green-700" },
  failed: { label: "Erro", classes: "bg-red-100 text-red-700" },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ data: CampaignDetail }>(`/whatsapp/campaigns/${id}`);
      setCampaign(res.data);
    } catch {
      setError("Erro ao carregar campanha.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  const handleStart = async () => {
    try {
      await api.post(`/whatsapp/campaigns/${id}/start`, {});
      await fetchCampaign();
    } catch {
      setError("Erro ao iniciar campanha.");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Campanha" breadcrumb={["Conversas", "Campanhas", "Detalhes"]} />
        <ConversasNav />
        <main className="flex-1 p-6 space-y-4">
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-60 bg-gray-100 rounded-xl animate-pulse" />
        </main>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Campanha" breadcrumb={["Conversas", "Campanhas", "Detalhes"]} />
        <ConversasNav />
        <main className="flex-1 p-6">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-red-700">{error || "Campanha não encontrada."}</span>
            <button onClick={() => fetchCampaign()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
          </div>
        </main>
      </div>
    );
  }

  const cfg = statusConfig[campaign.status] || statusConfig.DRAFT;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title={campaign.name} breadcrumb={["Conversas", "Campanhas", campaign.name]} />
      <ConversasNav />

      <main className="flex-1 p-6 space-y-6">
        {/* Campaign info */}
        <Card padding="lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{campaign.name}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className={clsx(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                  cfg.classes
                )}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-500">
                  Criado em {formatDate(campaign.createdAt)}
                </span>
              </div>
            </div>
            {(campaign.status === "DRAFT" || campaign.status === "PAUSED") && (
              <button
                onClick={handleStart}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                <Play size={16} />
                Iniciar
              </button>
            )}
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Mensagem</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{campaign.message}</p>
          </div>

          <div className="mt-4 flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-500">Total de Contatos</p>
              <p className="text-lg font-semibold text-gray-900">{campaign.totalContacts}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Enviados</p>
              <p className="text-lg font-semibold text-green-600">{campaign.sentCount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Progresso</p>
              <p className="text-lg font-semibold text-gray-900">
                {campaign.totalContacts > 0
                  ? Math.round((campaign.sentCount / campaign.totalContacts) * 100)
                  : 0}%
              </p>
            </div>
          </div>
        </Card>

        {/* Contacts table */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Contatos</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Enviado em</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Erro</th>
                </tr>
              </thead>
              <tbody>
                {(!campaign.contacts || campaign.contacts.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Nenhum contato na campanha
                    </td>
                  </tr>
                ) : (
                  campaign.contacts.map((contact, idx) => {
                    const ccfg = contactStatusConfig[contact.status] || contactStatusConfig.pending;
                    return (
                      <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-900 font-mono">{contact.phone}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            ccfg.classes
                          )}>
                            {ccfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {contact.sentAt ? formatDate(contact.sentAt) : "-"}
                        </td>
                        <td className="px-4 py-3 text-red-600 text-xs">
                          {contact.error || "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
