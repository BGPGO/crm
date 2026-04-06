"use client";

import React from "react";
import { Draggable } from "@hello-pangea/dnd";
import { Star, User, Plus, MessageCircle, Calendar, PhoneOff } from "lucide-react";
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
  classification?: number;
  createdAt?: string;
  hasWhatsAppConversation?: boolean;
  hasWabaConversation?: boolean;
  phoneInvalid?: boolean;
  nextTask?: { id: string; title: string; dueDate?: string; type: string } | null;
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
            {/* Top row: status badge + phone invalid */}
            <div className="flex items-start justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <StatusBadge status={deal.status} />
                {deal.phoneInvalid && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded"
                    title="Telefone invalido — numero nao possui WhatsApp"
                  >
                    <PhoneOff size={10} />
                    Tel. invalido
                  </span>
                )}
              </div>
            </div>

            {/* Deal title */}
            <h4 className="text-sm font-semibold text-gray-900 leading-snug mb-0.5 group-hover:text-blue-600 transition-colors flex items-center gap-1">
              {deal.title}
              {deal.hasWabaConversation && (
                <span
                  className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex-shrink-0"
                  title="Conversa WhatsApp Oficial (WABA)"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600 dark:text-emerald-400">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.613.613l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.354 0-4.542-.726-6.347-1.965l-.244-.168-3.151 1.056 1.056-3.151-.168-.244A9.956 9.956 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                  </svg>
                </span>
              )}
              {!deal.hasWabaConversation && deal.hasWhatsAppConversation && (
                <span
                  className="inline-flex items-center justify-center w-[16px] h-[16px] rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0"
                  title="Conversa Z-API (legado)"
                >
                  <MessageCircle size={10} className="text-gray-400 dark:text-gray-500" />
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

            {/* Next task row */}
            {deal.nextTask && (() => {
              const now = new Date();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              const rawDueDate = deal.nextTask.dueDate ? new Date(deal.nextTask.dueDate) : null;
              const dueDateDay = rawDueDate ? new Date(rawDueDate) : null;
              if (dueDateDay) dueDateDay.setHours(0, 0, 0, 0);

              const isOverdue = rawDueDate ? rawDueDate.getTime() < now.getTime() : false;
              const isToday = dueDateDay ? dueDateDay.getTime() === today.getTime() : false;
              const isTomorrow = dueDateDay ? dueDateDay.getTime() === tomorrow.getTime() : false;

              let badgeBg = "bg-gray-100 text-gray-600";
              let badgeText = dueDateDay
                ? `${String(dueDateDay.getDate()).padStart(2, "0")}/${String(dueDateDay.getMonth() + 1).padStart(2, "0")}`
                : "";

              // Format time part (HH:mm)
              const timeStr = rawDueDate
                ? `${String(rawDueDate.getHours()).padStart(2, "0")}:${String(rawDueDate.getMinutes()).padStart(2, "0")}`
                : null;
              const hasTime = timeStr && timeStr !== "00:00" && timeStr !== "12:00";

              if (dueDateDay) {
                if (isOverdue && !isToday) {
                  badgeBg = "bg-red-100 text-red-700";
                  badgeText = "Atrasada";
                } else if (isToday && isOverdue) {
                  badgeBg = "bg-red-100 text-red-700";
                  badgeText = hasTime ? `Hoje ${timeStr}` : "Hoje";
                } else if (isToday) {
                  badgeBg = "bg-orange-100 text-orange-700";
                  badgeText = hasTime ? `Hoje ${timeStr}` : "Hoje";
                } else if (isTomorrow) {
                  badgeBg = "bg-green-100 text-green-700";
                  badgeText = hasTime ? `Amanhã ${timeStr}` : "Amanhã";
                } else {
                  // Future date: show date + time
                  if (hasTime) {
                    badgeText = `${badgeText} ${timeStr}`;
                  }
                }
              }

              return (
                <div className={clsx(
                  "flex items-center gap-1.5 text-xs mb-2",
                  isOverdue ? "text-red-500" : "text-gray-500"
                )}>
                  <Calendar size={11} className={clsx("flex-shrink-0", isOverdue ? "text-red-400" : "text-gray-400")} />
                  <span className="truncate flex-1">{deal.nextTask.title}</span>
                  {badgeText && (
                    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0", badgeBg)}>
                      {badgeText}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Metrics row: contact count + value */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-0.5">
                <Star size={11} className={(deal.classification ?? 0) > 0 ? "text-yellow-400" : "text-gray-400"} />
                {deal.classification ?? 0}
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

          {/* Create task row — only if no pending task */}
          {!deal.nextTask && (
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
          )}
        </div>
      )}
    </Draggable>
  );
});

export default DealCard;
