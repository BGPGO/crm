"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { Plus, Trash2, Save, Pause, Play } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface FollowUpStep {
  order: number;
  delayMinutes: number;
  tone: "Casual" | "Reforço" | "Encerramento";
}

interface FollowUpStatus {
  id: string;
  name: string | null;
  phone: string;
  currentStep: number;
  lastFollowUpAt: string | null;
  state: string;
}

interface BotConfig {
  followUpEnabled: boolean;
  followUpSteps: FollowUpStep[];
}

export default function ConversasAutomacoesPage() {
  const [config, setConfig] = useState<BotConfig>({
    followUpEnabled: false,
    followUpSteps: [],
  });
  const [statuses, setStatuses] = useState<FollowUpStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: BotConfig }>("/whatsapp/config");
      setConfig({
        followUpEnabled: res.data?.followUpEnabled ?? false,
        followUpSteps: res.data?.followUpSteps ?? [],
      });
    } catch {
      // Config might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatuses = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await api.get<{ data: FollowUpStatus[] }>("/whatsapp/followup/status");
      setStatuses(res.data || []);
    } catch {
      // Endpoint might not exist yet
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchStatuses();
  }, [fetchConfig, fetchStatuses]);

  const toggleEnabled = async () => {
    try {
      await api.put("/whatsapp/config", { followUpEnabled: !config.followUpEnabled });
      setConfig((prev) => ({ ...prev, followUpEnabled: !prev.followUpEnabled }));
    } catch {
      setError("Erro ao atualizar configuração.");
    }
  };

  const addStep = () => {
    setConfig((prev) => ({
      ...prev,
      followUpSteps: [
        ...prev.followUpSteps,
        { order: prev.followUpSteps.length + 1, delayMinutes: 60, tone: "Casual" },
      ],
    }));
  };

  const removeStep = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      followUpSteps: prev.followUpSteps
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, order: i + 1 })),
    }));
  };

  const updateStep = (index: number, field: keyof FollowUpStep, value: string | number) => {
    setConfig((prev) => ({
      ...prev,
      followUpSteps: prev.followUpSteps.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      ),
    }));
  };

  const saveSteps = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put("/whatsapp/config/follow-up-steps", { steps: config.followUpSteps });
    } catch {
      setError("Erro ao salvar etapas.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFollowUp = async (id: string, currentState: string) => {
    try {
      const action = currentState === "paused" ? "resume" : "pause";
      await api.post(`/whatsapp/followup/${id}/${action}`, {});
      await fetchStatuses();
    } catch {
      setError("Erro ao atualizar follow-up.");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Automações" breadcrumb={["Conversas", "Automações"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-sm text-red-600 font-medium hover:underline">Fechar</button>
        </div>
      )}

      <main className="flex-1 p-6 space-y-6">
        {/* Follow-up configuration */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Follow-up Automático</h2>
            {loading ? (
              <div className="h-6 w-20 bg-gray-100 rounded animate-pulse" />
            ) : (
              <button
                onClick={toggleEnabled}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  config.followUpEnabled ? "bg-blue-600" : "bg-gray-300"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    config.followUpEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {config.followUpSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <span className="text-xs font-semibold text-gray-500 w-6">#{step.order}</span>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">Delay (minutos)</label>
                      <input
                        type="number"
                        value={step.delayMinutes}
                        onChange={(e) => updateStep(index, "delayMinutes", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={1}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1">Tom</label>
                      <select
                        value={step.tone}
                        onChange={(e) => updateStep(index, "tone", e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="Casual">Casual</option>
                        <option value="Reforço">Reforço</option>
                        <option value="Encerramento">Encerramento</option>
                      </select>
                    </div>
                    <button
                      onClick={() => removeStep(index)}
                      className="mt-5 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={addStep}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus size={14} />
                  Adicionar Etapa
                </button>
                <button
                  onClick={saveSteps}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={14} />
                  {saving ? "Salvando..." : "Salvar Etapas"}
                </button>
              </div>
            </>
          )}
        </Card>

        {/* Follow-up status table */}
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Status de Follow-ups</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Step Atual</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Último Follow-up</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {statusLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : statuses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Nenhum follow-up ativo
                    </td>
                  </tr>
                ) : (
                  statuses.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.phone}</td>
                      <td className="px-4 py-3 text-gray-600">{item.currentStep}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(item.lastFollowUpAt)}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          item.state === "active" ? "bg-green-100 text-green-700" :
                          item.state === "paused" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {item.state === "active" ? "Ativo" : item.state === "paused" ? "Pausado" : item.state}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleFollowUp(item.id, item.state)}
                          className={clsx(
                            "inline-flex items-center gap-1 text-xs font-medium hover:underline",
                            item.state === "paused" ? "text-green-600" : "text-yellow-600"
                          )}
                        >
                          {item.state === "paused" ? (
                            <><Play size={12} /> Retomar</>
                          ) : (
                            <><Pause size={12} /> Pausar</>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
