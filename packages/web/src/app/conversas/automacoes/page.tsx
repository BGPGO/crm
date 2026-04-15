"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import AutomationCard from "@/components/automations/AutomationCard";
import AutomationCreateModal from "@/components/automations/AutomationCreateModal";
import EnrollmentsPanel from "@/components/automations/EnrollmentsPanel";
import Button from "@/components/ui/Button";
import { Plus, Zap, Users, CheckCircle2, AlertCircle, Activity, Save, Trash2, ChevronDown, ChevronUp, Bell, MessageSquare, Clock, Mail } from "lucide-react";
import { api } from "@/lib/api";
import clsx from "clsx";

interface Automation {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  triggerType: string;
  triggerConfig?: any;
  _count?: { steps: number; enrollments: number };
  createdAt: string;
}

interface GlobalStats {
  activeAutomations: number;
  enrollmentsActive: number;
  executionsToday: number;
  errorsToday: number;
}

interface FollowUpStep {
  order: number;
  delayMinutes: number;
  tone: string;
}

interface SystemConfig {
  followUpEnabled: boolean;
  meetingReminderEnabled: boolean;
  followUpToneCasual: string;
  followUpToneReforco: string;
  followUpToneEncerramento: string;
}

interface ReminderStep {
  id: string;
  minutesBefore: number;
  message: string;
  enabled: boolean;
}

const TONE_OPTIONS = [
  { value: "CASUAL", label: "Casual", desc: "Leve, checando se viu" },
  { value: "REFORCO", label: "Reforço", desc: "Reforça valor" },
  { value: "ENCERRAMENTO", label: "Encerramento", desc: "Agradece e encerra" },
];

export default function ConversasAutomacoesPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewEnrollments, setViewEnrollments] = useState<{ id: string; name: string } | null>(null);

  // System automations state
  const [followUpSteps, setFollowUpSteps] = useState<FollowUpStep[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [reminderSteps, setReminderSteps] = useState<ReminderStep[]>([]);
  const [systemLoading, setSystemLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [autoRes, statsRes] = await Promise.all([
        api.get<{ data: Automation[] }>("/automations"),
        api.get<{ data: GlobalStats }>("/automations/stats/global"),
      ]);
      setAutomations(autoRes.data || []);
      setGlobalStats(statsRes.data || null);
    } catch {
      setError("Erro ao carregar automações.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSystemData = useCallback(async () => {
    setSystemLoading(true);
    try {
      const [stepsRes, configRes, remindersRes] = await Promise.all([
        api.get<{ data: FollowUpStep[] }>("/whatsapp/config/follow-up-steps"),
        api.get<{ data: SystemConfig }>("/whatsapp/config"),
        api.get<{ data: ReminderStep[] }>("/meeting-reminders"),
      ]);
      setFollowUpSteps((stepsRes as any).data || []);
      setSystemConfig((configRes as any).data || null);
      setReminderSteps((remindersRes as any).data || []);
    } catch {
      // silent — system data is non-critical
    } finally {
      setSystemLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchSystemData();
  }, [fetchData, fetchSystemData]);

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/automations/${id}/activate`, {});
      await fetchData();
    } catch {
      setError("Erro ao ativar automação.");
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/automations/${id}/pause`, {});
      await fetchData();
    } catch {
      setError("Erro ao pausar automação.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
    try {
      await api.delete(`/automations/${id}`);
      await fetchData();
    } catch {
      setError("Erro ao excluir automação.");
    }
  };

  const handleCreated = (automation: any) => {
    setShowCreateModal(false);
    if (automation?.id) {
      router.push(`/conversas/automacoes/${automation.id}`);
    } else {
      fetchData();
    }
  };

  const cadences = automations.filter((a) => (a.triggerConfig as any)?.isCadence === true);
  const emailByStage = automations.filter(
    (a) => (a.triggerConfig as any)?.kind === 'email-by-stage'
  );
  const regularAutomations = automations.filter(
    (a) =>
      (a.triggerConfig as any)?.isCadence !== true &&
      (a.triggerConfig as any)?.kind !== 'email-by-stage'
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Automações" breadcrumb={["Conversas", "Automações"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-6">

        {/* Painel de estatísticas globais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: "Automações ativas",
              value: loading ? "—" : (globalStats?.activeAutomations ?? 0),
              icon: Activity,
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "Em execução agora",
              value: loading ? "—" : (globalStats?.enrollmentsActive ?? 0),
              icon: Users,
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "Execuções hoje",
              value: loading ? "—" : (globalStats?.executionsToday ?? 0),
              icon: CheckCircle2,
              color: "text-gray-600",
              bg: "bg-gray-50",
            },
            {
              label: "Erros hoje",
              value: loading ? "—" : (globalStats?.errorsToday ?? 0),
              icon: AlertCircle,
              color: (globalStats?.errorsToday ?? 0) > 0 ? "text-red-600" : "text-gray-400",
              bg: (globalStats?.errorsToday ?? 0) > 0 ? "bg-red-50" : "bg-gray-50",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${stat.bg}`}>
                  <Icon size={18} className={stat.color} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-gray-900 leading-tight">{stat.value}</p>
                  <p className="text-xs text-gray-500 leading-tight">{stat.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Automações WhatsApp</h2>
            {!loading && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {automations.length}
              </span>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            Nova Automação
          </Button>
        </div>

        {/* Sistema — Follow-up + Lembretes */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sistema</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
              2
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FollowUpSystemCard
              steps={followUpSteps}
              config={systemConfig}
              loading={systemLoading}
              onSaved={fetchSystemData}
            />
            <RemindersSystemCard
              steps={reminderSteps}
              config={systemConfig}
              loading={systemLoading}
              onSaved={fetchSystemData}
            />
          </div>
        </div>

        <div className="border-t border-gray-200" />

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                    <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                  <div className="h-7 w-full bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Zap size={32} className="text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Nenhuma automação criada
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              Crie automações para enviar mensagens automáticas quando leads mudam de etapa, recebem tags ou são criados.
            </p>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Criar primeira automação
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Cadências */}
            {cadences.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">
                    Cadências de Follow-up
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    {cadences.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cadences.map((automation) => (
                    <div key={automation.id} className="ring-2 ring-purple-200 rounded-xl">
                      <AutomationCard
                        automation={automation}
                        isCadence
                        onActivate={handleActivate}
                        onPause={handlePause}
                        onDelete={handleDelete}
                        onViewEnrollments={(id, name) => setViewEnrollments({ id, name })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cadences.length > 0 && (emailByStage.length > 0 || regularAutomations.length > 0) && (
              <div className="border-t border-gray-200" />
            )}

            {/* Emails por etapa do funil */}
            {emailByStage.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail size={16} className="text-indigo-600" />
                  <h3 className="text-sm font-semibold text-indigo-700 uppercase tracking-wider">
                    Emails por etapa
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                    {emailByStage.length}
                  </span>
                  <span className="text-xs text-gray-400">
                    dispara quando lead entra na coluna
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...emailByStage]
                    .sort((a, b) =>
                      String((a.triggerConfig as any)?.stageName || '').localeCompare(
                        String((b.triggerConfig as any)?.stageName || '')
                      )
                    )
                    .map((automation) => (
                      <div key={automation.id} className="ring-2 ring-indigo-200 rounded-xl">
                        <AutomationCard
                          automation={automation}
                          onActivate={handleActivate}
                          onPause={handlePause}
                          onDelete={handleDelete}
                          onViewEnrollments={(id, name) => setViewEnrollments({ id, name })}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            {emailByStage.length > 0 && regularAutomations.length > 0 && (
              <div className="border-t border-gray-200" />
            )}

            {/* Automações regulares */}
            {regularAutomations.length > 0 && (
              <div className="space-y-4">
                {(cadences.length > 0 || emailByStage.length > 0) && (
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      Automações
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      {regularAutomations.length}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {regularAutomations.map((automation) => (
                    <AutomationCard
                      key={automation.id}
                      automation={automation}
                      onActivate={handleActivate}
                      onPause={handlePause}
                      onDelete={handleDelete}
                      onViewEnrollments={(id, name) => setViewEnrollments({ id, name })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <AutomationCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {viewEnrollments && (
        <EnrollmentsPanel
          automationId={viewEnrollments.id}
          automationName={viewEnrollments.name}
          onClose={() => setViewEnrollments(null)}
        />
      )}
    </div>
  );
}

// ─── Sistema: Follow-up da Bia ───────────────────────────────────────────────

function FollowUpSystemCard({
  steps,
  config,
  loading,
  onSaved,
}: {
  steps: FollowUpStep[];
  config: SystemConfig | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localSteps, setLocalSteps] = useState<FollowUpStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setLocalSteps(
      steps.length > 0
        ? steps
        : [
            { order: 1, delayMinutes: 30, tone: "CASUAL" },
            { order: 2, delayMinutes: 60, tone: "REFORCO" },
            { order: 3, delayMinutes: 120, tone: "ENCERRAMENTO" },
          ]
    );
  }, [steps]);

  const enabled = config?.followUpEnabled ?? false;

  const toggleEnabled = async () => {
    setToggling(true);
    try {
      await api.put("/whatsapp/config", { followUpEnabled: !enabled });
      onSaved();
    } catch {
      setMsg("Erro ao alterar.");
    } finally {
      setToggling(false);
    }
  };

  const updateStep = (idx: number, field: keyof FollowUpStep, value: string | number) => {
    setLocalSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addStep = () => {
    setLocalSteps((prev) => [...prev, { order: prev.length + 1, delayMinutes: 60, tone: "CASUAL" }]);
  };

  const removeStep = (idx: number) => {
    setLocalSteps((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 }))
    );
  };

  const saveSteps = async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.put("/whatsapp/config/follow-up-steps", { steps: localSteps });
      setMsg("Salvo!");
      setTimeout(() => setMsg(""), 3000);
      onSaved();
    } catch {
      setMsg("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <MessageSquare size={16} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Follow-up da Bia</p>
            <p className="text-xs text-gray-400">
              {loading ? "..." : `${localSteps.length} etapa${localSteps.length !== 1 ? "s" : ""} · quando lead não responde`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle */}
          <button
            onClick={toggleEnabled}
            disabled={toggling || loading}
            className={clsx(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
              enabled ? "bg-blue-600" : "bg-gray-300"
            )}
            title={enabled ? "Desativar follow-up" : "Ativar follow-up"}
          >
            <span className={clsx("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", enabled ? "translate-x-4.5" : "translate-x-0.5")} />
          </button>
          <span className={clsx("text-xs font-medium", enabled ? "text-blue-600" : "text-gray-400")}>
            {enabled ? "Ativo" : "Pausado"}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Collapsed summary */}
      {!expanded && !loading && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {localSteps.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
              <Clock size={10} />
              {s.delayMinutes < 60 ? `${s.delayMinutes}min` : `${s.delayMinutes / 60}h`} · {TONE_OPTIONS.find((t) => t.value === s.tone)?.label}
            </span>
          ))}
        </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">
          {localSteps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                {step.order}
              </span>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium text-gray-400 uppercase block mb-0.5">Delay (min)</label>
                  <input
                    type="number" min={1}
                    value={step.delayMinutes}
                    onChange={(e) => updateStep(idx, "delayMinutes", parseInt(e.target.value) || 1)}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-400 uppercase block mb-0.5">Tom</label>
                  <select
                    value={step.tone}
                    onChange={(e) => updateStep(idx, "tone", e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    {TONE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button onClick={() => removeStep(idx)} className="flex-shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <button
              onClick={addStep}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <Plus size={12} /> Adicionar etapa
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveSteps}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={12} />
              {saving ? "Salvando..." : "Salvar etapas"}
            </button>
            {msg && (
              <span className={clsx("text-xs font-medium", msg.includes("Erro") ? "text-red-600" : "text-green-600")}>
                {msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sistema: Lembretes de Reunião ──────────────────────────────────────────

function RemindersSystemCard({
  steps,
  config,
  loading,
  onSaved,
}: {
  steps: ReminderStep[];
  config: SystemConfig | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localSteps, setLocalSteps] = useState<ReminderStep[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    setLocalSteps(steps);
  }, [steps]);

  const enabled = config?.meetingReminderEnabled ?? false;

  const toggleEnabled = async () => {
    setToggling(true);
    try {
      await api.put("/whatsapp/config", { meetingReminderEnabled: !enabled });
      onSaved();
    } catch {
      /* silent */
    } finally {
      setToggling(false);
    }
  };

  const saveStep = async (id: string, data: { enabled?: boolean; message?: string }) => {
    setSaving(id);
    try {
      await api.put(`/meeting-reminders/${id}`, data);
      onSaved();
    } catch {
      /* silent */
    } finally {
      setSaving(null);
    }
  };

  const formatMinutes = (m: number) => {
    if (m >= 1440) return `${Math.floor(m / 1440)}d antes`;
    if (m >= 60) return `${Math.floor(m / 60)}h antes`;
    return `${m}min antes`;
  };

  const activeCount = localSteps.filter((s) => s.enabled).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <Bell size={16} className="text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">Lembretes de Reunião</p>
            <p className="text-xs text-gray-400">
              {loading ? "..." : `${activeCount} ativo${activeCount !== 1 ? "s" : ""} · antes de reuniões Calendly`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={toggleEnabled}
            disabled={toggling || loading}
            className={clsx(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50",
              enabled ? "bg-green-500" : "bg-gray-300"
            )}
            title={enabled ? "Desativar lembretes" : "Ativar lembretes"}
          >
            <span className={clsx("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", enabled ? "translate-x-4.5" : "translate-x-0.5")} />
          </button>
          <span className={clsx("text-xs font-medium", enabled ? "text-green-600" : "text-gray-400")}>
            {enabled ? "Ativo" : "Pausado"}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Collapsed summary */}
      {!expanded && !loading && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {localSteps.map((s) => (
            <span
              key={s.id}
              className={clsx(
                "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full",
                s.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400 line-through"
              )}
            >
              <Clock size={10} />
              {formatMinutes(s.minutesBefore)}
            </span>
          ))}
        </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3">
          {localSteps.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">Nenhum lembrete configurado.</p>
          )}
          {localSteps.map((step) => (
            <div
              key={step.id}
              className={clsx(
                "border rounded-lg p-3",
                step.enabled ? "border-green-200 bg-green-50/30" : "border-gray-200 bg-gray-50/50 opacity-60"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">{formatMinutes(step.minutesBefore)}</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <span className="text-xs text-gray-400">{step.enabled ? "Ativo" : "Inativo"}</span>
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={(e) => {
                      const newEnabled = e.target.checked;
                      setLocalSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, enabled: newEnabled } : s));
                      saveStep(step.id, { enabled: newEnabled });
                    }}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </label>
              </div>
              <textarea
                value={step.message}
                onChange={(e) => setLocalSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, message: e.target.value } : s))}
                rows={2}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-gray-400">{"{{nome}} {{data}} {{hora}} {{falta}}"}</span>
                <button
                  onClick={() => saveStep(step.id, { message: step.message })}
                  disabled={saving === step.id}
                  className="text-xs text-green-600 hover:text-green-700 font-medium disabled:opacity-50"
                >
                  {saving === step.id ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
