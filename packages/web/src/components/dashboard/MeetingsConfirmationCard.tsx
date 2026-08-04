"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import { Calendar, CalendarDays, CheckCircle, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface FunilSummary {
  pipelineId: string;
  pipelineName: string;
  total: number;
  confirmed: number;
  pending: number;
  declined: number;
  canceled: number;
}

interface SummaryMeeting {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  confirmationStatus: "PENDING" | "CONFIRMED" | "DECLINED";
  confirmedByName: string | null;
  name: string;
  phone: string | null;
  dealId: string | null;
  pipelineId: string;
  pipelineName: string;
  ownerName: string | null;
  closerName: string | null;
}

interface SummaryResponse {
  data: {
    funis: FunilSummary[];
    meetings: SummaryMeeting[];
  };
}

/** Funis fixos da operação, sempre lado a lado nessa ordem. */
const FUNIL_ORDER = ["Controladoria", "BI"];

/**
 * Controle de reuniões do dia no Início: uma lista por funil (Controladoria e
 * BI lado a lado) com confirmação em um clique; total só no badge do título.
 * Reuniões sem funil vinculado ficam de fora.
 */
export default function MeetingsConfirmationCard() {
  const router = useRouter();
  const [funis, setFunis] = useState<FunilSummary[]>([]);
  const [meetings, setMeetings] = useState<SummaryMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [range, setRange] = useState<"today" | "week">("today");

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get<SummaryResponse>(
        `/calendly/config/meetings/confirmation-summary?range=${range}`
      );
      setFunis(res.data?.funis || []);
      setMeetings(res.data?.meetings || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    setLoading(true);
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const toggleConfirmation = async (m: SummaryMeeting) => {
    if (togglingId) return;
    setTogglingId(m.id);
    try {
      const next = m.confirmationStatus === "CONFIRMED" ? "PENDING" : "CONFIRMED";
      await api.patch(`/calendly/config/meetings/${m.id}/confirmation`, { status: next });
      await fetchSummary();
    } catch (err) {
      console.error("Erro ao confirmar reunião:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const fmtTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const visibleFunis = funis.filter((f) => f.pipelineId !== "none");
  const visibleMeetings = meetings.filter((m) => m.pipelineId !== "none");
  const totalActive = visibleFunis.reduce((s, f) => s + f.total, 0);
  const totalConfirmed = visibleFunis.reduce((s, f) => s + f.confirmed, 0);
  const totalCanceled = visibleFunis.reduce((s, f) => s + f.canceled, 0);
  const totalMeetings = totalActive + totalCanceled;

  // Controladoria e BI sempre presentes (mesmo zeradas); outros funis entram depois se tiverem reunião
  const columns = [
    ...FUNIL_ORDER.map(
      (name) =>
        visibleFunis.find((f) => f.pipelineName === name) ?? {
          pipelineId: name,
          pipelineName: name,
          total: 0,
          confirmed: 0,
          pending: 0,
          declined: 0,
          canceled: 0,
        }
    ),
    ...visibleFunis.filter((f) => !FUNIL_ORDER.includes(f.pipelineName)),
  ];

  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Calendar size={16} className="text-petrol-600" />
            {range === "today" ? "Reuniões de hoje" : "Reuniões da semana"}
            {totalMeetings > 0 && (
              <span className="flex items-center gap-1">
                <span
                  className={clsx(
                    "flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full",
                    totalCanceled > 0 ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"
                  )}
                  title="Canceladas"
                >
                  <XCircle size={12} /> {totalCanceled}{" "}
                  <span className="font-medium hidden sm:inline">canceladas</span>
                </span>
                <span
                  className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-petrol-50 text-petrol-700"
                  title="Total de reuniões"
                >
                  <CalendarDays size={12} /> {totalMeetings}{" "}
                  <span className="font-medium hidden sm:inline">reuniões</span>
                </span>
                <span
                  className={clsx(
                    "flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full",
                    totalActive > 0 && totalConfirmed === totalActive
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  )}
                  title="Confirmadas"
                >
                  <CheckCircle size={12} /> {totalConfirmed}{" "}
                  <span className="font-medium hidden sm:inline">confirmadas</span>
                </span>
              </span>
            )}
          </span>
        </CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(
              [
                { key: "today", label: "Hoje" },
                { key: "week", label: "Essa semana" },
              ] as const
            ).map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={clsx(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  range === r.key ? "bg-white text-petrol-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Link href="/central" className="text-xs text-petrol-600 hover:underline">
            Abrir central
          </Link>
        </div>
      </CardHeader>

      {loading ? (
        <div className="space-y-2 mt-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : visibleMeetings.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          {range === "today" ? "Nenhuma reunião hoje" : "Nenhuma reunião essa semana"}
        </p>
      ) : (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {columns.map((f) => {
            const funilMeetings = visibleMeetings.filter((m) => m.pipelineId === f.pipelineId);
            return (
              <div key={f.pipelineId} className="min-w-0">
                <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                    {f.pipelineName}
                  </p>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className={clsx(
                        "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        f.canceled > 0 ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-400"
                      )}
                      title="Canceladas"
                    >
                      <XCircle size={11} /> {f.canceled}
                    </span>
                    <span
                      className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-petrol-50 text-petrol-700"
                      title="Total de reuniões"
                    >
                      <CalendarDays size={11} /> {f.total + f.canceled}
                    </span>
                    <span
                      className={clsx(
                        "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        f.total > 0 && f.confirmed === f.total
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                      title="Confirmadas"
                    >
                      <CheckCircle size={11} /> {f.confirmed}
                    </span>
                  </span>
                </div>
                {funilMeetings.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Nenhuma reunião</p>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto overflow-x-hidden">
                    {funilMeetings.map((m) => {
                      const canceled = m.status === "canceled";
                      return (
                        <div
                          key={m.id}
                          onClick={() => m.dealId && router.push(`/pipeline/${m.dealId}`)}
                          onMouseDown={(e) => {
                            if (e.button === 1 && m.dealId) {
                              e.preventDefault();
                              window.open(`/pipeline/${m.dealId}`, "_blank");
                            }
                          }}
                          className={clsx(
                            "py-2 px-1 flex items-center gap-3 min-w-0",
                            m.dealId && "cursor-pointer hover:bg-gray-50 rounded transition-colors"
                          )}
                          title={m.dealId ? "Abrir negociação" : undefined}
                        >
                          <div className="w-12 flex-shrink-0 text-left">
                            {range === "week" && (
                              <p className="text-[10px] font-medium text-gray-400 uppercase leading-tight">
                                {new Date(m.startTime).toLocaleDateString("pt-BR", {
                                  weekday: "short",
                                  day: "2-digit",
                                })}
                              </p>
                            )}
                            <p
                              className={clsx(
                                "text-sm font-bold leading-tight",
                                canceled ? "text-gray-400 line-through" : "text-gray-900"
                              )}
                            >
                              {fmtTime(m.startTime)}
                            </p>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={clsx(
                                "text-sm truncate",
                                canceled ? "text-gray-400 line-through" : "text-gray-800"
                              )}
                            >
                              {m.name}
                            </p>
                            {(m.ownerName || m.closerName) && (
                              <p className="text-[11px] text-gray-400 flex items-center gap-1.5 min-w-0 overflow-hidden">
                                {m.ownerName && <span className="truncate">{m.ownerName}</span>}
                                {m.closerName && (
                                  <span
                                    className="font-semibold text-petrol-700 bg-petrol-50 px-1.5 py-px rounded-full flex-shrink-0 whitespace-nowrap"
                                    title="Closer — quem vai fazer a reunião"
                                  >
                                    ▸ {m.closerName}
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                          {canceled ? (
                            <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                              Cancelada
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleConfirmation(m);
                              }}
                              disabled={togglingId === m.id}
                              title={
                                m.confirmationStatus === "CONFIRMED"
                                  ? `Confirmada${m.confirmedByName ? ` por ${m.confirmedByName}` : ""} — clique pra desfazer`
                                  : m.confirmationStatus === "DECLINED"
                                    ? "Lead avisou que não vem"
                                    : "Marcar como confirmada"
                              }
                              className={clsx(
                                "text-[10px] font-medium px-2 py-1 rounded-full flex-shrink-0 transition-colors disabled:opacity-50",
                                m.confirmationStatus === "CONFIRMED"
                                  ? "bg-green-500 text-white hover:bg-green-600"
                                  : m.confirmationStatus === "DECLINED"
                                    ? "bg-red-100 text-red-600 hover:bg-red-200"
                                    : "bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-700"
                              )}
                            >
                              {m.confirmationStatus === "CONFIRMED"
                                ? "✓ Confirmada"
                                : m.confirmationStatus === "DECLINED"
                                  ? "✗ Não vem"
                                  : "Confirmar"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
