"use client";

import { useState, useEffect } from "react";
import { Loader2, Send, MailOpen, MousePointerClick, AlertTriangle } from "lucide-react";
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
      label: "Bounced",
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
    </div>
  );
}
