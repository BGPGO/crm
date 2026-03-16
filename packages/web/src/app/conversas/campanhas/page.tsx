"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { Plus, Play, Eye } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  status: "DRAFT" | "RUNNING" | "PAUSED" | "COMPLETED";
  totalContacts: number;
  sentCount: number;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Rascunho", classes: "bg-gray-100 text-gray-600" },
  RUNNING: { label: "Enviando", classes: "bg-blue-100 text-blue-700 animate-pulse" },
  PAUSED: { label: "Pausada", classes: "bg-yellow-100 text-yellow-700" },
  COMPLETED: { label: "Concluída", classes: "bg-green-100 text-green-700" },
};

export default function ConversasCampanhasPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ data: Campaign[] }>("/whatsapp/campaigns");
      setCampaigns(res.data || []);
    } catch {
      setError("Erro ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleStart = async (id: string) => {
    try {
      await api.post(`/whatsapp/campaigns/${id}/start`, {});
      await fetchCampaigns();
    } catch {
      setError("Erro ao iniciar campanha.");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Campanhas" breadcrumb={["Conversas", "Campanhas"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchCampaigns()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Todas as Campanhas</h2>
          <Link
            href="/conversas/campanhas/nova"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Nova Campanha
          </Link>
        </div>

        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Progresso</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      Nenhuma campanha encontrada
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => {
                    const cfg = statusConfig[campaign.status] || statusConfig.DRAFT;
                    return (
                      <tr key={campaign.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">{campaign.name}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            cfg.classes
                          )}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {campaign.sentCount}/{campaign.totalContacts}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(campaign.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {campaign.status === "DRAFT" && (
                              <button
                                onClick={() => handleStart(campaign.id)}
                                className="inline-flex items-center gap-1 text-xs text-green-600 font-medium hover:underline"
                              >
                                <Play size={12} /> Iniciar
                              </button>
                            )}
                            <Link
                              href={`/conversas/campanhas/${campaign.id}`}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
                            >
                              <Eye size={12} /> Ver
                            </Link>
                          </div>
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
