"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Send, MailOpen, MousePointerClick, AlertTriangle, Users, ExternalLink } from "lucide-react";
import clsx from "clsx";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";

interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

interface Recipient {
  id: string;
  contact: { id: string; name: string; email: string; phone: string | null } | null;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
  deal: { id: string; title: string; status: string; stage: { name: string; color: string | null } | null } | null;
}

interface CampaignMetricsProps {
  campaignId: string;
}

function getRateColor(rate: number): string {
  if (rate >= 0.3) return "bg-green-500";
  if (rate >= 0.15) return "bg-yellow-500";
  return "bg-red-500";
}

function getRateTextColor(rate: number): string {
  if (rate >= 0.3) return "text-green-600";
  if (rate >= 0.15) return "text-yellow-600";
  return "text-red-600";
}

export default function CampaignMetrics({ campaignId }: CampaignMetricsProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientFilter, setRecipientFilter] = useState<string>("all");
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);

  const fetchRecipients = useCallback(async (filter?: string) => {
    setRecipientLoading(true);
    try {
      const f = filter || recipientFilter;
      const qs = f !== "all" ? `?status=${f}` : "";
      const res = await api.get<{ data: Recipient[] }>(`/email-campaigns/${campaignId}/recipients${qs}`);
      setRecipients(res.data || []);
    } catch { /* silent */ }
    finally { setRecipientLoading(false); }
  }, [campaignId, recipientFilter]);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      try {
        const result = await api.get<{ data: CampaignStats }>(
          `/email-campaigns/${campaignId}/stats`
        );
        setStats(result.data);
      } catch (err) {
        console.error("Erro ao buscar métricas:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando métricas...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Não foi possível carregar as métricas.
      </div>
    );
  }

  const metrics = [
    {
      label: "Enviados",
      value: stats.sent,
      icon: Send,
      rate: null as number | null,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      label: "Abertos",
      value: stats.opened,
      icon: MailOpen,
      rate: stats.openRate,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      label: "Clicados",
      value: stats.clicked,
      icon: MousePointerClick,
      rate: stats.clickRate,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      label: "Rejeitados",
      value: stats.bounced,
      icon: AlertTriangle,
      rate: null as number | null,
      color: "text-red-600",
      bgColor: "bg-red-100",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label} padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {metric.value.toLocaleString("pt-BR")}
                  </p>
                  {metric.rate !== null && (
                    <p
                      className={`text-sm font-medium mt-0.5 ${getRateTextColor(
                        metric.rate
                      )}`}
                    >
                      {(metric.rate * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
                <div
                  className={`p-2 rounded-lg ${metric.bgColor}`}
                >
                  <Icon size={18} className={metric.color} />
                </div>
              </div>

              {/* Rate bar */}
              {metric.rate !== null && (
                <div className="mt-3">
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getRateColor(
                        metric.rate
                      )}`}
                      style={{ width: `${Math.min(metric.rate * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Summary row */}
      <Card padding="sm">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="text-gray-500">
              Entregues:{" "}
              <span className="font-medium text-gray-900">
                {stats.delivered.toLocaleString("pt-BR")}
              </span>
            </span>
            <span className="text-gray-500">
              Descadastros:{" "}
              <span className="font-medium text-gray-900">
                {stats.unsubscribed.toLocaleString("pt-BR")}
              </span>
            </span>
          </div>
          <span className="text-gray-400 text-xs">
            Taxa de entrega:{" "}
            {stats.sent > 0
              ? ((stats.delivered / stats.sent) * 100).toFixed(1)
              : "0"}
            %
          </span>
        </div>
      </Card>

      {/* Recipients list */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Users size={16} />
            Destinatários
          </h3>
          {!showRecipients ? (
            <button
              onClick={() => { setShowRecipients(true); fetchRecipients(); }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver lista
            </button>
          ) : (
            <div className="flex gap-1">
              {([
                { key: "all", label: "Todos" },
                { key: "CLICKED", label: "Clicaram" },
                { key: "OPENED", label: "Abriram" },
                { key: "DELIVERED", label: "Entregue" },
                { key: "BOUNCED", label: "Rejeitado" },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setRecipientFilter(f.key); fetchRecipients(f.key); }}
                  className={clsx(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    recipientFilter === f.key
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showRecipients && (
          recipientLoading ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 size={16} className="animate-spin mr-2" />
              Carregando...
            </div>
          ) : recipients.length === 0 ? (
            <p className="text-center py-4 text-sm text-gray-400">Nenhum destinatário encontrado.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 text-xs font-medium text-gray-500">Nome</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Email</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Status</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Abriu</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Clicou</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Negociação</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-2">
                        {r.contact ? (
                          <a href={`/contacts/${r.contact.id}`} className="text-blue-600 hover:underline font-medium">
                            {r.contact.name}
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-gray-500 text-xs">{r.contact?.email || "-"}</td>
                      <td className="py-2 pr-2">
                        <span className={clsx(
                          "inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium",
                          r.status === "CLICKED" ? "bg-purple-100 text-purple-700" :
                          r.status === "OPENED" ? "bg-green-100 text-green-700" :
                          r.status === "DELIVERED" ? "bg-blue-100 text-blue-700" :
                          r.status === "BOUNCED" ? "bg-red-100 text-red-700" :
                          r.status === "SPAM" ? "bg-red-100 text-red-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {r.status === "CLICKED" ? "Clicou" :
                           r.status === "OPENED" ? "Abriu" :
                           r.status === "DELIVERED" ? "Entregue" :
                           r.status === "BOUNCED" ? "Rejeitado" :
                           r.status === "SPAM" ? "Spam" :
                           r.status === "SENT" ? "Enviado" :
                           r.status === "UNSUBSCRIBED" ? "Descadastrou" :
                           r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-xs text-gray-500">
                        {r.openedAt ? new Date(r.openedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="py-2 pr-2 text-xs text-gray-500">
                        {r.clickedAt ? new Date(r.clickedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}
                      </td>
                      <td className="py-2 text-xs">
                        {r.deal ? (
                          <a href={`/pipeline/${r.deal.id}`} className="inline-flex items-center gap-1 hover:underline">
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{
                                backgroundColor: `${r.deal.stage?.color || "#6B7280"}15`,
                                color: r.deal.stage?.color || "#6B7280",
                              }}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: r.deal.stage?.color || "#6B7280" }}
                              />
                              {r.deal.stage?.name}
                            </span>
                            {r.deal.status === "WON" && <span className="text-green-600 font-medium">Ganho</span>}
                            {r.deal.status === "LOST" && <span className="text-red-500 font-medium">Perdido</span>}
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}
