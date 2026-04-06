"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  Loader2,
  Save,
  Phone,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  MessageSquare,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Ban,
  Info,
  TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WabaConfig {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  webhookUrl: string | null;
  displayPhone: string | null;
  dailyMessageLimit: number;
  dailySpendLimitBRL: number;
  isActive: boolean;
}

interface WabaStatus {
  configured: boolean;
  isActive: boolean;
  phone: {
    displayPhone: string | null;
    qualityRating: string | null;
    status: string | null;
    messagingTier: string | null;
  } | null;
  today: {
    messagesSent: number;
    dailyLimit: number;
    remaining: number;
  };
  spend?: {
    totalCost: number;
    limitBRL: number;
    remaining: number;
    exceeded: boolean;
    marketingCount: number;
    utilityCount: number;
    automationCost?: number;
    automationMarketingCount?: number;
    automationUtilityCount?: number;
    broadcastCost?: number;
    broadcastMarketingCount?: number;
    broadcastUtilityCount?: number;
  };
  templates: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={clsx("animate-spin text-gray-400", className)} />;
}

function mask(value: string | null): string {
  if (!value) return "---";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function qualityColor(rating: string | null): "green" | "yellow" | "red" | "gray" {
  switch (rating?.toUpperCase()) {
    case "GREEN": return "green";
    case "YELLOW": return "yellow";
    case "RED": return "red";
    default: return "gray";
  }
}

function connectionVariant(status: string | null, configured: boolean): { label: string; variant: "green" | "yellow" | "red" | "gray" } {
  if (!configured) return { label: "Nao configurado", variant: "gray" };
  switch (status?.toUpperCase()) {
    case "CONNECTED": return { label: "Conectado", variant: "green" };
    case "PENDING_SETUP": return { label: "Pendente", variant: "yellow" };
    case "OFFLINE": return { label: "Offline", variant: "red" };
    default: return { label: status || "Desconhecido", variant: "yellow" };
  }
}

function tierMaxMessages(tier: string | null): number {
  switch (tier?.toUpperCase()) {
    case "TIER_1": return 250;
    case "TIER_2": return 1000;
    case "TIER_3": return 10000;
    default: return 250;
  }
}

function tierLabel(tier: string | null): string {
  switch (tier?.toUpperCase()) {
    case "TIER_1": return "Tier 1 — 250/dia";
    case "TIER_2": return "Tier 2 — 1.000/dia";
    case "TIER_3": return "Tier 3 — 10.000/dia";
    default: return tier || "---";
  }
}

// ---------------------------------------------------------------------------
// Security Dashboard
// ---------------------------------------------------------------------------

function SecurityDashboard({
  status,
  loading,
}: {
  status: WabaStatus | null;
  loading: boolean;
}) {
  if (loading || !status) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const quality = status.phone?.qualityRating?.toUpperCase() ?? null;
  const tier = status.phone?.messagingTier ?? null;
  const { messagesSent, dailyLimit } = status.today;
  const usagePct = dailyLimit > 0 ? Math.min((messagesSent / dailyLimit) * 100, 100) : 0;

  const qualityInfo = (() => {
    switch (quality) {
      case "GREEN":
        return {
          label: "Saudavel",
          icon: <ShieldCheck size={28} />,
          bg: "bg-green-50 dark:bg-green-950",
          border: "border-green-300 dark:border-green-700",
          text: "text-green-700 dark:text-green-300",
          badgeBg: "bg-green-500",
          pulse: false,
          description: null,
        };
      case "YELLOW":
        return {
          label: "Atencao — Risco de restricao",
          icon: <ShieldAlert size={28} />,
          bg: "bg-yellow-50 dark:bg-yellow-950",
          border: "border-yellow-300 dark:border-yellow-700",
          text: "text-yellow-700 dark:text-yellow-300",
          badgeBg: "bg-yellow-500",
          pulse: false,
          description: "Qualidade em queda. Reduza o volume de envios e verifique se contatos estao marcando como spam.",
        };
      case "RED":
        return {
          label: "CRITICO — Envios pausados automaticamente",
          icon: <ShieldAlert size={28} />,
          bg: "bg-red-50 dark:bg-red-950",
          border: "border-red-400 dark:border-red-700",
          text: "text-red-700 dark:text-red-300",
          badgeBg: "bg-red-500",
          pulse: true,
          description: "Todos os envios foram pausados automaticamente. Aguarde a qualidade melhorar antes de retomar.",
        };
      default:
        return {
          label: "Sem dados",
          icon: <Shield size={28} />,
          bg: "bg-gray-50 dark:bg-gray-800",
          border: "border-gray-200 dark:border-gray-700",
          text: "text-gray-500 dark:text-gray-400",
          badgeBg: "bg-gray-400",
          pulse: false,
          description: null,
        };
    }
  })();

  const usageColor =
    usagePct > 80 ? "bg-red-500" : usagePct > 50 ? "bg-yellow-500" : "bg-blue-500";
  const usageBorder =
    usagePct > 80
      ? "border-red-300 dark:border-red-700"
      : usagePct > 50
      ? "border-yellow-300 dark:border-yellow-700"
      : "border-blue-200 dark:border-blue-700";
  const usageBg =
    usagePct > 80
      ? "bg-red-50 dark:bg-red-950"
      : usagePct > 50
      ? "bg-yellow-50 dark:bg-yellow-950"
      : "bg-blue-50 dark:bg-blue-950";

  const tiers = [
    { key: "TIER_1", label: "Tier 1", limit: "250/dia" },
    { key: "TIER_2", label: "Tier 2", limit: "1.000/dia" },
    { key: "TIER_3", label: "Tier 3", limit: "10.000/dia" },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <Shield size={16} />
        Seguranca e Conformidade
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Quality Rating */}
        <div
          className={clsx(
            "rounded-xl border-2 p-4 flex flex-col gap-3",
            qualityInfo.bg,
            qualityInfo.border
          )}
        >
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-white",
                qualityInfo.badgeBg,
                qualityInfo.pulse && "animate-pulse"
              )}
            >
              {qualityInfo.icon}
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                Quality Rating
              </p>
              <p className={clsx("text-sm font-bold", qualityInfo.text)}>
                {quality || "---"}
              </p>
            </div>
          </div>
          <p className={clsx("text-xs font-semibold", qualityInfo.text)}>
            {qualityInfo.label}
          </p>
          {qualityInfo.description && (
            <p className="text-[11px] text-gray-600 dark:text-gray-400">
              {qualityInfo.description}
            </p>
          )}
        </div>

        {/* 24h Window */}
        <div className="rounded-xl border-2 border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
              <Clock size={22} />
            </div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
              Janela de 24h
            </p>
          </div>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            Mensagens de texto livre: apenas dentro de <strong>24h</strong> apos ultima msg do cliente.
          </p>
          <p className="text-[11px] text-blue-600 dark:text-blue-400">
            Fora da janela: obrigatorio usar template aprovado.
          </p>
        </div>

        {/* Daily Limit */}
        <div
          className={clsx(
            "rounded-xl border-2 p-4 flex flex-col gap-3",
            usageBg,
            usageBorder
          )}
        >
          <div className="flex items-center gap-2">
            <div className={clsx("w-10 h-10 rounded-full flex items-center justify-center text-white", usageColor)}>
              <TrendingUp size={22} />
            </div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
              Limite Diario
            </p>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {messagesSent} de {dailyLimit}
              </span>
              <span className="text-gray-500 dark:text-gray-400">{Math.round(usagePct)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className={clsx("h-2.5 rounded-full transition-all duration-300", usageColor)}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-600 dark:text-gray-400">
            {messagesSent} mensagens enviadas hoje de {dailyLimit} permitidas
          </p>
        </div>

        {/* Tier da Meta */}
        <div className="rounded-xl border-2 border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-950 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white">
              <Zap size={22} />
            </div>
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
              Tier da Meta
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {tiers.map((t) => (
              <div
                key={t.key}
                className={clsx(
                  "text-xs px-2 py-1 rounded-md",
                  tier?.toUpperCase() === t.key
                    ? "bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 font-bold"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                {t.label}: {t.limit}
                {tier?.toUpperCase() === t.key && " (atual)"}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Tier aumenta automaticamente com qualidade alta.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Best Practices
// ---------------------------------------------------------------------------

function BestPractices() {
  const [open, setOpen] = useState(false);

  const practices = [
    {
      icon: <Clock size={16} />,
      title: "Rate limit por contato",
      text: "Maximo 1 mensagem a cada 6 segundos para o mesmo numero.",
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950",
    },
    {
      icon: <Ban size={16} />,
      title: "Opt-out automatico",
      text: "Quando um contato enviar SAIR, STOP ou PARAR, o sistema para de enviar automaticamente.",
      color: "text-orange-600 bg-orange-50 dark:bg-orange-950",
    },
    {
      icon: <AlertTriangle size={16} />,
      title: "Templates Marketing",
      text: "Precisam de metodo de pagamento configurado na Meta Business.",
      color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950",
    },
    {
      icon: <Info size={16} />,
      title: "Quality Score",
      text: "Baseado nos ultimos 7 dias. Se muitos contatos marcarem como spam, o score cai.",
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950",
    },
    {
      icon: <ShieldAlert size={16} />,
      title: "Envio RED",
      text: "Se quality chegar a RED, todos os envios sao pausados automaticamente ate melhorar.",
      color: "text-red-600 bg-red-50 dark:bg-red-950",
    },
  ];

  return (
    <Card padding="lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600" />
          Boas Praticas
        </h2>
        {open ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {practices.map((p, i) => (
            <div
              key={i}
              className={clsx(
                "rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-start gap-3",
                p.color.split(" ").slice(1).join(" ")
              )}
            >
              <div className={clsx("mt-0.5 flex-shrink-0", p.color.split(" ")[0])}>
                {p.icon}
              </div>
              <div>
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{p.title}</p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {p.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Daily Limit Card (standalone)
// ---------------------------------------------------------------------------

function DailyLimitCard({
  config,
  status,
}: {
  config: WabaConfig | null;
  status: WabaStatus | null;
}) {
  const tier = status?.phone?.messagingTier ?? null;
  const tierMax = tierMaxMessages(tier);
  const configuredLimit = config?.dailyMessageLimit ?? 250;
  const overTier = configuredLimit > tierMax;

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <TrendingUp size={16} />
        Limite Diario de Mensagens
      </h2>

      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {configuredLimit}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Configurado</p>
        </div>
        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-purple-600">
            {tierMax.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Maximo do {tierLabel(tier)}
          </p>
        </div>
      </div>

      {overTier && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3">
          <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">
            O limite configurado ({configuredLimit}) excede o maximo do seu tier ({tierMax}).
            O Meta ira bloquear mensagens acima do limite do tier.
          </p>
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
        <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Recomendamos comecar conservador (250) e aumentar gradualmente conforme a qualidade se mantem alta.
          Altere o valor na secao de Credenciais abaixo.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Spend Limit Card
// ---------------------------------------------------------------------------

function SpendLimitCard({ status }: { status: WabaStatus | null }) {
  const spend = status?.spend;
  if (!spend) return null;

  const automationCost = spend.automationCost ?? spend.totalCost;
  const pct = spend.limitBRL > 0 ? Math.min((automationCost / spend.limitBRL) * 100, 100) : 0;
  const barColor = spend.exceeded
    ? "bg-red-500"
    : pct > 80
    ? "bg-yellow-500"
    : "bg-emerald-500";
  const borderColor = spend.exceeded
    ? "border-red-300 dark:border-red-700"
    : pct > 80
    ? "border-yellow-300 dark:border-yellow-700"
    : "border-emerald-200 dark:border-emerald-700";
  const bgColor = spend.exceeded
    ? "bg-red-50 dark:bg-red-950"
    : pct > 80
    ? "bg-yellow-50 dark:bg-yellow-950"
    : "bg-emerald-50 dark:bg-emerald-950";

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <span className="text-base">R$</span>
        Gasto Diario WABA
      </h2>

      {spend.exceeded && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-600 text-white px-4 py-3 animate-pulse">
          <AlertTriangle size={20} />
          <div>
            <p className="text-sm font-bold">AUTOMACOES CONGELADAS</p>
            <p className="text-xs opacity-90">
              Limite de R${spend.limitBRL.toFixed(2)} de automacoes atingido. Cadencias e follow-ups pausados. Broadcasts e BIA continuam.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-end gap-6 flex-wrap mb-4">
        <div>
          <p className={clsx(
            "text-3xl font-bold",
            spend.exceeded ? "text-red-600" : "text-gray-900 dark:text-gray-100"
          )}>
            R${(spend.automationCost ?? spend.totalCost).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">automacoes hoje</p>
        </div>
        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-2xl font-bold text-emerald-600">
            R${spend.limitBRL > 0 ? spend.limitBRL.toFixed(2) : "∞"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">limite automacoes</p>
        </div>
        <div className="h-10 w-px bg-gray-200 dark:bg-gray-700" />
        <div>
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            R${spend.remaining === Infinity ? "∞" : spend.remaining.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">restante</p>
        </div>
      </div>

      {spend.limitBRL > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-400">{Math.round(pct)}% do limite de automacoes</span>
            <span className="text-gray-500 dark:text-gray-400">
              R${(spend.automationCost ?? spend.totalCost).toFixed(2)} / R${spend.limitBRL.toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div
              className={clsx("h-3 rounded-full transition-all duration-500", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={clsx("rounded-lg border p-3", bgColor, borderColor)}>
          <p className="text-xs text-gray-500 dark:text-gray-400">Automacoes (cadencias, follow-ups)</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {(spend.automationMarketingCount ?? 0) + (spend.automationUtilityCount ?? 0)} msgs
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            R${(spend.automationCost ?? spend.totalCost).toFixed(2)} — conta no limite
          </p>
        </div>
        <div className="rounded-lg border p-3 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Broadcasts (envio em massa)</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {(spend.broadcastMarketingCount ?? 0) + (spend.broadcastUtilityCount ?? 0)} msgs
          </p>
          <p className="text-[11px] text-blue-600 dark:text-blue-400">
            R${(spend.broadcastCost ?? 0).toFixed(2)} — fora do limite
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Gasto total do dia: R${spend.totalCost.toFixed(2)} (automacoes + broadcasts)
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3">
        <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          O limite de R${spend.limitBRL > 0 ? spend.limitBRL.toFixed(2) : "∞"} se aplica apenas a automacoes (cadencias, follow-ups, lembretes).
          Broadcasts e a BIA funcionam independente desse limite.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status Card
// ---------------------------------------------------------------------------

function StatusCard({
  status,
  loading,
  onRefresh,
  lastFetched,
}: {
  status: WabaStatus | null;
  loading: boolean;
  onRefresh: () => void;
  lastFetched: Date | null;
}) {
  if (loading || !status) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const conn = connectionVariant(status.phone?.status ?? null, status.configured);
  const quality = status.phone?.qualityRating ?? null;
  const isRed = quality?.toUpperCase() === "RED";
  const tier = status.phone?.messagingTier ?? "---";
  const { messagesSent, dailyLimit, remaining } = status.today;
  const usagePct = dailyLimit > 0 ? Math.min((messagesSent / dailyLimit) * 100, 100) : 0;

  return (
    <Card padding="lg">
      {/* RED quality banner */}
      {isRed && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-600 text-white px-4 py-3 animate-pulse">
          <ShieldAlert size={20} />
          <div>
            <p className="text-sm font-bold">ENVIOS PAUSADOS</p>
            <p className="text-xs opacity-90">
              Quality rating RED — todos os envios foram pausados automaticamente ate a qualidade melhorar.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Status do Canal</h2>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="text-[10px] text-gray-400">
              Ultimo check: {lastFetched.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw size={14} className={clsx(loading && "animate-spin")} />
            <span className="ml-1 text-xs">Atualizar</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Phone */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
            <Phone size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Telefone</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {status.phone?.displayPhone || "Nao configurado"}
            </p>
          </div>
        </div>

        {/* Connection */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            conn.variant === "green" ? "bg-green-50 dark:bg-green-950 text-green-600" :
            conn.variant === "yellow" ? "bg-yellow-50 dark:bg-yellow-950 text-yellow-600" :
            conn.variant === "red" ? "bg-red-50 dark:bg-red-950 text-red-600" :
            "bg-gray-50 dark:bg-gray-800 text-gray-400"
          )}>
            {conn.variant === "green" ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Conexao</p>
            <Badge variant={conn.variant}>{conn.label}</Badge>
          </div>
        </div>

        {/* Quality — enhanced with background color & pulse */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            qualityColor(quality) === "green" ? "bg-green-500 text-white" :
            qualityColor(quality) === "yellow" ? "bg-yellow-500 text-white" :
            qualityColor(quality) === "red" ? "bg-red-500 text-white animate-pulse" :
            "bg-gray-50 dark:bg-gray-800 text-gray-400"
          )}>
            {qualityColor(quality) === "green" ? <ShieldCheck size={18} /> :
             qualityColor(quality) === "red" ? <ShieldAlert size={18} /> :
             <Shield size={18} />}
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Qualidade</p>
            <span className={clsx(
              "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full",
              qualityColor(quality) === "green" ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300" :
              qualityColor(quality) === "yellow" ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300" :
              qualityColor(quality) === "red" ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 animate-pulse" :
              "bg-gray-100 dark:bg-gray-800 text-gray-500"
            )}>
              {quality || "---"}
            </span>
          </div>
        </div>

        {/* Tier */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 flex items-center justify-center">
            <Zap size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Tier</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tierLabel(tier === "---" ? null : tier)}</p>
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Uso hoje</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {messagesSent}/{dailyLimit} enviados &middot; {remaining} restantes
          </p>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
          <div
            className={clsx(
              "h-2.5 rounded-full transition-all duration-300",
              usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-yellow-500" : "bg-blue-500"
            )}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Credentials Form
// ---------------------------------------------------------------------------

function CredentialsForm({
  config,
  onSaved,
}: {
  config: WabaConfig | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    accessToken: "",
    appSecret: "",
    verifyToken: "",
    displayPhone: "",
    dailyMessageLimit: 250,
    dailySpendLimitBRL: 40,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        accessToken: config.accessToken || "",
        appSecret: config.appSecret || "",
        verifyToken: config.verifyToken || "",
        displayPhone: config.displayPhone || "",
        dailyMessageLimit: config.dailyMessageLimit || 250,
        dailySpendLimitBRL: config.dailySpendLimitBRL ?? 40,
      });
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.put("/whatsapp/cloud/config", form);
      setFeedback({ type: "success", text: "Configuracao salva com sucesso!" });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Credenciais</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Read-only fields */}
        <Input
          label="Phone Number ID"
          value={mask(config?.phoneNumberId ?? null)}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />
        <Input
          label="WABA ID"
          value={mask(config?.wabaId ?? null)}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />

        {/* Access Token */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Access Token</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-10"
              placeholder="EAA..."
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* App Secret */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">App Secret</label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={form.appSecret}
              onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-10"
              placeholder="****"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Verify Token */}
        <Input
          label="Verify Token"
          value={form.verifyToken}
          onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
          placeholder="Token de verificacao do webhook"
        />

        {/* Webhook URL */}
        <Input
          label="Webhook URL"
          value={config?.webhookUrl || "Nao configurado"}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />

        {/* Display Phone */}
        <Input
          label="Telefone de Exibicao"
          value={form.displayPhone}
          onChange={(e) => setForm((f) => ({ ...f, displayPhone: e.target.value }))}
          placeholder="+55 11 99999-9999"
        />

        {/* Daily Limit */}
        <Input
          label="Limite Diario de Mensagens"
          type="number"
          value={String(form.dailyMessageLimit)}
          onChange={(e) =>
            setForm((f) => ({ ...f, dailyMessageLimit: parseInt(e.target.value) || 0 }))
          }
          placeholder="250"
        />

        {/* Daily Spend Limit */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Limite Diario de Gasto (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.dailySpendLimitBRL}
            onChange={(e) =>
              setForm((f) => ({ ...f, dailySpendLimitBRL: parseFloat(e.target.value) || 0 }))
            }
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100"
            placeholder="40.00"
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            0 = sem limite. Ao atingir, automacoes sao congeladas (BIA continua ativa).
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5">
        {feedback && (
          <span
            className={clsx(
              "text-xs",
              feedback.type === "success" ? "text-green-600" : "text-red-600"
            )}
          >
            {feedback.text}
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} />
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active Channel Toggle
// ---------------------------------------------------------------------------

function ChannelToggle({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: (active: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    const next = !isActive;
    if (
      next &&
      !confirm(
        "Ativar a Cloud API direcionara todas as novas mensagens pela API oficial da Meta. Deseja continuar?"
      )
    ) {
      return;
    }
    setToggling(true);
    try {
      await api.put("/whatsapp/cloud/config", { isActive: next });
      onToggle(next);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
            )}
          >
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Canal ativo: {isActive ? "Cloud API" : "Z-API"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
              {isActive
                ? "Todas as mensagens estao sendo enviadas pela API oficial da Meta."
                : "Ative para direcionar novas mensagens pela Cloud API oficial."}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={toggling}
          className={clsx(
            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50",
            isActive ? "bg-green-500" : "bg-gray-300"
          )}
        >
          <span
            className={clsx(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              isActive ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {!isActive && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">
            A Cloud API nao esta ativa. As mensagens continuam sendo enviadas pela Z-API.
            Ative para migrar para a API oficial da Meta.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WabaConfigPage() {
  const [config, setConfig] = useState<WabaConfig | null>(null);
  const [status, setStatus] = useState<WabaStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await api.get<{ data: WabaConfig }>("/whatsapp/cloud/config");
      setConfig(res.data);
    } catch {
      setError("Erro ao carregar configuracao.");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await api.get<{ data: WabaStatus }>("/whatsapp/cloud/config/status");
      setStatus(res.data);
      setLastFetched(new Date());
    } catch {
      // Status might not be available if not configured — not critical
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchStatus();
  }, [fetchConfig, fetchStatus]);

  const handleSaved = () => {
    fetchConfig();
    fetchStatus();
  };

  const handleToggle = (active: boolean) => {
    setConfig((c) => (c ? { ...c, isActive: active } : c));
    setStatus((s) => (s ? { ...s, isActive: active } : s));
  };

  if (loadingConfig && loadingStatus) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="p-6">
        <Card padding="lg">
          <div className="text-center py-8">
            <AlertTriangle size={40} className="mx-auto text-red-300 mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={fetchConfig}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto flex-1">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuracao Cloud API</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gerencie credenciais e status do canal WhatsApp Business API
        </p>
      </div>

      <SecurityDashboard status={status} loading={loadingStatus} />

      <StatusCard
        status={status}
        loading={loadingStatus}
        onRefresh={fetchStatus}
        lastFetched={lastFetched}
      />

      <BestPractices />

      <SpendLimitCard status={status} />

      <DailyLimitCard config={config} status={status} />

      <ChannelToggle
        isActive={config?.isActive ?? false}
        onToggle={handleToggle}
      />

      <CredentialsForm config={config} onSaved={handleSaved} />
    </div>
  );
}
