"use client";

import { useState, useEffect } from "react";
import { X, Clock, User, Phone, Mail, ChevronRight, Loader2, Pause, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Enrollment {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt?: string;
  nextActionAt?: string;
  metadata?: any;
  contact?: { name: string; email?: string; phone?: string };
  currentStep?: { order: number; actionType: string; config: any };
}

interface EnrollmentsPanelProps {
  automationId: string;
  automationName: string;
  onClose: () => void;
}

const actionLabels: Record<string, string> = {
  SEND_WHATSAPP_AI: "WhatsApp IA",
  SEND_WHATSAPP: "WhatsApp Template",
  SEND_EMAIL: "Email",
  WAIT: "Aguardando",
  CONDITION: "Condição",
  ADD_TAG: "Add Tag",
  REMOVE_TAG: "Remove Tag",
  MOVE_PIPELINE_STAGE: "Mover etapa",
  MARK_LOST: "Marcar perda",
  WAIT_FOR_RESPONSE: "Aguardando resposta",
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-gray-100 text-gray-600",
  PAUSED: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
};

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 60) return `em ${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `em ${hours}h`;
  const days = Math.floor(hours / 24);
  return `em ${days}d`;
}

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}min atrás`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export default function EnrollmentsPanel({ automationId, automationName, onClose }: EnrollmentsPanelProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; active: number; completed: number; paused: number; failed: number } | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const [enrollRes, statsRes] = await Promise.all([
          api.get<{ data: Enrollment[] }>(`/automations/${automationId}/enrollments?limit=100`),
          api.get<{ data: any }>(`/automations/${automationId}/stats`),
        ]);
        setEnrollments(enrollRes.data || []);
        setStats(statsRes.data || null);
      } catch {}
      setLoading(false);
    }
    fetch();
  }, [automationId]);

  const filtered = filter === "all" ? enrollments : enrollments.filter(e => e.status === filter);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{automationName}</h2>
            <p className="text-sm text-gray-500">Contatos nesta automação</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="flex gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50">
            {[
              { key: "all", label: "Total", count: stats.total, color: "bg-gray-100 text-gray-700" },
              { key: "ACTIVE", label: "Ativos", count: stats.active, color: "bg-green-100 text-green-700" },
              { key: "PAUSED", label: "Pausados", count: stats.paused, color: "bg-yellow-100 text-yellow-700" },
              { key: "COMPLETED", label: "Concluídos", count: stats.completed, color: "bg-gray-100 text-gray-600" },
              { key: "FAILED", label: "Falhas", count: stats.failed, color: "bg-red-100 text-red-700" },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setFilter(s.key)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  filter === s.key ? s.color + " ring-2 ring-offset-1 ring-current" : "bg-white text-gray-500 hover:bg-gray-100"
                )}
              >
                {s.label} <span className="opacity-70">({s.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <User size={32} className="mb-2" />
              <p className="text-sm">Nenhum contato {filter !== "all" ? "com este status" : "nesta automação"}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map(e => {
                const stepConfig = e.currentStep?.config || {};
                const stepLabel = stepConfig._label || actionLabels[e.currentStep?.actionType || ""] || e.currentStep?.actionType || "—";
                const isActive = e.status === "ACTIVE";
                const isPaused = e.status === "PAUSED";
                const meta = e.metadata || {};

                return (
                  <div key={e.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      {/* Contact info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{e.contact?.name || "Sem nome"}</p>
                          <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold", statusColors[e.status] || "bg-gray-100 text-gray-600")}>
                            {e.status === "ACTIVE" ? "Ativo" : e.status === "PAUSED" ? "Pausado" : e.status === "COMPLETED" ? "Concluído" : "Falha"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          {e.contact?.phone && (
                            <span className="flex items-center gap-1"><Phone size={10} />{e.contact.phone}</span>
                          )}
                          {e.contact?.email && (
                            <span className="flex items-center gap-1"><Mail size={10} />{e.contact.email}</span>
                          )}
                          <span>Inscrito {timeSince(e.enrolledAt)}</span>
                        </div>
                      </div>

                      {/* Current step */}
                      {isActive && e.currentStep && (
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <ChevronRight size={12} className="text-gray-300" />
                            <span className="font-medium">Step #{e.currentStep.order}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 max-w-[180px] truncate">{stepLabel}</p>
                          {e.nextActionAt && (
                            <p className="text-[10px] text-purple-500 font-medium flex items-center gap-1 justify-end mt-0.5">
                              <Clock size={10} />
                              {timeUntil(e.nextActionAt)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Paused reason */}
                      {isPaused && meta.interruptedByResponse && (
                        <div className="flex items-center gap-1 text-xs text-yellow-600 flex-shrink-0">
                          <Pause size={12} />
                          <span>Respondeu</span>
                        </div>
                      )}
                      {isPaused && meta.interruptedByStageChange && (
                        <div className="flex items-center gap-1 text-xs text-yellow-600 flex-shrink-0">
                          <AlertCircle size={12} />
                          <span>Mudou de etapa</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
