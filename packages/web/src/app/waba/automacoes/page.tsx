"use client";

import { useEffect, useState } from "react";
import {
  Workflow,
  Play,
  Pause,
  Clock,
  Users,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";

interface AutomationStep {
  id: string;
  order: number;
  actionType: string;
  config: Record<string, any>;
}

interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, any>;
  steps: AutomationStep[];
  _count?: { enrollments: number };
  enrollments?: Array<{ status: string }>;
  createdAt: string;
}

export default function WabaAutomacoesPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchAutomations();
  }, []);

  async function fetchAutomations() {
    try {
      const res = await api.get<{ data: Automation[] }>("/automations?includeSteps=true&limit=50");
      const allAutomations = res.data || [];
      // Mostrar todas as automações (unificado — WABA + legado)
      setAutomations(allAutomations);
    } catch (err) {
      console.error("Erro ao buscar automações:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <Play size={12} /> Ativa
          </span>
        );
      case "PAUSED":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
            <Pause size={12} /> Pausada
          </span>
        );
      case "DRAFT":
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
            <Clock size={12} /> Rascunho
          </span>
        );
      default:
        return (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  }

  function getStepIcon(actionType: string) {
    switch (actionType) {
      case "SEND_WA_TEMPLATE":
        return <MessageSquare size={14} className="text-green-600" />;
      case "SEND_WHATSAPP":
      case "SEND_WHATSAPP_AI":
        return <MessageSquare size={14} className="text-amber-500" />;
      case "SEND_EMAIL":
        return <MessageSquare size={14} className="text-blue-500" />;
      case "WAIT":
      case "WAIT_FOR_RESPONSE":
        return <Clock size={14} className="text-blue-500" />;
      case "CONDITION":
        return <AlertCircle size={14} className="text-purple-500" />;
      case "ADD_TAG":
      case "REMOVE_TAG":
        return <CheckCircle2 size={14} className="text-indigo-500" />;
      case "MOVE_PIPELINE_STAGE":
        return <ChevronRight size={14} className="text-teal-500" />;
      case "MARK_LOST":
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <AlertCircle size={14} className="text-gray-400" />;
    }
  }

  function isWabaAutomation(automation: Automation): boolean {
    return automation.name.toUpperCase().includes("WABA") ||
      (automation.steps || []).some((s) => s.actionType === "SEND_WA_TEMPLATE");
  }

  function formatStepLabel(step: AutomationStep) {
    const config = step.config || {};
    switch (step.actionType) {
      case "SEND_WA_TEMPLATE":
        return config._label || config.templateName || "Template WABA";
      case "SEND_WHATSAPP":
        return config._label || "Enviar WhatsApp (Z-API)";
      case "SEND_WHATSAPP_AI":
        return config._label || "Enviar WhatsApp IA (Z-API)";
      case "SEND_EMAIL":
        return config._label || "Enviar Email";
      case "WAIT": {
        const d = config.duration;
        const u = config.unit === "days" ? "dia(s)" : config.unit === "hours" ? "hora(s)" : "min";
        return `Aguardar ${d} ${u}`;
      }
      case "WAIT_FOR_RESPONSE":
        return "Aguardar resposta";
      case "CONDITION":
        return config._label || `Condição: ${config.field || "..."}`;
      case "ADD_TAG":
        return config._label || "Adicionar tag";
      case "REMOVE_TAG":
        return config._label || "Remover tag";
      case "MOVE_PIPELINE_STAGE":
        return config._label || "Mover etapa";
      case "UPDATE_FIELD":
        return config._label || "Atualizar campo";
      case "MARK_LOST":
        return config._label || "Marcar como perdido";
      default:
        return config._label || step.actionType;
    }
  }

  function getEnrollmentStats(automation: Automation) {
    const enrollments = automation.enrollments || [];
    const active = enrollments.filter((e) => e.status === "ACTIVE").length;
    const completed = enrollments.filter((e) => e.status === "COMPLETED").length;
    const paused = enrollments.filter((e) => e.status === "PAUSED").length;
    return { active, completed, paused, total: enrollments.length };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Workflow size={24} />
            Automacoes
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cadencias e automacoes de follow-up (WABA + legado)
          </p>
        </div>
        <a
          href="/automations"
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          Ver todas as automacoes <ChevronRight size={14} />
        </a>
      </div>

      {automations.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Workflow size={40} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500">Nenhuma automacao WABA encontrada.</p>
          <p className="text-sm text-gray-400 mt-1">
            Crie automacoes com passos SEND_WA_TEMPLATE para vê-las aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {automations.map((automation) => {
            const expanded = expandedId === automation.id;
            const stats = getEnrollmentStats(automation);
            const templateSteps = (automation.steps || []).filter(
              (s) => s.actionType === "SEND_WA_TEMPLATE"
            );

            return (
              <div
                key={automation.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedId(expanded ? null : automation.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        automation.status === "ACTIVE"
                          ? "bg-green-100 text-green-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Workflow size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {automation.name}
                        {isWabaAutomation(automation) ? (
                          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded font-bold">WABA</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded font-bold">Z-API</span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {templateSteps.length} templates · Trigger:{" "}
                        {automation.triggerConfig?.stageName || automation.triggerType}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {stats.total > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Users size={14} />
                        <span>{stats.active} ativos</span>
                        {stats.completed > 0 && (
                          <span className="text-green-600">· {stats.completed} concluidos</span>
                        )}
                      </div>
                    )}
                    {getStatusBadge(automation.status)}
                    <ChevronRight
                      size={16}
                      className={`text-gray-400 transition-transform ${
                        expanded ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded content */}
                {expanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-850">
                    {automation.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {automation.description}
                      </p>
                    )}

                    {/* Steps timeline */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Fluxo de passos
                      </h4>
                      {(automation.steps || [])
                        .sort((a, b) => a.order - b.order)
                        .map((step, idx) => (
                          <div key={step.id} className="flex items-center gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-7 h-7 rounded-full bg-white dark:bg-gray-800 border border-gray-200 flex items-center justify-center">
                                {getStepIcon(step.actionType)}
                              </div>
                              {idx < (automation.steps || []).length - 1 && (
                                <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
                              )}
                            </div>
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {formatStepLabel(step)}
                              </span>
                              <span className="text-xs text-gray-400">
                                {step.actionType === "SEND_WA_TEMPLATE" &&
                                  step.config?.templateName && (
                                    <code className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">
                                      {step.config.templateName}
                                    </code>
                                  )}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Link to full editor */}
                    <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <a
                        href={`/automations/${automation.id}`}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        Abrir no editor de automacoes <ChevronRight size={14} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Flow explanation */}
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
          Como funciona o fluxo WABA
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-400 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Lead responde</strong> na etapa "Lead" ou "Contato Feito" → move automaticamente para "Marcar Reuniao"
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Bia tenta agendar</strong> por 24h via conversa (janela aberta). Se nao agendar, cadencia de templates ativa.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Reuniao marcada</strong> → move para "Reuniao Agendada", cancela cadencia anterior, envia confirmacao.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Sem resposta apos 7 dias</strong> → marca como perdido automaticamente.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
