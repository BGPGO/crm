"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  Loader2,
  MessageSquare,
  Calendar,
  Send,
  DollarSign,
  Bot,
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  Zap,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStage {
  stageId: string;
  stageName: string;
  stageColor: string | null;
  stageOrder: number;
  count: number;
}

interface DashboardData {
  pipeline: PipelineStage[];
  meetings: {
    total: number;
    thisWeek: number;
    today: number;
  };
  messages: {
    total: number;
    templates: number;
    botMessages: number;
    humanMessages: number;
    clientMessages: number;
    marketingTemplates: number;
    utilityTemplates: number;
  };
  cost: {
    marketing: number;
    utility: number;
    service: number;
    total: number;
    currency: "BRL";
  };
  automations: {
    activeEnrollments: number;
    completedToday: number;
    pausedByResponse: number;
  };
  conversations: {
    total: number;
    active: number;
    withBot: number;
    needsHuman: number;
    optedOut: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtCurrency(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function costColor(total: number): string {
  if (total < 50) return "text-emerald-400";
  if (total < 200) return "text-yellow-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Sub-components (inline — no separate files)
// ---------------------------------------------------------------------------

function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-gray-400" />;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  subLabel,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string | number;
  subLabel?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <div className={clsx("text-2xl font-bold text-gray-900 dark:text-white", valueClass)}>
        {typeof value === "number" ? fmt(value) : value}
      </div>
      {sub !== undefined && subLabel && (
        <div className="text-xs text-gray-500">
          <span className="text-gray-700 dark:text-gray-300 font-medium">
            {typeof sub === "number" ? fmt(sub) : sub}
          </span>{" "}
          {subLabel}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

function FunnelBar({
  stage,
  maxCount,
}: {
  stage: PipelineStage;
  maxCount: number;
}) {
  const pct = maxCount > 0 ? Math.max(4, (stage.count / maxCount) * 100) : 4;

  // Use stage color if available, otherwise gradient based on order
  const gradients = [
    "from-blue-500 to-blue-400",
    "from-indigo-500 to-indigo-400",
    "from-violet-500 to-violet-400",
    "from-purple-500 to-purple-400",
    "from-fuchsia-500 to-fuchsia-400",
    "from-pink-500 to-pink-400",
    "from-rose-500 to-rose-400",
    "from-emerald-500 to-emerald-400",
  ];
  const gradientClass = gradients[stage.stageOrder % gradients.length];

  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-sm text-gray-700 dark:text-gray-300 truncate shrink-0">
        {stage.stageName}
      </div>
      <div className="flex-1 h-5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        {stage.stageColor ? (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: stage.stageColor,
            }}
          />
        ) : (
          <div
            className={clsx(
              "h-full rounded-full bg-gradient-to-r transition-all duration-500",
              gradientClass
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="w-8 text-right text-sm font-medium text-gray-900 dark:text-white shrink-0">
        {stage.count}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WabaDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: DashboardData }>(
        "/wa/conversations/dashboard"
      );
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("[WABA Dashboard] Erro ao carregar métricas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center h-64">
        <Spinner size={32} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center h-64 text-gray-500">
        Erro ao carregar dashboard.
      </div>
    );
  }

  const maxPipelineCount = Math.max(...data.pipeline.map((s) => s.count), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Dashboard WhatsApp Cloud API
          </h1>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-0.5">
              Atualizado às{" "}
              {lastUpdated.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              &middot; auto-refresh a cada 60s
            </p>
          )}
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* ── Top KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<MessageSquare size={16} />}
          label="Conversas"
          value={data.conversations.active}
          sub={data.conversations.needsHuman}
          subLabel="aguardam humano"
          valueClass="text-blue-400"
        />
        <StatCard
          icon={<Calendar size={16} />}
          label="Reuniões"
          value={data.meetings.total}
          sub={data.meetings.today}
          subLabel="hoje"
          valueClass="text-violet-400"
        />
        <StatCard
          icon={<Send size={16} />}
          label="Mensagens (30d)"
          value={data.messages.total}
          sub={data.messages.botMessages}
          subLabel="pelo bot"
          valueClass="text-emerald-400"
        />
        <StatCard
          icon={<DollarSign size={16} />}
          label="Custo estimado (30d)"
          value={fmtCurrency(data.cost.total)}
          sub={fmtCurrency(data.cost.marketing)}
          subLabel="mktg + util"
          valueClass={costColor(data.cost.total)}
        />
      </div>

      {/* ── Funnel ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <SectionTitle>Funil de Vendas — Contatos com Conversa WA</SectionTitle>
        {data.pipeline.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum dado de funil disponível.</p>
        ) : (
          <div className="space-y-2.5">
            {data.pipeline.map((stage) => (
              <FunnelBar
                key={stage.stageId}
                stage={stage}
                maxCount={maxPipelineCount}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Messages + Automations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Messages breakdown */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <SectionTitle>Mensagens (últimos 30 dias)</SectionTitle>
          <div className="space-y-3">
            <MessageRow
              icon={<TrendingUp size={14} className="text-orange-400" />}
              label="Templates Marketing"
              value={data.messages.marketingTemplates}
            />
            <MessageRow
              icon={<ChevronRight size={14} className="text-blue-400" />}
              label="Templates Utility"
              value={data.messages.utilityTemplates}
            />
            <MessageRow
              icon={<Bot size={14} className="text-emerald-400" />}
              label="Bot (texto livre)"
              value={data.messages.botMessages}
            />
            <MessageRow
              icon={<UserCheck size={14} className="text-violet-400" />}
              label="Humano"
              value={data.messages.humanMessages}
            />
            <MessageRow
              icon={<Users size={14} className="text-gray-400" />}
              label="Recebidas (clientes)"
              value={data.messages.clientMessages}
            />
          </div>
        </div>

        {/* Automations */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <SectionTitle>Automações WABA</SectionTitle>
          <div className="space-y-3">
            <MessageRow
              icon={<Zap size={14} className="text-yellow-400" />}
              label="Matrículas ativas"
              value={data.automations.activeEnrollments}
            />
            <MessageRow
              icon={<CheckCircle2 size={14} className="text-emerald-400" />}
              label="Concluídas hoje"
              value={data.automations.completedToday}
            />
            <MessageRow
              icon={<PauseCircle size={14} className="text-blue-400" />}
              label="Pausadas por resposta"
              value={data.automations.pausedByResponse}
            />
          </div>

          <div className="mt-5 pt-4 border-t border-gray-700">
            <SectionTitle>Conversas</SectionTitle>
            <div className="space-y-3">
              <MessageRow
                icon={<Bot size={14} className="text-emerald-400" />}
                label="Com bot ativo"
                value={data.conversations.withBot}
              />
              <MessageRow
                icon={<UserX size={14} className="text-red-400" />}
                label="Opt-out"
                value={data.conversations.optedOut}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Cost breakdown ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <SectionTitle>Custo Estimado (últimos 30 dias)</SectionTitle>
        <div className="space-y-2 text-sm">
          <CostRow
            label="Marketing"
            count={data.messages.marketingTemplates}
            unit="conversas"
            rate={0.375}
            total={data.cost.marketing}
            colorClass="text-orange-400"
          />
          <CostRow
            label="Utility"
            count={data.messages.utilityTemplates}
            unit="conversas"
            rate={0.0477}
            total={data.cost.utility}
            colorClass="text-blue-400"
          />
          <div className="flex items-center gap-2 text-gray-500 py-1">
            <span className="w-24 shrink-0">Service</span>
            <span className="flex-1">grátis (primeiras 1.000/mês)</span>
            <span className="font-medium text-emerald-400">R$0,00</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-700 font-semibold">
            <span className="w-24 shrink-0 text-gray-700 dark:text-gray-300">Total estimado</span>
            <span className="flex-1" />
            <span className={clsx("text-lg", costColor(data.cost.total))}>
              {fmtCurrency(data.cost.total)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny inline sub-components
// ---------------------------------------------------------------------------

function MessageRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="flex-1 text-gray-600 dark:text-gray-300">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-white">{fmt(value)}</span>
    </div>
  );
}

function CostRow({
  label,
  count,
  unit,
  rate,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  unit: string;
  rate: number;
  total: number;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={clsx("w-24 shrink-0 font-medium", colorClass)}>
        {label}
      </span>
      <span className="flex-1 text-gray-500 dark:text-gray-400">
        {fmt(count)} {unit} &times; {fmtCurrency(rate)}
      </span>
      <span className="font-semibold text-gray-900 dark:text-white">{fmtCurrency(total)}</span>
    </div>
  );
}
