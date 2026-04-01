"use client";

import { useRef, useEffect } from "react";
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
} from "lucide-react";

interface FlowAddNodeMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (actionType: string) => void;
}

const nodeOptions = [
  {
    actionType: "SEND_WHATSAPP_AI",
    label: "Send WhatsApp IA",
    description: "Envia mensagem gerada por IA",
    icon: MessageSquare,
    color: "text-green-600 bg-green-50",
  },
  {
    actionType: "SEND_WHATSAPP",
    label: "Send WhatsApp Template",
    description: "Envia mensagem fixa (template)",
    icon: MessageCircle,
    color: "text-green-600 bg-green-50",
  },
  {
    actionType: "SEND_WA_TEMPLATE",
    label: "Enviar Template WABA",
    description: "Envia template aprovado pela Meta (API oficial)",
    icon: MessageCircle,
    color: "text-green-600 bg-green-50",
  },
  {
    actionType: "SEND_EMAIL",
    label: "Enviar Email",
    description: "Envia email (template ou gerado por IA)",
    icon: Mail,
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    actionType: "WAIT",
    label: "Aguardar",
    description: "Espera um tempo antes de continuar",
    icon: Clock,
    color: "text-blue-600 bg-blue-50",
  },
  {
    actionType: "CONDITION",
    label: "Condição",
    description: "Divide o fluxo com base em uma regra",
    icon: GitBranch,
    color: "text-purple-600 bg-purple-50",
  },
  {
    actionType: "WAIT_FOR_RESPONSE",
    label: "Aguardar Resposta",
    description: "Se após X horas sem resposta...",
    icon: Hourglass,
    color: "text-amber-600 bg-amber-50",
  },
  {
    actionType: "MOVE_PIPELINE_STAGE",
    label: "Mover etapa",
    description: "Move o lead para outra etapa do funil",
    icon: ArrowRightLeft,
    color: "text-orange-600 bg-orange-50",
  },
  {
    actionType: "ADD_TAG",
    label: "Adicionar tag",
    description: "Adiciona uma tag ao lead",
    icon: Tag,
    color: "text-cyan-600 bg-cyan-50",
  },
  {
    actionType: "REMOVE_TAG",
    label: "Remover tag",
    description: "Remove uma tag do lead",
    icon: X,
    color: "text-gray-600 bg-gray-100",
  },
  {
    actionType: "MARK_LOST",
    label: "Marcar como perda",
    description: "Marca o lead como perdido",
    icon: XCircle,
    color: "text-red-600 bg-red-50",
  },
];

export default function FlowAddNodeMenu({
  open,
  onClose,
  onSelect,
}: FlowAddNodeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-2"
    >
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Adicionar etapa
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {nodeOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.actionType}
              onClick={() => {
                onSelect(option.actionType);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${option.color}`}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {option.label}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
