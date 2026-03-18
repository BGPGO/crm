"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Star, User, Plus, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/formatters";
import clsx from "clsx";

// Shape returned by GET /api/pipelines/:id (deals array)
export interface Deal {
  id: string;
  title: string;
  value: number;
  status: "OPEN" | "WON" | "LOST";
  contact?: { id: string; name: string } | null;
  organization?: { id: string; name: string } | null;
  user?: { id: string; name: string } | null;
  stage: { id: string; name: string };
  dealContacts?: Array<{ contact: { id: string; name: string } }>;
  createdAt?: string;
  hasWhatsAppConversation?: boolean;
}

interface DealCardProps {
  deal: Deal;
  index: number;
}

function StatusBadge({ status }: { status: Deal["status"] }) {
  if (status === "WON") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-sm bg-green-500 inline-block" />
        Ganha
      </span>
    );
  }
  if (status === "LOST") {
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

const DealCard = React.memo(function DealCard({ deal, index }: DealCardProps) {
  const router = useRouter();

  // Primary contact name: prefer `contact`, fall back to first dealContact
  const contactName =
    deal.contact?.name ??
    deal.dealContacts?.[0]?.contact?.name ??
    null;

  const contactCount = deal.dealContacts?.length ?? (deal.contact ? 1 : 0);
  const companyName = deal.organization?.name ?? null;

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
            onMouseDown={(e) => { if (e.button === 1) { e.preventDefault(); window.open(`/pipeline/${deal.id}`, '_blank'); } }}
          >
            {/* Top row: status badge */}
            <div className="flex items-start justify-between mb-1.5">
              <StatusBadge status={deal.status} />
            </div>

            {/* Deal title */}
            <h4 className="text-sm font-semibold text-gray-900 leading-snug mb-0.5 group-hover:text-blue-600 transition-colors flex items-center gap-1">
              {deal.title}
              {deal.hasWhatsAppConversation && (
                <span className="text-green-500" title="Conversa WhatsApp ativa">
                  <MessageCircle size={12} />
                </span>
              )}
            </h4>

            {/* Company name */}
            {companyName && (
              <p className="text-xs text-gray-400 mb-2">{companyName}</p>
            )}

            {/* Contact name */}
            {contactName && (
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                <User size={11} className="text-gray-400 flex-shrink-0" />
                {contactName}
              </p>
            )}

            {/* Metrics row: contact count + value */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-0.5">
                <Star size={11} className="text-gray-400" />
                0
              </span>
              <span className="flex items-center gap-0.5">
                <User size={11} className="text-gray-400" />
                {contactCount}
              </span>
              <span className="font-semibold text-gray-700 ml-auto">
                {formatCurrency(deal.value ?? 0)}
              </span>
            </div>
          </div>

          {/* Create task row */}
          <div className="border-t border-gray-100 px-3 py-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/pipeline/${deal.id}?tab=tarefas`);
              }}
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
});

export default DealCard;
