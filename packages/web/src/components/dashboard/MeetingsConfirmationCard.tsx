"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Calendar,
  CalendarDays,
  CalendarClock,
  CheckCircle,
  XCircle,
  UserX,
  Ban,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface FunilSummary {
  pipelineId: string;
  pipelineName: string;
  total: number;
  confirmed: number;
  pending: number;
  declined: number;
  noShow: number;
  rescheduled: number;
  canceled: number;
}

interface SummaryMeeting {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  confirmationStatus: "PENDING" | "CONFIRMED" | "DECLINED" | "NO_SHOW";
  confirmedByName: string | null;
  rescheduledAt: string | null;
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

/** Converte um ISO em valor pra <input type="datetime-local"> no fuso local. */
const toLocalInput = (dateStr: string) => {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Trio de chips cancelada / reuniões / confirmadas (topo e por funil). */
function StatusChips({
  canceled,
  total,
  confirmed,
  noShow,
  rescheduled,
  size = "md",
}: {
  canceled: number;
  total: number;
  confirmed: number;
  noShow: number;
  rescheduled: number;
  size?: "md" | "sm";
}) {
  const base = clsx(
    "flex items-center gap-1 font-bold rounded-full",
    size === "md" ? "text-[11px] px-2 py-0.5" : "text-[10px] px-1.5 py-0.5"
  );
  const iconSize = size === "md" ? 12 : 11;
  return (
    <span className="flex items-center gap-1 flex-wrap">
      <span className={clsx(base, "bg-petrol-50 text-petrol-700")} title="Total de reuniões">
        <CalendarDays size={iconSize} /> {total} <span className="font-medium">reuniões</span>
      </span>
      <span className={clsx(base, "bg-green-100 text-green-700")} title="Confirmadas">
        <CheckCircle size={iconSize} /> {confirmed} <span className="font-medium">confirmadas</span>
      </span>
      <span className={clsx(base, "bg-blue-50 text-blue-600")} title="Reagendadas">
        <CalendarClock size={iconSize} /> {rescheduled} <span className="font-medium">reagendadas</span>
      </span>
      <span className={clsx(base, "bg-orange-50 text-orange-600")} title="No-show (não compareceu)">
        <UserX size={iconSize} /> {noShow} <span className="font-medium">no-show</span>
      </span>
      <span className={clsx(base, "bg-red-50 text-red-600")} title="Canceladas">
        <XCircle size={iconSize} /> {canceled} <span className="font-medium">canceladas</span>
      </span>
    </span>
  );
}

/**
 * Controle de reuniões do dia no Início: uma lista por funil (Controladoria e
 * BI lado a lado) com confirmação, cancelamento, reagendamento e no-show em
 * um clique; totais no topo e por funil. Reuniões sem funil ficam de fora.
 */
export default function MeetingsConfirmationCard() {
  const router = useRouter();
  const [funis, setFunis] = useState<FunilSummary[]>([]);
  const [meetings, setMeetings] = useState<SummaryMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
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

  const patchMeeting = async (id: string, path: string, body: unknown) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await api.patch(`/calendly/config/meetings/${id}/${path}`, body);
      await fetchSummary();
    } catch (err) {
      console.error("Erro ao atualizar reunião:", err);
    } finally {
      setBusyId(null);
    }
  };

  const setConfirmation = (m: SummaryMeeting, status: SummaryMeeting["confirmationStatus"]) =>
    patchMeeting(m.id, "confirmation", { status });

  const setMeetingStatus = (m: SummaryMeeting, status: "canceled" | "active") =>
    patchMeeting(m.id, "status", { status });

  const saveReschedule = async (m: SummaryMeeting) => {
    if (!rescheduleValue) return;
    await patchMeeting(m.id, "reschedule", { startTime: new Date(rescheduleValue).toISOString() });
    setReschedulingId(null);
  };

  const fmtTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const visibleFunis = funis.filter((f) => f.pipelineId !== "none");
  const visibleMeetings = meetings.filter((m) => m.pipelineId !== "none");
  const totalActive = visibleFunis.reduce((s, f) => s + f.total, 0);
  const totalConfirmed = visibleFunis.reduce((s, f) => s + f.confirmed, 0);
  const totalCanceled = visibleFunis.reduce((s, f) => s + f.canceled, 0);
  const totalNoShow = visibleFunis.reduce((s, f) => s + f.noShow, 0);
  const totalRescheduled = visibleFunis.reduce((s, f) => s + f.rescheduled, 0);
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
          noShow: 0,
          rescheduled: 0,
          canceled: 0,
        }
    ),
    ...visibleFunis.filter((f) => !FUNIL_ORDER.includes(f.pipelineName)),
  ];

  const actionBtn =
    "p-1 rounded-full transition-colors disabled:opacity-40 flex-shrink-0";

  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2 flex-wrap">
            <Calendar size={16} className="text-petrol-600" />
            {range === "today" ? "Reuniões de hoje" : "Reuniões da semana"}
            {totalMeetings > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Total
                </span>
                <StatusChips
                  canceled={totalCanceled}
                  total={totalMeetings}
                  confirmed={totalConfirmed}
                  noShow={totalNoShow}
                  rescheduled={totalRescheduled}
                />
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
                <div className="flex items-center justify-between gap-2 flex-wrap border-b border-gray-200 pb-1.5">
                  <p className="text-sm font-bold text-gray-700 uppercase tracking-wide truncate">
                    {f.pipelineName}
                  </p>
                  <StatusChips
                    canceled={f.canceled}
                    total={f.total + f.canceled}
                    confirmed={f.confirmed}
                    noShow={f.noShow}
                    rescheduled={f.rescheduled}
                    size="sm"
                  />
                </div>
                {funilMeetings.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Nenhuma reunião</p>
                ) : (
                  <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto overflow-x-hidden">
                    {funilMeetings.map((m) => {
                      const canceled = m.status === "canceled";
                      const busy = busyId === m.id;
                      return (
                        <div key={m.id}>
                          <div
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

                            {/* Status escrito — só aparece quando acontece */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {!canceled && m.confirmationStatus === "CONFIRMED" && (
                                <span
                                  className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full"
                                  title={m.confirmedByName ? `Confirmada por ${m.confirmedByName}` : "Confirmada"}
                                >
                                  Confirmada
                                </span>
                              )}
                              {!canceled && m.confirmationStatus === "DECLINED" && (
                                <span
                                  className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full"
                                  title="Lead avisou que não vem"
                                >
                                  Não vem
                                </span>
                              )}
                              {!canceled && m.confirmationStatus === "NO_SHOW" && (
                                <span
                                  className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full"
                                  title="Lead não compareceu"
                                >
                                  No-show
                                </span>
                              )}
                              {!canceled && m.rescheduledAt && (
                                <span
                                  className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full"
                                  title="Reunião reagendada"
                                >
                                  Reagendada
                                </span>
                              )}
                              {canceled && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                  Cancelada
                                </span>
                              )}
                            </div>

                            {/* Ações — não propagam o clique da linha */}
                            <div
                              className="flex items-center gap-0.5 flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canceled ? (
                                <button
                                  onClick={() => setMeetingStatus(m, "active")}
                                  disabled={busy}
                                  title="Reativar reunião"
                                  className={clsx(actionBtn, "text-blue-300 hover:text-blue-600 hover:bg-blue-50")}
                                >
                                  <RotateCcw size={14} />
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() =>
                                      setConfirmation(
                                        m,
                                        m.confirmationStatus === "CONFIRMED" ? "PENDING" : "CONFIRMED"
                                      )
                                    }
                                    disabled={busy}
                                    title={
                                      m.confirmationStatus === "CONFIRMED"
                                        ? "Desfazer confirmação"
                                        : "Marcar como confirmada"
                                    }
                                    className={clsx(
                                      actionBtn,
                                      m.confirmationStatus === "CONFIRMED"
                                        ? "text-white bg-green-500 hover:bg-green-600"
                                        : "text-green-300 hover:text-green-600 hover:bg-green-50"
                                    )}
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setReschedulingId(reschedulingId === m.id ? null : m.id);
                                      setRescheduleValue(toLocalInput(m.startTime));
                                    }}
                                    disabled={busy}
                                    title="Reagendar reunião"
                                    className={clsx(
                                      actionBtn,
                                      reschedulingId === m.id
                                        ? "text-blue-600 bg-blue-50"
                                        : "text-blue-300 hover:text-blue-600 hover:bg-blue-50"
                                    )}
                                  >
                                    <CalendarClock size={14} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setConfirmation(
                                        m,
                                        m.confirmationStatus === "NO_SHOW" ? "PENDING" : "NO_SHOW"
                                      )
                                    }
                                    disabled={busy}
                                    title={
                                      m.confirmationStatus === "NO_SHOW"
                                        ? "Desfazer no-show"
                                        : "Lead não compareceu (no-show)"
                                    }
                                    className={clsx(
                                      actionBtn,
                                      m.confirmationStatus === "NO_SHOW"
                                        ? "text-white bg-orange-500 hover:bg-orange-600"
                                        : "text-orange-300 hover:text-orange-600 hover:bg-orange-50"
                                    )}
                                  >
                                    <UserX size={14} />
                                  </button>
                                  <button
                                    onClick={() => setMeetingStatus(m, "canceled")}
                                    disabled={busy}
                                    title="Cancelar reunião"
                                    className={clsx(actionBtn, "text-red-300 hover:text-red-600 hover:bg-red-50")}
                                  >
                                    <Ban size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Editor de reagendamento */}
                          {reschedulingId === m.id && !canceled && (
                            <div
                              className="flex items-center gap-2 pb-2 pl-[3.75rem] pr-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CalendarClock size={13} className="text-petrol-600 flex-shrink-0" />
                              <input
                                type="datetime-local"
                                value={rescheduleValue}
                                onChange={(e) => setRescheduleValue(e.target.value)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-petrol-500 min-w-0"
                              />
                              <button
                                onClick={() => saveReschedule(m)}
                                disabled={busy || !rescheduleValue}
                                title="Salvar novo horário"
                                className="p-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50 flex-shrink-0"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => setReschedulingId(null)}
                                title="Fechar sem salvar"
                                className="p-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors flex-shrink-0"
                              >
                                <X size={13} />
                              </button>
                            </div>
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
