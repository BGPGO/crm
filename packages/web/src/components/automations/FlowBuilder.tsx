"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Play, Pause, ArrowLeft, Loader2, Zap } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { api } from "@/lib/api";
import FlowCanvas from "./FlowCanvas";
import AutomationTestPanel from "./AutomationTestPanel";

interface FlowStep {
  id: string;
  order: number;
  actionType: string;
  config: Record<string, any>;
  nextStepId?: string | null;
  trueStepId?: string | null;
  falseStepId?: string | null;
}

interface TriggerConfig {
  triggerType: string;
  triggerConfig: Record<string, any>;
}

interface Automation {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, any>;
  steps: FlowStep[];
}

interface FlowBuilderProps {
  automationId: string;
}

export default function FlowBuilder({ automationId }: FlowBuilderProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [trigger, setTrigger] = useState<TriggerConfig>({
    triggerType: "",
    triggerConfig: {},
  });
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);

  const fetchAutomation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Automation }>(
        `/automations/${automationId}`
      );
      const data = res.data;
      setName(data.name || "");
      setStatus(data.status || "draft");
      setTrigger({
        triggerType: data.triggerType || "",
        triggerConfig: data.triggerConfig || {},
      });
      setSteps(data.steps || []);
    } catch {
      setAlert({ type: "error", message: "Erro ao carregar automação." });
    } finally {
      setLoading(false);
    }
  }, [automationId]);

  useEffect(() => {
    fetchAutomation();
  }, [fetchAutomation]);

  const handleSave = async () => {
    setSaving(true);
    setAlert(null);
    try {
      await api.put(`/automations/${automationId}`, {
        name,
        triggerType: trigger.triggerType,
        triggerConfig: trigger.triggerConfig,
      });
      await api.put(`/automations/${automationId}/steps`, { steps });
      setAlert({ type: "success", message: "Automação salva com sucesso!" });
      setTimeout(() => setAlert(null), 3000);
    } catch {
      setAlert({ type: "error", message: "Erro ao salvar automação." });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = status === "active" ? "paused" : "active";
    try {
      await api.put(`/automations/${automationId}`, { status: newStatus });
      setStatus(newStatus);
    } catch {
      setAlert({ type: "error", message: "Erro ao alterar status." });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Skeleton header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <div className="h-8 w-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
          <div className="ml-auto flex gap-2">
            <div className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-9 w-20 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>
        {/* Skeleton canvas */}
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-4 flex-shrink-0">
        <Link
          href="/conversas/automacoes"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </Link>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 min-w-0 flex-1"
          placeholder="Nome da automação"
        />

        <span
          className={clsx(
            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0",
            status === "active"
              ? "bg-green-100 text-green-700"
              : status === "paused"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-gray-100 text-gray-600"
          )}
        >
          {status === "active"
            ? "Ativa"
            : status === "paused"
            ? "Pausada"
            : "Rascunho"}
        </span>

        <button
          onClick={handleToggleStatus}
          className={clsx(
            "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0",
            status === "active"
              ? "text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
              : "text-green-700 bg-green-50 hover:bg-green-100"
          )}
        >
          {status === "active" ? (
            <>
              <Pause size={14} /> Pausar
            </>
          ) : (
            <>
              <Play size={14} /> Ativar
            </>
          )}
        </button>

        <button
          onClick={() => setShowTestPanel(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors flex-shrink-0"
        >
          <Zap size={14} />
          Testar
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {/* Alert */}
      {alert && (
        <div
          className={clsx(
            "mx-4 mt-3 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between",
            alert.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          {alert.message}
          <button
            onClick={() => setAlert(null)}
            className="text-sm hover:underline ml-4"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Canvas */}
      <FlowCanvas
        trigger={trigger}
        steps={steps}
        onStepsChange={setSteps}
        onTriggerChange={setTrigger}
      />

      {showTestPanel && (
        <AutomationTestPanel
          automationId={automationId}
          automationName={name}
          onClose={() => setShowTestPanel(false)}
        />
      )}
    </div>
  );
}
