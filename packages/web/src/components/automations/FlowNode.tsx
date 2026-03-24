"use client";

import { useState } from "react";
import {
  MessageSquare,
  MessageCircle,
  Mail,
  Clock,
  GitBranch,
  ArrowRightLeft,
  Tag,
  X,
  XCircle,
  Hourglass,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

interface FlowNodeProps {
  id: string;
  actionType: string;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

const nodeTypeConfig: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
    borderColor: string;
    iconBg: string;
    iconColor: string;
  }
> = {
  SEND_WHATSAPP_AI: {
    label: "WhatsApp IA",
    icon: MessageSquare,
    borderColor: "border-l-green-500",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
  },
  SEND_WHATSAPP: {
    label: "WhatsApp Template",
    icon: MessageCircle,
    borderColor: "border-l-green-500",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
  },
  SEND_EMAIL: {
    label: "Enviar Email",
    icon: Mail,
    borderColor: "border-l-indigo-500",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
  },
  WAIT: {
    label: "Aguardar",
    icon: Clock,
    borderColor: "border-l-blue-500",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  CONDITION: {
    label: "Condição",
    icon: GitBranch,
    borderColor: "border-l-purple-500",
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
  MOVE_PIPELINE_STAGE: {
    label: "Mover etapa",
    icon: ArrowRightLeft,
    borderColor: "border-l-orange-500",
    iconBg: "bg-orange-50",
    iconColor: "text-orange-600",
  },
  ADD_TAG: {
    label: "Adicionar tag",
    icon: Tag,
    borderColor: "border-l-cyan-500",
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  REMOVE_TAG: {
    label: "Remover tag",
    icon: X,
    borderColor: "border-l-cyan-500",
    iconBg: "bg-cyan-50",
    iconColor: "text-cyan-600",
  },
  MARK_LOST: {
    label: "Marcar como perda",
    icon: XCircle,
    borderColor: "border-l-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
  },
  WAIT_FOR_RESPONSE: {
    label: "Aguardar Resposta",
    icon: Hourglass,
    borderColor: "border-l-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
};

export default function FlowNode({
  id,
  actionType,
  config,
  onConfigChange,
  onDelete,
  children,
}: FlowNodeProps) {
  const [collapsed, setCollapsed] = useState(false);

  const typeConfig = nodeTypeConfig[actionType] || {
    label: actionType,
    icon: MessageSquare,
    borderColor: "border-l-gray-400",
    iconBg: "bg-gray-50",
    iconColor: "text-gray-600",
  };

  const Icon = typeConfig.icon;

  return (
    <div
      className={clsx(
        "w-80 bg-white rounded-xl border border-gray-200 shadow-sm border-l-4 overflow-hidden",
        typeConfig.borderColor
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={clsx(
            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
            typeConfig.iconBg,
            typeConfig.iconColor
          )}
        >
          <Icon size={16} />
        </div>
        <span className="text-sm font-medium text-gray-900 flex-1 truncate">
          {typeConfig.label}
        </span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remover"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Collapsible config area */}
      {!collapsed && children && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
