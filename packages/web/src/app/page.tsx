"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  products?: Array<{
    unitPrice: number;
    quantity: number;
    setupPrice?: number | null;
    recurrenceValue?: number | null;
    discount?: number;
  }>;
}

interface DealsResponse {
  data: Deal[];
  meta: { total: number };
}

interface PipelineStub {
  id: string;
  name: string;
}

interface PipelinesResponse {
  data: PipelineStub[];
}

interface PipelineSummaryStage {
  id: string;
  name: string;
  order: number;
  color: string;
  dealCount: number;
  totalValue: number;
}

interface PipelineSummaryResponse {
  data: {
    stages: PipelineSummaryStage[];
    totalDeals: number;
    totalValue: number;
    countsByStatus?: { OPEN: number; WON: number; LOST: number };
    wonValueBreakdown?: { total: number; monthly: number; setup: number };
  };
}

interface ApiUser {
  id: string;
  name: string;
}

interface UsersResponse {
  data: ApiUser[];
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
  monthlyValue: number;
  setupValue: number;
  stage: string;
  owner: string;
}

interface DashboardData {
  activeDealsCount: number;
  pipelineValue: number;
  closedDealsCount: number;
  conversionRate: number;
  closedDealsTotalValue: number;
  closedDealsMonthlyValue: number;
  closedDealsSetupValue: number;
  funnelStages: FunnelStage[];
  recentActivities: Activity[];
  topDeals: TopDeal[];
}

// ── Filter types ──────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "won" | "lost";
type PeriodFilter = "all" | "this_month" | "last_3" | "last_6" | "this_year";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FUNNEL_COLORS = [
  "#3B82F6", "#06B6D4", "#8B5CF6", "#F59E0B",
  "#F97316", "#EF4444", "#EC4899", "#22C55E",
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

const SELECT_CLASS =
  "appearance-none text-sm bg-white border border-gray-200 rounded-md px-3 py-1.5 pr-7 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500";

function mapActivityType(apiType: string): Activity["type"] {
  const map: Record<string, Activity["type"]> = {
    CALL: "call", call: "call",
    EMAIL: "email", email: "email",
    TASK: "task", task: "task",
    NOTE: "note", note: "note",
    STAGE_CHANGE: "stage_change", stage_change: "stage_change",
    NEW_LEAD: "new_lead", new_lead: "new_lead",
    WON: "won", won: "won",
  };
  return map[apiType] ?? "note";
}

/** Build deals query string from filters */
function buildDealsQs(
  opts: { status?: string; userId?: string; period?: string },
  extra?: Record<string, string>
): string {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "all") {
    const map: Record<string, string> = { active: "OPEN", won: "WON", lost: "LOST" };
    params.set("status", map[opts.status] || opts.status);
  }
  if (opts.userId && opts.userId !== "all") params.set("userId", opts.userId);
  if (opts.period && opts.period !== "all") params.set("period", opts.period);
  if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
  return params.toString();
}

/** Build summary query string */
function buildSummaryQs(opts: { status?: string; userId?: string; period?: string }): string {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== "all") {
    const map: Record<string, string> = { active: "OPEN", won: "WON", lost: "LOST" };
    params.set("status", map[opts.status] || opts.status);
  }
  if (opts.userId && opts.userId !== "all") params.set("userId", opts.userId);
  if (opts.period && opts.period !== "all") params.set("period", opts.period);
  return params.toString();
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

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

  // Filters
  const [pipelines, setPipelines] = useState<PipelineStub[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("this_month");

  // ── Load pipelines + users once ─────────────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [pRes, uRes] = await Promise.all([
          api.get<PipelinesResponse>("/pipelines"),
          api.get<UsersResponse>("/users?limit=100"),
        ]);
        const list = pRes.data ?? [];
        setPipelines(list);
        if (list.length > 0) setPipelineId(list[0].id);
        setUsers(uRes.data ?? []);
      } catch {
        // non-fatal
      }
    }
    init();
  }, []);

  // ── Load dashboard data when filters or pipeline change ─────────────────

  const loadData = useCallback(async () => {
    if (!pipelineId) return;
    setLoading(true);
    setError(null);

    const filterOpts = { status: statusFilter, userId: userFilter, period: periodFilter };

    try {
      // Build query strings
      const topDealsQs = buildDealsQs({ ...filterOpts, status: "active" }, { limit: "100" });
      const summaryQs = buildSummaryQs(filterOpts);

      let activeCount = 0;
      let wonCount = 0;
      let lostCount = 0;

      const [
        summaryRes,
        activitiesRes,
        topDealsRes,
      ] = await Promise.all([
        api.get<PipelineSummaryResponse>(
          `/pipelines/${pipelineId}/summary${summaryQs ? `?${summaryQs}` : ""}`
        ),
        api.get<ActivitiesResponse>("/activities?limit=10"),
        api.get<DealsResponse>(
          `/deals?pipelineId=${pipelineId}&${topDealsQs}`
        ),
      ]);

      // Extract counts from summary's countsByStatus (no extra requests needed)
      const cbs = summaryRes.data?.countsByStatus;
      if (cbs) {
        activeCount = cbs.OPEN ?? 0;
        wonCount = cbs.WON ?? 0;
        lostCount = cbs.LOST ?? 0;
      }

      const totalDeals = activeCount + wonCount + lostCount;
      const conversionRate = totalDeals > 0 ? (wonCount / totalDeals) * 100 : 0;

      // Funnel from summary
      const sorted = [...(summaryRes.data?.stages ?? [])].sort(
        (a, b) => a.order - b.order
      );
      const funnelStages: FunnelStage[] = sorted.map((stage, i) => ({
        name: stage.name,
        color: stage.color || FUNNEL_COLORS[i % FUNNEL_COLORS.length],
        count: stage.dealCount,
        value: stage.totalValue,
      }));
      const pipelineValue = summaryRes.data?.totalValue ?? 0;

      // Activities
      const recentActivities: Activity[] = (activitiesRes.data ?? []).map((a) => ({
        id: a.id,
        type: mapActivityType(a.type),
        text: a.content,
        deal: a.deal?.title ?? undefined,
        dealId: a.deal?.id ?? undefined,
        time: a.createdAt,
      }));

      // Top deals — rank by monthly value only (not setup)
      const topDeals: TopDeal[] = [...(topDealsRes.data ?? [])]
        .map((d) => {
          const products = d.products ?? [];
          const hasProducts = products.length > 0;
          const monthlyValue = hasProducts
            ? products.reduce(
                (sum, p) => sum + Number(p.recurrenceValue ?? p.unitPrice) * p.quantity,
                0
              )
            : Number(d.value ?? 0); // fallback: deal sem produtos usa value total como mensal
          const setupValue = hasProducts
            ? products.reduce(
                (sum, p) => sum + Number(p.setupPrice ?? 0),
                0
              )
            : 0;
          return {
            id: d.id,
            name: d.organization?.name ?? d.contact?.name ?? d.title,
            value: Number(d.value ?? 0),
            monthlyValue,
            setupValue,
            stage: d.stage?.name ?? "",
            owner: d.user?.name ?? "—",
          };
        })
        .filter((d) => d.monthlyValue > 0 || d.setupValue > 0)
        .sort((a, b) => b.monthlyValue - a.monthlyValue)
        .slice(0, 5);

      setData({
        activeDealsCount: activeCount,
        pipelineValue,
        closedDealsCount: wonCount,
        closedDealsTotalValue: summaryRes.data?.wonValueBreakdown?.total ?? 0,
        closedDealsMonthlyValue: summaryRes.data?.wonValueBreakdown?.monthly ?? 0,
        closedDealsSetupValue: summaryRes.data?.wonValueBreakdown?.setup ?? 0,
        conversionRate,
        funnelStages,
        recentActivities,
        topDeals,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [pipelineId, statusFilter, userFilter, periodFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Metrics ───────────────────────────────────────────────────────────────

  const metrics = data
    ? [
        {
          title: "Negociações em Andamento",
          value: String(data.activeDealsCount),
          sub: "negociações ativas",
          icon: TrendingUp,
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          title: "Valor Total no Pipeline",
          value: formatCurrency(data.pipelineValue),
          sub: "valor total",
          icon: DollarSign,
          color: "text-green-600",
          bg: "bg-green-50",
        },
        {
          title: "Vendas Fechadas",
          value: String(data.closedDealsCount),
          sub: `${formatCurrency(data.closedDealsMonthlyValue)}/mês + ${formatCurrency(data.closedDealsSetupValue)} setup`,
          icon: Trophy,
          color: "text-yellow-600",
          bg: "bg-yellow-50",
        },
        {
          title: "Taxa de Conversão",
          value: `${data.conversionRate.toFixed(1)}%`,
          sub: "ganhos / total",
          icon: Percent,
          color: "text-purple-600",
          bg: "bg-purple-50",
        },
      ]
    : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Dashboard" />

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            Erro ao carregar dados: {error}
          </div>
        )}

        {/* ── Filters bar ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pipeline dropdown */}
          <div className="relative">
            <select
              value={pipelineId || ""}
              onChange={(e) => setPipelineId(e.target.value)}
              className={`${SELECT_CLASS} text-gray-700 font-medium`}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
          </div>

          {/* User dropdown */}
          <div className="relative">
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className={`${SELECT_CLASS} text-gray-600`}
            >
              <option value="all">Todos os usuários</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
          </div>

          {/* Period dropdown */}
          <div className="relative">
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
              className={`${SELECT_CLASS} text-gray-600`}
            >
              <option value="all">Todos os períodos</option>
              <option value="this_month">Este mês</option>
              <option value="last_3">Últimos 3 meses</option>
              <option value="last_6">Últimos 6 meses</option>
              <option value="this_year">Este ano</option>
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1 ml-1">
            {([
              { value: "all", label: "Todos" },
              { value: "active", label: "Em andamento" },
              { value: "won", label: "Ganhos" },
              { value: "lost", label: "Perdidos" },
            ] as { value: StatusFilter; label: string }[]).map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === f.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

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
                <span className="text-xs text-gray-400">
                  {statusFilter === "all"
                    ? "Todas as negociações"
                    : statusFilter === "active"
                    ? "Em andamento"
                    : statusFilter === "won"
                    ? "Ganhos"
                    : "Perdidos"}
                </span>
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
              <CardTitle>Top 5 Em Andamento</CardTitle>
              {!loading && (
                <span className="text-sm font-bold text-gray-700">
                  {formatCurrency(
                    (data?.topDeals ?? []).reduce((s, d) => s + d.monthlyValue, 0)
                  )}/mês
                </span>
              )}
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
                  <Link key={deal.id} href={`/pipeline/${deal.id}`} className="flex items-center justify-between gap-2 hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors">
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
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-blue-600">
                        {formatCurrency(deal.monthlyValue)}/mês
                      </p>
                      {deal.setupValue > 0 && (
                        <p className="text-[10px] text-gray-400">
                          +{formatCurrency(deal.setupValue)} setup
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
                {(data?.topDeals ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    Nenhuma negociação encontrada
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
            <Link href="/tasks" className="text-xs text-blue-600 hover:underline">
              Ver todas
            </Link>
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
