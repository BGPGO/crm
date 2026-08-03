"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import { Calendar, CheckCircle, XCircle, Clock } from "lucide-react";
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
}

interface SummaryResponse {
  data: {
    funis: FunilSummary[];
    meetings: SummaryMeeting[];
  };
}

/**
 * Controle de reuniões do dia no Início: totais por funil (confirmadas /
 * aguardando / não vem / canceladas) + lista com confirmação em um clique.
 */
export default function MeetingsConfirmationCard() {
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

  const totalActive = funis.reduce((s, f) => s + f.total, 0);
  const totalConfirmed = funis.reduce((s, f) => s + f.confirmed, 0);

  return (
    <Card padding="md">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Calendar size={16} className="text-petrol-600" />
            {range === "today" ? "Reuniões de hoje" : "Reuniões da semana"}
            {totalActive > 0 && (
              <span
                className={clsx(
                  "text-xs font-bold px-2 py-0.5 rounded-full",
                  totalConfirmed === totalActive
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {totalConfirmed}/{totalActive} confirmadas
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
      ) : funis.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          {range === "today" ? "Nenhuma reunião hoje" : "Nenhuma reunião essa semana"}
        </p>
      ) : (
        <div className="mt-2">
          {/* Totais por funil */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
            {funis.map((f) => (
              <div
                key={f.pipelineId}
                className="border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
              >
                <span className="text-sm font-semibold text-gray-800 truncate">{f.pipelineName}</span>
                <span className="flex items-center gap-2 text-xs flex-shrink-0">
                  <span className="flex items-center gap-1 text-green-700 font-medium" title="Confirmadas">
                    <CheckCircle size={13} /> {f.confirmed}
                  </span>
                  <span className="flex items-center gap-1 text-gray-500" title="Aguardando confirmação">
                    <Clock size={13} /> {f.pending}
                  </span>
                  {f.declined > 0 && (
                    <span className="flex items-center gap-1 text-red-600 font-medium" title="Lead não vem">
                      <XCircle size={13} /> {f.declined}
                    </span>
                  )}
                  {f.canceled > 0 && (
                    <span className="text-gray-400 line-through" title="Canceladas">
                      {f.canceled}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Lista do dia */}
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {meetings.map((m) => {
              const canceled = m.status === "canceled";
              return (
                <div key={m.id} className="py-2 flex items-center gap-3">
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
                    <p className="text-[11px] text-gray-400 truncate">
                      {m.pipelineName}
                      {m.ownerName && ` · ${m.ownerName}`}
                    </p>
                  </div>
                  {canceled ? (
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
                      Cancelada
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleConfirmation(m)}
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
        </div>
      )}
    </Card>
  );
}
