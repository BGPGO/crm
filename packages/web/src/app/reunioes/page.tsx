"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import {
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  Video,
  Settings,
  Save,
  Bell,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Meeting {
  id: string;
  eventType: string;
  inviteeEmail: string;
  inviteeName: string | null;
  hostName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  dealId: string | null;
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
}

interface MeetingStats {
  today: number;
  thisWeek: number;
  total: number;
}

interface ReminderStep {
  id: string;
  minutesBefore: number;
  enabled: boolean;
  message: string;
}

interface WhatsAppConfig {
  id: string;
  meetingReminderEnabled: boolean;
}

function formatMinutesLabel(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return h === 1 ? "1 hora" : `${h} horas`;
  }
  return `${minutes} minutos`;
}

// ─── Configuracao Tab Component ─────────────────────────────────────────────

function ConfiguracaoTab() {
  const [steps, setSteps] = useState<ReminderStep[]>([]);
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>(
    {}
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [stepsRes, configRes] = await Promise.all([
        api.get<{ data: ReminderStep[] }>("/meeting-reminders"),
        api.get<{ data: WhatsAppConfig }>("/whatsapp/config"),
      ]);
      setSteps(stepsRes.data);
      setWhatsappConfig(configRes.data);
    } catch {
      console.error("Erro ao carregar configuracoes de lembrete");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGlobalEnabled = async () => {
    if (!whatsappConfig) return;
    setSavingGlobal(true);
    try {
      const newVal = !whatsappConfig.meetingReminderEnabled;
      await api.put("/whatsapp/config", {
        meetingReminderEnabled: newVal,
      });
      setWhatsappConfig({ ...whatsappConfig, meetingReminderEnabled: newVal });
    } catch {
      console.error("Erro ao salvar configuracao");
    } finally {
      setSavingGlobal(false);
    }
  };

  const toggleStepEnabled = async (step: ReminderStep) => {
    setSavingId(step.id);
    try {
      const res = await api.put<{ data: ReminderStep }>(
        `/meeting-reminders/${step.id}`,
        { enabled: !step.enabled }
      );
      setSteps((prev) => prev.map((s) => (s.id === step.id ? res.data : s)));
    } catch {
      console.error("Erro ao salvar step");
    } finally {
      setSavingId(null);
    }
  };

  const saveStepMessage = async (step: ReminderStep) => {
    const newMessage = editedMessages[step.id];
    if (newMessage === undefined || newMessage === step.message) return;
    setSavingId(step.id);
    try {
      const res = await api.put<{ data: ReminderStep }>(
        `/meeting-reminders/${step.id}`,
        { message: newMessage }
      );
      setSteps((prev) => prev.map((s) => (s.id === step.id ? res.data : s)));
      setEditedMessages((prev) => {
        const copy = { ...prev };
        delete copy[step.id];
        return copy;
      });
    } catch {
      console.error("Erro ao salvar mensagem");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 bg-gray-100 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global toggle */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Bell size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Lembretes de Reuniao via WhatsApp
              </h3>
              <p className="text-xs text-gray-500">
                Envia lembretes automaticos antes das reunioes agendadas
              </p>
            </div>
          </div>
          <button
            onClick={toggleGlobalEnabled}
            disabled={savingGlobal}
            className={clsx(
              "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
              whatsappConfig?.meetingReminderEnabled
                ? "bg-green-500"
                : "bg-gray-200"
            )}
          >
            <span
              className={clsx(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                whatsappConfig?.meetingReminderEnabled
                  ? "translate-x-5"
                  : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">
          Etapas de Lembrete
        </h3>
        <p className="text-xs text-gray-500">
          Variaveis disponiveis: <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{"{{nome}}"}</code>{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{"{{data}}"}</code>{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{"{{hora}}"}</code>{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">{"{{falta}}"}</code>
        </p>

        {steps.map((step) => {
          const currentMessage =
            editedMessages[step.id] !== undefined
              ? editedMessages[step.id]
              : step.message;
          const hasChanges =
            editedMessages[step.id] !== undefined &&
            editedMessages[step.id] !== step.message;
          const isSaving = savingId === step.id;

          return (
            <div
              key={step.id}
              className={clsx(
                "bg-white rounded-xl border p-5 transition-colors",
                step.enabled ? "border-gray-200" : "border-gray-100 opacity-60"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatMinutesLabel(step.minutesBefore)} antes
                  </span>
                </div>
                <button
                  onClick={() => toggleStepEnabled(step)}
                  disabled={isSaving}
                  className={clsx(
                    "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    step.enabled ? "bg-blue-500" : "bg-gray-200"
                  )}
                >
                  <span
                    className={clsx(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      step.enabled ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              <textarea
                value={currentMessage}
                onChange={(e) =>
                  setEditedMessages((prev) => ({
                    ...prev,
                    [step.id]: e.target.value,
                  }))
                }
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
                placeholder="Mensagem do lembrete..."
              />

              {hasChanges && (
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => saveStepMessage(step)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Save size={14} />
                    {isSaving ? "Salvando..." : "Salvar mensagem"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ReunioesPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stats, setStats] = useState<MeetingStats>({
    today: 0,
    thisWeek: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">(
    "upcoming"
  );
  const [activeTab, setActiveTab] = useState<"proximas" | "configuracao">(
    "proximas"
  );

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ data: Meeting[] }>(
        `/calendly/config/meetings?period=${period}`
      );
      setMeetings(res.data || []);
    } catch {
      console.error("Erro ao carregar reunioes");
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: MeetingStats }>(
        "/calendly/config/meetings/stats"
      );
      setStats(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (activeTab === "proximas") {
      fetchMeetings();
    }
  }, [fetchMeetings, activeTab]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh every 60 seconds (only for meetings tab)
  useEffect(() => {
    if (activeTab !== "proximas") return;
    const interval = setInterval(() => {
      fetchMeetings();
      fetchStats();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchMeetings, fetchStats, activeTab]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff < 0) return "Passada";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `em ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `em ${hours}h ${minutes}min`;
    return `em ${minutes}min`;
  };

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const isSoon = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 2 * 60 * 60 * 1000; // within 2 hours
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Reunioes" breadcrumb={["Reunioes"]} />

      <div className="px-4 sm:px-6 py-6 flex-1 overflow-y-auto">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.today}
                </p>
                <p className="text-xs text-gray-500">Hoje</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Clock size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.thisWeek}
                </p>
                <p className="text-xs text-gray-500">Esta semana</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Video size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total}
                </p>
                <p className="text-xs text-gray-500">Total agendadas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("proximas")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "proximas"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Calendar size={16} />
            Proximas
          </button>
          <button
            onClick={() => setActiveTab("configuracao")}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "configuracao"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Settings size={16} />
            Configuracao
          </button>
        </div>

        {/* Tab content */}
        {activeTab === "configuracao" ? (
          <ConfiguracaoTab />
        ) : (
          <>
            {/* Period filter */}
            <div className="flex gap-2 mb-4">
              {(
                [
                  { key: "upcoming", label: "Proximas" },
                  { key: "past", label: "Passadas" },
                  { key: "all", label: "Todas" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setPeriod(f.key)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    period === f.key
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Meetings list */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-gray-100 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <div className="p-12 text-center">
                  <Calendar
                    size={48}
                    className="mx-auto text-gray-300 mb-3"
                  />
                  <p className="text-gray-500">
                    Nenhuma reuniao encontrada
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {meetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      className={clsx(
                        "px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors",
                        isSoon(meeting.startTime) &&
                          "bg-yellow-50 border-l-4 border-l-yellow-400",
                        isToday(meeting.startTime) &&
                          !isSoon(meeting.startTime) &&
                          "bg-blue-50/30"
                      )}
                    >
                      {/* Date/Time block */}
                      <div className="w-20 text-center flex-shrink-0">
                        <p className="text-xs font-medium text-gray-500 uppercase">
                          {formatDate(meeting.startTime)}
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatTime(meeting.startTime)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {formatTime(meeting.endTime)}
                        </p>
                      </div>

                      {/* Separator */}
                      <div className="w-px h-12 bg-gray-200 flex-shrink-0" />

                      {/* Contact info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {meeting.contact?.name ||
                            meeting.inviteeName ||
                            meeting.inviteeEmail}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {meeting.inviteeEmail && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Mail size={12} /> {meeting.inviteeEmail}
                            </span>
                          )}
                          {meeting.contact?.phone && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Phone size={12} /> {meeting.contact.phone}
                            </span>
                          )}
                        </div>
                        {meeting.hostName && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <User size={11} /> {meeting.hostName}
                          </span>
                        )}
                      </div>

                      {/* Time until */}
                      <div className="flex-shrink-0 text-right">
                        <span
                          className={clsx(
                            "text-xs font-medium px-2 py-1 rounded-full",
                            isSoon(meeting.startTime)
                              ? "bg-yellow-100 text-yellow-700"
                              : meeting.status === "canceled"
                                ? "bg-red-100 text-red-600"
                                : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {meeting.status === "canceled"
                            ? "Cancelada"
                            : getTimeUntil(meeting.startTime)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
