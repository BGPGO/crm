"use client";

import { useState } from "react";
import {
  Tag,
  X,
  Mail,
  MessageCircle,
  Clock,
  Edit3,
  ArrowRight,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import ActionConfig from "@/components/marketing/ActionConfig";

export interface Step {
  id?: string;
  order: number;
  actionType: string;
  config: any;
  nextStepId?: string;
  trueStepId?: string;
  falseStepId?: string;
}

interface FlowStepCardProps {
  step: Step;
  onUpdate: (step: Step) => void;
  onDelete: () => void;
  readOnly?: boolean;
}

const ACTION_META: Record<
  string,
  { label: string; icon: typeof Tag; color: string; bg: string }
> = {
  ADD_TAG: {
    label: "Adicionar Tag",
    icon: Tag,
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
  },
  REMOVE_TAG: {
    label: "Remover Tag",
    icon: X,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
  },
  SEND_EMAIL: {
    label: "Enviar Email",
    icon: Mail,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
  SEND_WHATSAPP: {
    label: "Enviar WhatsApp",
    icon: MessageCircle,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  WAIT: {
    label: "Aguardar",
    icon: Clock,
    color: "text-yellow-600",
    bg: "bg-yellow-50 border-yellow-200",
  },
  UPDATE_FIELD: {
    label: "Atualizar Campo",
    icon: Edit3,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
  },
  MOVE_PIPELINE_STAGE: {
    label: "Mover Etapa",
    icon: ArrowRight,
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
  },
  CONDITION: {
    label: "Condição",
    icon: GitBranch,
    color: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-200",
  },
};

function getConfigSummary(actionType: string, config: any): string {
  if (!config) return "";
  switch (actionType) {
    case "ADD_TAG":
    case "REMOVE_TAG":
      return config.tagId ? `Tag: ${config.tagId}` : "";
    case "SEND_EMAIL":
      return config.templateId ? `Template: ${config.templateId}` : "";
    case "SEND_WHATSAPP":
      if (config.mode === "custom") return config.customMessage ? `Msg: ${config.customMessage.slice(0, 40)}...` : "";
      return config.messageTemplateId ? `Modelo: ${config.messageTemplateId}` : "";
    case "WAIT": {
      const unitLabels: Record<string, string> = {
        minutes: "min",
        hours: "h",
        days: "dias",
      };
      return config.duration
        ? `${config.duration} ${unitLabels[config.unit] ?? config.unit ?? "h"}`
        : "";
    }
    case "UPDATE_FIELD":
      return config.fieldName
        ? `${config.fieldName} = ${config.fieldValue ?? ""}`
        : "";
    case "MOVE_PIPELINE_STAGE":
      return config.stageId ? `Etapa: ${config.stageId}` : "";
    case "CONDITION":
      return config.field
        ? `${config.field} ${config.operator ?? ""} ${config.value ?? ""}`
        : "";
    default:
      return "";
  }
}

export default function FlowStepCard({
  step,
  onUpdate,
  onDelete,
  readOnly = false,
}: FlowStepCardProps) {
  const [expanded, setExpanded] = useState(false);

  const meta = ACTION_META[step.actionType] ?? {
    label: step.actionType,
    icon: Edit3,
    color: "text-gray-600",
    bg: "bg-gray-50 border-gray-200",
  };

  const Icon = meta.icon;
  const summary = getConfigSummary(step.actionType, step.config);

  return (
    <div
      className={`rounded-lg border ${meta.bg} transition-shadow ${
        expanded ? "shadow-md" : "shadow-sm"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-lg ${meta.color} bg-white border border-current/20`}
        >
          <Icon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {meta.label}
            </span>
            <span className="text-xs text-gray-400">#{step.order + 1}</span>
          </div>
          {summary && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{summary}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Remover passo"
            >
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200/60">
          {readOnly ? (
            <div className="text-sm text-gray-600">
              {summary || "Sem configuração"}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Action type selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Tipo de Ação
                </label>
                <select
                  value={step.actionType}
                  onChange={(e) =>
                    onUpdate({
                      ...step,
                      actionType: e.target.value,
                      config: {},
                    })
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {Object.entries(ACTION_META).map(([key, m]) => (
                    <option key={key} value={key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action config */}
              <ActionConfig
                actionType={step.actionType}
                config={step.config}
                onChange={(newConfig) =>
                  onUpdate({ ...step, config: newConfig })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
