"use client";

import { ArrowRightLeft, Tag, UserPlus, FileText, Calendar, Pencil, Trash2, Play, Pause, Zap, Users, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

interface AutomationCardProps {
  automation: {
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
    triggerType: string;
    triggerConfig?: any;
    _count?: { steps: number; enrollments: number };
    createdAt: string;
  };
  isCadence?: boolean;
  onActivate: (id: string) => void;
  onPause: (id: string) => void;
  onDelete: (id: string) => void;
  onViewEnrollments: (id: string, name: string) => void;
}

const triggerLabels: Record<string, { label: string; icon: typeof Zap }> = {
  STAGE_CHANGED: { label: "Mudança de etapa", icon: ArrowRightLeft },
  TAG_ADDED: { label: "Tag adicionada", icon: Tag },
  TAG_REMOVED: { label: "Tag removida", icon: Tag },
  CONTACT_CREATED: { label: "Contato criado", icon: UserPlus },
  FIELD_UPDATED: { label: "Campo atualizado", icon: FileText },
  DATE_BASED: { label: "Baseado em data", icon: Calendar },
};

const statusConfig: Record<string, { label: string; classes: string; dot?: string }> = {
  DRAFT: { label: "Rascunho", classes: "bg-gray-100 text-gray-600" },
  ACTIVE: { label: "Ativa", classes: "bg-green-100 text-green-700", dot: "bg-green-500 animate-pulse" },
  PAUSED: { label: "Pausada", classes: "bg-yellow-100 text-yellow-700" },
  ARCHIVED: { label: "Arquivada", classes: "bg-gray-100 text-gray-500 line-through" },
};

export default function AutomationCard({
  automation,
  isCadence,
  onActivate,
  onPause,
  onDelete,
  onViewEnrollments,
}: AutomationCardProps) {
  const router = useRouter();
  const trigger = triggerLabels[automation.triggerType] || { label: automation.triggerType, icon: Zap };
  const TriggerIcon = trigger.icon;
  const status = statusConfig[automation.status] || statusConfig.DRAFT;
  const stepCount = automation._count?.steps ?? 0;
  const enrollmentCount = automation._count?.enrollments ?? 0;
  const canDelete = automation.status === "DRAFT" || automation.status === "ARCHIVED";
  const isActive = automation.status === "ACTIVE";
  const canToggle = automation.status === "ACTIVE" || automation.status === "PAUSED" || automation.status === "DRAFT";
  const hasNoSteps = stepCount === 0;

  return (
    <Card
      padding="none"
      className="flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => router.push(`/conversas/automacoes/${automation.id}`)}
    >
      <div className="p-4 space-y-3">
        {/* Header: name + badges */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className={clsx(
              "text-sm font-semibold text-gray-900 leading-tight",
              automation.status === "ARCHIVED" && "line-through text-gray-400"
            )}
          >
            {automation.name}
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isCadence && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                Cadência
              </span>
            )}
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
                status.classes
              )}
            >
              {status.dot && <span className={clsx("w-1.5 h-1.5 rounded-full", status.dot)} />}
              {status.label}
            </span>
          </div>
        </div>

        {/* Aviso: sem etapas configuradas */}
        {hasNoSteps && automation.status !== "ARCHIVED" && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg">
            <AlertTriangle size={12} className="flex-shrink-0" />
            <span>Sem etapas configuradas — automação não vai executar</span>
          </div>
        )}

        {/* Trigger type */}
        <div className="flex items-center gap-2 text-gray-500">
          <TriggerIcon size={14} className="flex-shrink-0" />
          <span className="text-xs">{trigger.label}</span>
        </div>

        {/* Counts */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{stepCount} etapa{stepCount !== 1 ? "s" : ""}</span>
          {enrollmentCount > 0 && (
            <span>{enrollmentCount} contato{enrollmentCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          {canToggle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (isActive ? onPause(automation.id) : onActivate(automation.id))}
              title={isActive ? "Pausar" : "Ativar"}
            >
              {isActive ? <Pause size={14} /> : <Play size={14} />}
              <span className="hidden sm:inline">{isActive ? "Pausar" : "Ativar"}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewEnrollments(automation.id, automation.name)}
            title="Ver inscritos"
          >
            <Users size={14} />
            {enrollmentCount > 0 && (
              <span className="text-xs text-gray-500">{enrollmentCount}</span>
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/conversas/automacoes/${automation.id}`)}
            title="Editar"
          >
            <Pencil size={14} />
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(automation.id)}
              title="Excluir"
              className="text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
