"use client";

import { useState } from "react";
import { ChevronDown, CheckCircle2, Circle, Pencil, Calendar, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import clsx from "clsx";

export type TimelineEventType =
  | "NOTE"
  | "STAGE_CHANGE"
  | "STATUS_CHANGE"
  | "TASK_COMPLETED"
  | "DEAL_CREATED"
  | "EMAIL"
  | "CALL"
  | "MEETING";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  content: string;
  date: string | Date;
  user?: string;
}

export interface PendingTask {
  id: string;
  title: string;
  dueDate?: string | Date;
  type: string;
  done: boolean;
}

interface DealTimelineProps {
  events: TimelineEvent[];
  onAddNote?: (note: string) => void;
  pendingTasks?: PendingTask[];
  onToggleTask?: (id: string) => void;
  onEditTask?: (task: PendingTask) => void;
}

function eventLabel(type: TimelineEventType, content: string, user?: string): React.ReactNode {
  const userName = user && user !== "Sistema" ? user : null;

  switch (type) {
    case "DEAL_CREATED":
      return (
        <span className="text-sm text-gray-700">
          {content}
        </span>
      );
    case "STAGE_CHANGE":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    case "STATUS_CHANGE":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    case "NOTE":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " adicionou uma anotação: "}
          {!userName && "Anotação: "}
          <span className="text-gray-600 whitespace-pre-wrap">{content}</span>
        </span>
      );
    case "TASK_COMPLETED":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    case "EMAIL":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    case "CALL":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    case "MEETING":
      return (
        <span className="text-sm text-gray-700">
          {userName && <strong className="font-semibold text-gray-900">{userName}</strong>}
          {userName && " "}
          {content}
        </span>
      );
    default:
      return <span className="text-sm text-gray-700">{content}</span>;
  }
}

const FILTER_OPTIONS = [
  { value: "all", label: "Todos os eventos" },
  { value: "NOTE", label: "Anotações" },
  { value: "STAGE_CHANGE", label: "Mudanças de etapa" },
  { value: "CALL", label: "Ligações" },
  { value: "EMAIL", label: "E-mails" },
  { value: "MEETING", label: "Reuniões" },
  { value: "TASK_COMPLETED", label: "Tarefas" },
];

const TASK_TYPE_LABELS: Record<string, string> = {
  CALL: "Ligação",
  MEETING: "Reunião",
  PROPOSAL: "Proposta",
  EMAIL: "Email",
  VISIT: "Visita",
  OTHER: "Outro",
};

const TASK_TYPE_COLORS: Record<string, string> = {
  CALL: "bg-orange-100 text-orange-700",
  MEETING: "bg-blue-100 text-blue-700",
  PROPOSAL: "bg-purple-100 text-purple-700",
  EMAIL: "bg-cyan-100 text-cyan-700",
  VISIT: "bg-green-100 text-green-700",
  OTHER: "bg-gray-100 text-gray-600",
};

function taskUrgencyBadge(dueDate?: string | Date) {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  let badgeBg = "bg-gray-100 text-gray-600";
  let badgeText = `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`;

  if (due.getTime() < today.getTime()) {
    badgeBg = "bg-red-100 text-red-700";
    badgeText = "Atrasada";
  } else if (due.getTime() === today.getTime()) {
    badgeBg = "bg-orange-100 text-orange-700";
    badgeText = "Hoje";
  } else if (due.getTime() === tomorrow.getTime()) {
    badgeBg = "bg-green-100 text-green-700";
    badgeText = "Amanhã";
  }

  return { badgeBg, badgeText };
}

function formatTaskDateTime(dueDate: string | Date): string {
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 12 && minutes === 0) {
    // Noon UTC = date-only task (no time set)
    return `${day}/${month}/${year}`;
  }
  return `${day}/${month}/${year} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function DealTimeline({ events, onAddNote, pendingTasks, onToggleTask, onEditTask }: DealTimelineProps) {
  const [note, setNote] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const filtered =
    filterType === "all"
      ? events
      : events.filter((e) => e.type === filterType);

  const handleSubmit = () => {
    if (!note.trim()) return;
    onAddNote?.(note.trim());
    setNote("");
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Do: CRM BGPGO</span>
          <span className="text-gray-300">|</span>
          <div className="relative">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-md pl-2 pr-6 py-1 appearance-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Add note button inline */}
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("timeline-note-input");
            el?.focus();
          }}
          className="text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-md transition-colors"
        >
          + Criar anotação
        </button>
      </div>

      {/* Pending tasks */}
      {pendingTasks && pendingTasks.length > 0 && (
        <div className="mb-4 border border-amber-200 rounded-lg bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800 mb-2">Tarefas pendentes</p>
          <div className="space-y-2">
            {pendingTasks.map((task) => {
              const urgency = taskUrgencyBadge(task.dueDate);
              return (
                <div key={task.id} className="flex items-start gap-2 bg-white/60 rounded-md p-2 border border-amber-100">
                  {/* Toggle button */}
                  <button
                    type="button"
                    onClick={() => onToggleTask?.(task.id)}
                    className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                    title="Concluir tarefa"
                  >
                    <Circle size={16} />
                  </button>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800 truncate">{task.title}</span>
                      <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0", TASK_TYPE_COLORS[task.type] || TASK_TYPE_COLORS.OTHER)}>
                        {TASK_TYPE_LABELS[task.type] || task.type}
                      </span>
                    </div>
                    {task.dueDate && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar size={10} />
                          {formatTaskDateTime(task.dueDate)}
                        </span>
                        {urgency && (
                          <span className={clsx("text-[10px] font-medium px-1.5 py-0.5 rounded", urgency.badgeBg)}>
                            {urgency.badgeText}
                          </span>
                        )}
                      </div>
                    )}
                    {!task.dueDate && (
                      <span className="text-xs text-gray-400 mt-1 inline-block">Sem prazo definido</span>
                    )}
                  </div>

                  {/* Edit button */}
                  <button
                    type="button"
                    onClick={() => onEditTask?.(task)}
                    className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors"
                    title="Editar tarefa"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add note area */}
      <div className="border border-gray-200 rounded-lg overflow-hidden mb-5 bg-white shadow-sm">
        <textarea
          id="timeline-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Escreva uma anotação sobre esta negociação..."
          rows={2}
          className="w-full px-3 py-2.5 text-sm resize-none focus:outline-none placeholder:text-gray-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
          }}
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="text-xs text-gray-400">Ctrl + Enter para salvar</span>
          <button
            onClick={handleSubmit}
            disabled={!note.trim()}
            className="px-3 py-1 text-xs bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Salvar anotação
          </button>
        </div>
      </div>

      {/* Events list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">Nenhum evento encontrado.</p>
      ) : (
        <div className="relative">
          {/* Vertical line — roxa contínua */}
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-violet-200" />

          <div className="space-y-0">
            {filtered.map((event, idx) => {
              const isCreated = event.type === "DEAL_CREATED";
              const isLast = idx === filtered.length - 1;

              return (
                <div key={event.id} className="flex gap-3 relative pb-4 last:pb-0">
                  {/* Dot */}
                  <div className="flex-shrink-0 mt-1 relative z-10">
                    <div
                      className={clsx(
                        "w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center",
                        isCreated
                          ? "bg-pink-500 border-pink-400"
                          : "bg-white border-violet-400"
                      )}
                    >
                      {isCreated ? (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="leading-snug">
                      {eventLabel(event.type, event.content, event.user)}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDateTime(event.date)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
