"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Star, User, Info, Plus, Calendar } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import clsx from "clsx";

export interface Deal {
  id: string;
  title: string;
  value: number;
  contact: string;
  company?: string;
  daysInStage: number;
  probability?: number;
  status?: "active" | "won" | "lost";
  nextActivity?: {
    label: string;
    date: string;
    type: "task" | "meeting" | "other";
  };
  qualificationCount?: number;
  contactCount?: number;
}

interface DealCardProps {
  deal: Deal;
  index: number;
}

function StatusBadge({ status }: { status?: Deal["status"] }) {
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-sm bg-green-500 inline-block" />
        Ganha
      </span>
    );
  }
  if (status === "lost") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-sm bg-red-500 inline-block" />
        Perdida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
      <span className="w-1.5 h-1.5 rounded-sm bg-blue-500 inline-block" />
      Em andamento
    </span>
  );
}

function activityBg(type: "task" | "meeting" | "other") {
  if (type === "meeting") return "bg-purple-100 text-purple-700";
  if (type === "task") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-600";
}

export default function DealCard({ deal, index }: DealCardProps) {
  const router = useRouter();

  const qualCount = deal.qualificationCount ?? 0;
  const contactCount = deal.contactCount ?? 1;

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={clsx(
            "bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer select-none group",
            "hover:border-gray-300 hover:shadow-md transition-all duration-150",
            snapshot.isDragging && "shadow-lg rotate-1 border-blue-300 opacity-90"
          )}
        >
          {/* Card body */}
          <div
            className="p-3"
            onClick={() => router.push(`/pipeline/${deal.id}`)}
          >
            {/* Top row: status badge + info icon */}
            <div className="flex items-start justify-between mb-1.5">
              <StatusBadge status={deal.status} />
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
              >
                <Info size={13} />
              </button>
            </div>

            {/* Deal title */}
            <h4 className="text-sm font-semibold text-gray-900 leading-snug mb-0.5 group-hover:text-blue-600 transition-colors">
              {deal.title}
            </h4>

            {/* Company name */}
            {deal.company && (
              <p className="text-xs text-gray-400 mb-2">{deal.company}</p>
            )}

            {/* Metrics row: qualification, contact, value */}
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
              <span className="flex items-center gap-0.5">
                <Star size={11} className="text-gray-400" />
                {qualCount}
              </span>
              <span className="flex items-center gap-0.5">
                <User size={11} className="text-gray-400" />
                {contactCount}
              </span>
              <span className="font-semibold text-gray-700 ml-auto">
                {formatCurrency(deal.value)}
              </span>
            </div>

            {/* Next activity */}
            {deal.nextActivity && (
              <div
                className={clsx(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded mb-1 font-medium",
                  activityBg(deal.nextActivity.type)
                )}
              >
                <Calendar size={11} className="flex-shrink-0" />
                <span className="truncate">
                  {deal.nextActivity.label} {deal.nextActivity.date}
                </span>
              </div>
            )}
          </div>

          {/* Create task row */}
          <div className="border-t border-gray-100 px-3 py-1.5">
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Plus size={11} />
              Criar Tarefa
            </button>
          </div>
        </div>
      )}
    </Draggable>
  );
}
