"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import {
  RefreshCw,
  Wifi,
  WifiOff,
  BarChart3,
  Flame,
  Send,
  Shield,
  Clock,
  TrendingUp,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface StatusData {
  instance: {
    status: string;
    phone: string;
  };
  daily: {
    limit: number;
    used: number;
    remaining: number;
    usedPercent: number;
    breakdown: {
      campaign: number;
      followUp: number;
      reminder: number;
    };
    resetsAt: string;
  };
  warmup: {
    enabled: boolean;
    startDate: string | null;
    currentDay: number | null;
    currentLimit: number | null;
    phase: string | null;
    completedAt: string | null;
  };
  campaigns: {
    running: number;
    paused: number;
    completed: number;
    total: number;
    last7days: number;
  };
  volumeHistory: Array<{
    date: string;
    total: number;
    campaign: number;
    followUp: number;
    reminder: number;
  }>;
  followUps: {
    pending: number;
    sentToday: number;
  };
  protections: {
    businessHours: boolean;
    dailyLimit: boolean;
    warmupActive: boolean;
    optOutEnabled: boolean;
    circuitBreaker: boolean;
    randomDelay: boolean;
  };
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function progressColor(percent: number): string {
  if (percent > 90) return "bg-red-500";
  if (percent > 70) return "bg-yellow-500";
  return "bg-green-500";
}

function progressBg(percent: number): string {
  if (percent > 90) return "bg-red-100";
  if (percent > 70) return "bg-yellow-100";
  return "bg-green-100";
}

function statusColor(status: string): string {
  switch (status) {
    case "CONNECTED":
      return "text-green-600 bg-green-50";
    case "CONNECTING":
      return "text-yellow-600 bg-yellow-50";
    default:
      return "text-red-600 bg-red-50";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "CONNECTED":
      return "Conectado";
    case "CONNECTING":
      return "Conectando...";
    default:
      return "Desconectado";
  }
}

// ─────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────

export default function WhatsAppStatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const result = await api.get<StatusData>("/whatsapp/status");
      setData(result);
      setError(null);
      setLastUpdate(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch {
      setError("Erro ao carregar status. Tente novamente.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(() => fetchStatus(), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // ── Loading skeleton ────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Conversas" breadcrumb={["Conversas", "Status"]} />
        <ConversasNav />
        <main className="flex-1 p-4 sm:p-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} padding="md">
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-20 bg-gray-200 rounded" />
                    <div className="h-8 w-24 bg-gray-200 rounded" />
                    <div className="h-3 w-16 bg-gray-100 rounded" />
                  </div>
                </Card>
              ))}
            </div>
            {[1, 2, 3].map((i) => (
              <Card key={i} padding="md">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-40 bg-gray-200 rounded" />
                  <div className="h-24 bg-gray-100 rounded" />
                </div>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Max for chart scaling ──────────────────────────────────────────────

  const maxVolume = data
    ? Math.max(...data.volumeHistory.map((v) => v.total), 1)
    : 1;

  // ── Protection badges ─────────────────────────────────────────────────

  const protectionItems = data
    ? [
        { label: "Horario Comercial", active: data.protections.businessHours },
        { label: "Limite Diario", active: data.protections.dailyLimit },
        { label: "Warmup", active: data.protections.warmupActive },
        { label: "Opt-out", active: data.protections.optOutEnabled },
        { label: "Circuit Breaker", active: data.protections.circuitBreaker },
        { label: "Delay Aleatorio", active: data.protections.randomDelay },
      ]
    : [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Conversas" breadcrumb={["Conversas", "Status"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => fetchStatus(true)}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* ── Header row ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Status WhatsApp
          </h2>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-xs text-gray-400">
                Atualizado as {lastUpdate}
              </span>
            )}
            <button
              onClick={() => fetchStatus(true)}
              disabled={refreshing}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                refreshing
                  ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              )}
            >
              <RefreshCw
                size={14}
                className={clsx(refreshing && "animate-spin")}
              />
              Atualizar
            </button>
          </div>
        </div>

        {data && (
          <>
            {/* ── Top 4 metric cards ────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Instance */}
              <Card padding="md">
                <div className="flex items-center gap-4">
                  <div
                    className={clsx(
                      "p-3 rounded-xl",
                      statusColor(data.instance.status)
                    )}
                  >
                    {data.instance.status === "CONNECTED" ? (
                      <Wifi size={22} />
                    ) : (
                      <WifiOff size={22} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Instancia</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {statusLabel(data.instance.status)}
                    </p>
                    {data.instance.phone && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {data.instance.phone}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Daily usage */}
              <Card padding="md">
                <div className="flex items-center gap-4">
                  <div
                    className={clsx(
                      "p-3 rounded-xl",
                      data.daily.usedPercent > 90
                        ? "bg-red-50 text-red-600"
                        : data.daily.usedPercent > 70
                          ? "bg-yellow-50 text-yellow-600"
                          : "bg-blue-50 text-blue-600"
                    )}
                  >
                    <BarChart3 size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Uso Diario</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {data.daily.used}
                      <span className="text-sm font-normal text-gray-400">
                        /{data.daily.limit}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {data.daily.remaining} restantes
                    </p>
                  </div>
                </div>
              </Card>

              {/* Warmup */}
              <Card padding="md">
                <div className="flex items-center gap-4">
                  <div
                    className={clsx(
                      "p-3 rounded-xl",
                      data.warmup.enabled
                        ? "bg-orange-50 text-orange-600"
                        : "bg-gray-100 text-gray-400"
                    )}
                  >
                    <Flame size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Warmup</p>
                    {data.warmup.enabled && data.warmup.currentDay ? (
                      <>
                        <p className="text-lg font-semibold text-gray-900">
                          Dia {data.warmup.currentDay}
                          <span className="text-sm font-normal text-gray-400">
                            /30
                          </span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Limite: {data.warmup.currentLimit}/dia
                        </p>
                      </>
                    ) : (
                      <p className="text-lg font-semibold text-gray-900">
                        {data.warmup.enabled ? "Ativo" : "Inativo"}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Campaigns */}
              <Card padding="md">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-cyan-50 text-cyan-600">
                    <Send size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Campanhas</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {data.campaigns.running}
                      <span className="text-sm font-normal text-gray-400">
                        {" "}
                        rodando
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {data.campaigns.total} total &middot;{" "}
                      {data.campaigns.last7days} esta semana
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Daily usage detail card ───────────────────────────────── */}
            <Card padding="md">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Uso Diario Detalhado
                </h3>
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">
                    {data.daily.used} de {data.daily.limit} mensagens
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-semibold",
                      data.daily.usedPercent > 90
                        ? "text-red-600"
                        : data.daily.usedPercent > 70
                          ? "text-yellow-600"
                          : "text-green-600"
                    )}
                  >
                    {data.daily.usedPercent}%
                  </span>
                </div>
                <div
                  className={clsx(
                    "w-full h-3 rounded-full overflow-hidden",
                    progressBg(data.daily.usedPercent)
                  )}
                >
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-700 ease-out",
                      progressColor(data.daily.usedPercent)
                    )}
                    style={{ width: `${Math.min(data.daily.usedPercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Reseta as {data.daily.resetsAt}
                </p>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-xl font-semibold text-blue-700">
                    {data.daily.breakdown.campaign}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">Campanhas</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xl font-semibold text-green-700">
                    {data.daily.breakdown.followUp}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">Follow-ups</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <p className="text-xl font-semibold text-purple-700">
                    {data.daily.breakdown.reminder}
                  </p>
                  <p className="text-xs text-purple-600 mt-0.5">Lembretes</p>
                </div>
              </div>
            </Card>

            {/* ── Volume history chart ─────────────────────────────────── */}
            <Card padding="md">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Volume dos Ultimos 7 Dias
                </h3>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-blue-500" />
                  <span className="text-xs text-gray-500">Campanhas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-green-500" />
                  <span className="text-xs text-gray-500">Follow-ups</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-purple-500" />
                  <span className="text-xs text-gray-500">Lembretes</span>
                </div>
              </div>

              {/* Bars */}
              <div className="flex items-end gap-2 h-40">
                {data.volumeHistory.map((day) => {
                  const campaignH =
                    maxVolume > 0 ? (day.campaign / maxVolume) * 100 : 0;
                  const followUpH =
                    maxVolume > 0 ? (day.followUp / maxVolume) * 100 : 0;
                  const reminderH =
                    maxVolume > 0 ? (day.reminder / maxVolume) * 100 : 0;

                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      {/* Stacked bar container */}
                      <div className="w-full flex flex-col-reverse items-stretch h-[128px] relative">
                        {/* Campaign (bottom) */}
                        <div
                          className="bg-blue-500 rounded-t-sm transition-all duration-500 ease-out"
                          style={{
                            height: `${campaignH}%`,
                            minHeight: day.campaign > 0 ? "2px" : "0",
                          }}
                          title={`Campanhas: ${day.campaign}`}
                        />
                        {/* FollowUp (middle) */}
                        <div
                          className="bg-green-500 transition-all duration-500 ease-out"
                          style={{
                            height: `${followUpH}%`,
                            minHeight: day.followUp > 0 ? "2px" : "0",
                          }}
                          title={`Follow-ups: ${day.followUp}`}
                        />
                        {/* Reminder (top) */}
                        <div
                          className="bg-purple-500 rounded-t-sm transition-all duration-500 ease-out"
                          style={{
                            height: `${reminderH}%`,
                            minHeight: day.reminder > 0 ? "2px" : "0",
                          }}
                          title={`Lembretes: ${day.reminder}`}
                        />
                      </div>
                      {/* Total label */}
                      <span className="text-[10px] text-gray-500 font-medium">
                        {day.total}
                      </span>
                      {/* Date label */}
                      <span className="text-[10px] text-gray-400">
                        {day.date}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ── Warmup detail + Follow-ups row ───────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Warmup */}
              <Card padding="md">
                <div className="flex items-center gap-2 mb-4">
                  <Flame size={16} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Warmup
                  </h3>
                </div>

                {data.warmup.enabled && data.warmup.currentDay ? (
                  <div className="space-y-4">
                    {/* Progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-gray-500">
                          Dia {data.warmup.currentDay} de 30
                        </span>
                        <span className="text-xs font-medium text-orange-600">
                          {Math.round((data.warmup.currentDay / 30) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-orange-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.min(
                              (data.warmup.currentDay / 30) * 100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Phase */}
                    <div className="p-3 bg-orange-50 rounded-lg">
                      <p className="text-sm font-medium text-orange-800">
                        {data.warmup.phase}
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        Limite atual: {data.warmup.currentLimit} msgs/dia
                      </p>
                    </div>

                    {/* Completion date */}
                    {data.warmup.completedAt && (
                      <p className="text-xs text-gray-400">
                        Conclusao prevista:{" "}
                        {new Date(data.warmup.completedAt).toLocaleDateString(
                          "pt-BR"
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Flame
                      size={32}
                      className="mx-auto text-gray-300 mb-2"
                    />
                    <p className="text-sm text-gray-500">
                      {data.warmup.enabled
                        ? "Warmup ativo, aguardando inicio"
                        : "Warmup desativado"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ative nas configuracoes para aquecer o numero gradualmente
                    </p>
                  </div>
                )}
              </Card>

              {/* Follow-ups */}
              <Card padding="md">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-gray-500" />
                  <h3 className="text-sm font-semibold text-gray-900">
                    Follow-ups
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-yellow-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-yellow-700">
                      {data.followUps.pending}
                    </p>
                    <p className="text-xs text-yellow-600 mt-1">Agendados</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-3xl font-bold text-green-700">
                      {data.followUps.sentToday}
                    </p>
                    <p className="text-xs text-green-600 mt-1">Enviados hoje</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* ── Protections ──────────────────────────────────────────── */}
            <Card padding="md">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Protecoes Ativas
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {protectionItems.map((item) => (
                  <div
                    key={item.label}
                    className={clsx(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      item.active
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-gray-50 text-gray-400 border border-gray-200"
                    )}
                  >
                    <span className="flex-shrink-0">
                      {item.active ? "\u2705" : "\u26A0\uFE0F"}
                    </span>
                    <span className="text-xs leading-tight">{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
