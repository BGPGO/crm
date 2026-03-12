"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import FunnelChart, { FunnelStage } from "@/components/dashboard/FunnelChart";
import RecentActivities, { Activity } from "@/components/dashboard/RecentActivities";
import {
  TrendingUp,
  DollarSign,
  Trophy,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api";

// ── API response types ────────────────────────────────────────────────────────

interface Deal {
  id: string;
  title: string;
  value: number;
  status: string;
  stage: { name: string };
  contact: { name: string } | null;
  organization: { name: string } | null;
  user: { name: string } | null;
}

interface DealsResponse {
  data: Deal[];
  meta: { total: number };
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  _count?: { deals: number };
  deals?: { value: number }[];
}

interface PipelinesResponse {
  data: Pipeline[];
}

interface ApiActivity {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  user: { name: string } | null;
  deal: { id: string; title: string } | null;
}

interface ActivitiesResponse {
  data: ApiActivity[];
}

// ── Derived view-model types ──────────────────────────────────────────────────

interface TopDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  owner: string;
}

interface DashboardData {
  activeDealsCount: number;
  pipelineValue: number;
  closedDealsCount: number;
  conversionRate: number;
  funnelStages: FunnelStage[];
  recentActivities: Activity[];
  topDeals: TopDeal[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUNNEL_COLORS = [
  "#3B82F6",
  "#06B6D4",
  "#8B5CF6",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#22C55E",
];

const STAGE_BADGE: Record<string, "blue" | "green" | "yellow" | "orange" | "purple" | "red" | "gray"> = {
  Lead: "blue",
  "Contato Feito": "blue",
  "Marcar Reunião": "purple",
  "Reunião Marcada": "yellow",
  "Proposta Enviada": "orange",
  "Aguardando Dados": "red",
  "Aguardando Assinatura": "purple",
  "Ganho Fechado": "green",
};

function mapActivityType(apiType: string): Activity["type"] {
  const map: Record<string, Activity["type"]> = {
    CALL: "call",
    call: "call",
    EMAIL: "email",
    email: "email",
    TASK: "task",
    task: "task",
    NOTE: "note",
    note: "note",
    STAGE_CHANGE: "stage_change",
    stage_change: "stage_change",
    NEW_LEAD: "new_lead",
    new_lead: "new_lead",
    WON: "won",
    won: "won",
  };
  return map[apiType] ?? "note";
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card padding="md">
      <div className="animate-pulse space-y-3">
        <div className="h-3 bg-gray-200 rounded w-2/3" />
        <div className="h-7 bg-gray-200 rounded w-1/2" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </div>
    </Card>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-100 rounded-xl ${className ?? ""}`} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Fire all requests in parallel
        const [openDealsRes, wonDealsRes, pipelinesRes, activitiesRes] =
          await Promise.all([
            api.get<DealsResponse>("/deals?status=OPEN"),
            api.get<DealsResponse>("/deals?status=WON"),
            api.get<PipelinesResponse>("/pipelines"),
            api.get<ActivitiesResponse>("/activities?limit=10"),
          ]);

        if (cancelled) return;

        const toNum = (v: unknown): number => Number(v) || 0;
        const openDeals = (openDealsRes.data ?? []).map(d => ({ ...d, value: toNum(d.value) }));
        const wonDeals = (wonDealsRes.data ?? []).map(d => ({ ...d, value: toNum(d.value) }));

        // ── Metrics ────────────────────────────────────────────────────────────
        const activeDealsCount = openDeals.length;
        const pipelineValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
        const closedDealsCount = wonDeals.length;
        const conversionRate =
          openDeals.length + wonDeals.length > 0
            ? (wonDeals.length / (openDeals.length + wonDeals.length)) * 100
            : 0;

        // ── Funnel stages ──────────────────────────────────────────────────────
        // Try to use the first pipeline's stage data; fall back to deriving from open deals
        let funnelStages: FunnelStage[] = [];

        const pipelines = pipelinesRes.data ?? [];
        if (pipelines.length > 0) {
          // Fetch the first pipeline details (includes stages with deal counts/values)
          try {
            const pipelineRes = await api.get<{ data: Pipeline & { deals?: Deal[] } }>(
              `/pipelines/${pipelines[0].id}`
            );
            const pipelineDetail = pipelineRes.data;
            if (!cancelled && pipelineDetail?.stages?.length && pipelineDetail.deals) {
              // Group deals by stageId
              const dealsByStage = new Map<string, { count: number; value: number }>();
              for (const d of pipelineDetail.deals) {
                const stageId = (d as unknown as { stageId: string }).stageId;
                const entry = dealsByStage.get(stageId) ?? { count: 0, value: 0 };
                entry.count += 1;
                entry.value += Number(d.value) || 0;
                dealsByStage.set(stageId, entry);
              }
              const sorted = [...pipelineDetail.stages].sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0)
              );
              funnelStages = sorted.map((stage, i) => {
                const stageColor = stage.color || FUNNEL_COLORS[i % FUNNEL_COLORS.length];
                const entry = dealsByStage.get(stage.id) ?? { count: 0, value: 0 };
                return { name: stage.name, color: stageColor, count: entry.count, value: entry.value };
              });
            }
          } catch {
            // Pipeline detail failed — fall through to client-side derivation
          }
        }

        // If API didn't give us stage data, derive it from open deals client-side
        if (funnelStages.length === 0) {
          const stageMap = new Map<string, { count: number; value: number }>();
          for (const deal of openDeals) {
            const stageName = deal.stage?.name ?? "Sem etapa";
            const entry = stageMap.get(stageName) ?? { count: 0, value: 0 };
            entry.count += 1;
            entry.value += deal.value ?? 0;
            stageMap.set(stageName, entry);
          }
          funnelStages = Array.from(stageMap.entries()).map(
            ([name, { count, value }], i) => ({
              name,
              color: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
              count,
              value,
            })
          );
        }

        // ── Activities ─────────────────────────────────────────────────────────
        const recentActivities: Activity[] = (activitiesRes.data ?? []).map(
          (a) => ({
            id: a.id,
            type: mapActivityType(a.type),
            text: a.content,
            deal: a.deal?.title ?? undefined,
            dealId: a.deal?.id ?? undefined,
            time: a.createdAt,
          })
        );

        // ── Top deals ──────────────────────────────────────────────────────────
        const topDeals: TopDeal[] = [...openDeals]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .slice(0, 5)
          .map((d) => ({
            id: d.id,
            name: d.organization?.name ?? d.contact?.name ?? d.title,
            value: d.value ?? 0,
            stage: d.stage?.name ?? "",
            owner: d.user?.name ?? "—",
          }));

        setData({
          activeDealsCount,
          pipelineValue,
          closedDealsCount,
          conversionRate,
          funnelStages,
          recentActivities,
          topDeals,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar dados");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const metrics = data
    ? [
        {
          title: "Negociações em Andamento",
          value: String(data.activeDealsCount),
          sub: "deals ativos",
          icon: TrendingUp,
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          title: "Valor Total no Pipeline",
          value: formatCurrency(data.pipelineValue),
          sub: "em aberto",
          icon: DollarSign,
          color: "text-green-600",
          bg: "bg-green-50",
        },
        {
          title: "Vendas Fechadas",
          value: String(data.closedDealsCount),
          sub: "negociações ganhas",
          icon: Trophy,
          color: "text-yellow-600",
          bg: "bg-yellow-50",
        },
        {
          title: "Taxa de Conversão",
          value: `${data.conversionRate.toFixed(1)}%`,
          sub: "ganhos vs. total",
          icon: Percent,
          color: "text-purple-600",
          bg: "bg-purple-50",
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Dashboard" />

      <main className="flex-1 p-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            Erro ao carregar dados: {error}
          </div>
        )}

        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <Card key={metric.title} padding="md">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          {metric.title}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {metric.value}
                        </p>
                        {metric.sub && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {metric.sub}
                          </p>
                        )}
                      </div>
                      <div className={`${metric.bg} ${metric.color} p-2.5 rounded-xl`}>
                        <Icon size={22} />
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Funil de Vendas */}
          <div className="xl:col-span-2">
            <Card padding="md">
              <CardHeader>
                <CardTitle>Funil de Vendas</CardTitle>
                <span className="text-xs text-gray-400">Negociações em aberto</span>
              </CardHeader>
              {loading ? (
                <SkeletonBlock className="h-64 mt-2" />
              ) : (
                <FunnelChart stages={data?.funnelStages ?? []} />
              )}
            </Card>
          </div>

          {/* Maiores Negociações */}
          <Card padding="md">
            <CardHeader>
              <CardTitle>Top 5 Negociações</CardTitle>
            </CardHeader>
            {loading ? (
              <div className="space-y-3 mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(data?.topDeals ?? []).map((deal, i) => (
                  <div key={deal.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {deal.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant={STAGE_BADGE[deal.stage] ?? "gray"}>
                            {deal.stage}
                          </Badge>
                          <span className="text-xs text-gray-400">{deal.owner}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-blue-600 flex-shrink-0">
                      {formatCurrency(deal.value)}
                    </p>
                  </div>
                ))}
                {!loading && (data?.topDeals ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Nenhuma negociação em aberto
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Atividades Recentes */}
        <Card padding="md">
          <CardHeader>
            <CardTitle>Últimas Atividades</CardTitle>
            <button className="text-xs text-blue-600 hover:underline">
              Ver todas
            </button>
          </CardHeader>
          {loading ? (
            <div className="space-y-4 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <RecentActivities activities={data?.recentActivities ?? []} />
          )}
        </Card>
      </main>
    </div>
  );
}
