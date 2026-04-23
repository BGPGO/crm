"use client";

import { Calendar, CheckCircle2, Circle } from "lucide-react";
import { formatTaskDate, formatTaskTime, normalizeDueDate, getBRTParts } from "@/lib/taskDateTime";
import PostponeDropdown from "@/components/ui/PostponeDropdown";
import clsx from "clsx";

export type MeetingSource = "CALENDLY_EMAIL" | "CALENDLY_LP" | "SDR_IA" | "HUMANO";

export interface DealTask {
  id: string;
  title: string;
  dueDate?: string | Date;
  dueDateFormat?: string | null;
  type: string;
  done: boolean;
  meetingSource?: MeetingSource | null;
}

interface DealTasksProps {
  tasks: DealTask[];
  onAdd?: () => void;
  onToggle?: (id: string) => void;
  onEdit?: (task: DealTask) => void;
  onPostpone?: (taskId: string, newDate: Date) => void | Promise<void>;
}

const TYPE_COLORS: Record<string, string> = {
  Ligação: "bg-orange-100 text-orange-600",
  Reunião: "bg-blue-100 text-blue-600",
  Proposta: "bg-purple-100 text-purple-600",
  Email: "bg-cyan-100 text-cyan-600",
  Outro: "bg-gray-100 text-gray-600",
};

function taskTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600";
}

const MEETING_SOURCE_CONFIG: Record<
  MeetingSource,
  { label: string; className: string }
> = {
  SDR_IA:         { label: "SDR IA",  className: "bg-green-100 text-green-700" },
  CALENDLY_EMAIL: { label: "Email",   className: "bg-blue-100 text-blue-700" },
  CALENDLY_LP:    { label: "LP",      className: "bg-purple-100 text-purple-700" },
  HUMANO:         { label: "Humano",  className: "bg-gray-100 text-gray-600" },
};

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
      {/* Ilustração SVG simples */}
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-40"
      >
        <rect x="10" y="14" width="52" height="44" rx="6" fill="#E0E7FF" />
        <rect x="18" y="24" width="24" height="3" rx="1.5" fill="#A5B4FC" />
        <rect x="18" y="32" width="36" height="3" rx="1.5" fill="#C7D2FE" />
        <rect x="18" y="40" width="28" height="3" rx="1.5" fill="#C7D2FE" />
        <circle cx="54" cy="52" r="12" fill="#6366F1" />
        <path
          d="M49 52L53 56L59 48"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm font-medium text-gray-600">Nenhuma tarefa agendada</p>
      <p className="text-xs text-gray-400 max-w-xs">
        Crie tarefas para acompanhar as próximas ações desta negociação.
      </p>
      {onAdd && (
        <button
          onClick={onAdd}
          className="mt-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md transition-colors"
        >
          + Criar tarefa
        </button>
      )}
    </div>
  );
}

const pending = (tasks: DealTask[]) => tasks.filter((t) => !t.done);
const done = (tasks: DealTask[]) => tasks.filter((t) => t.done);

export default function DealTasks({ tasks, onAdd, onToggle, onEdit, onPostpone }: DealTasksProps) {
  const nextTasks = pending(tasks);
  const doneTasks = done(tasks);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">Próximas tarefas</h3>
        {tasks.length > 0 && onAdd && (
          <button
            onClick={onAdd}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            + Criar tarefa
          </button>
        )}
      </div>

      {/* Empty state */}
      {tasks.length === 0 && <EmptyState onAdd={onAdd} />}

      {/* Pending tasks */}
      {nextTasks.length > 0 && (
        <div className="space-y-2">
          {nextTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onPostpone={onPostpone} />
          ))}
        </div>
      )}

      {/* Done tasks */}
      {doneTasks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            Concluídas
          </p>
          <div className="space-y-2">
            {doneTasks.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onPostpone,
}: {
  task: DealTask;
  onToggle?: (id: string) => void;
  onEdit?: (task: DealTask) => void;
  onPostpone?: (taskId: string, newDate: Date) => void | Promise<void>;
}) {
  const now = new Date();
  const normalizedDate = normalizeDueDate(task);
  const isOverdue = !task.done && normalizedDate ? normalizedDate.getTime() < now.getTime() : false;
  const isToday = (() => {
    if (!task.dueDate || task.done) return false;
    const brtParts = getBRTParts(task);
    const todayBrt = getBRTParts({ dueDate: now.toISOString() });
    if (!brtParts || !todayBrt) return false;
    return brtParts.year === todayBrt.year && brtParts.month === todayBrt.month && brtParts.day === todayBrt.day;
  })();

  // Format time part in BRT using the helper (handles LEGACY and UTC formats)
  const timeStr = task.dueDate ? formatTaskTime(task) : null;
  const hasTime = timeStr && timeStr !== "00:00" && timeStr !== "12:00";

  return (
    <div
      className={clsx(
        "flex items-start gap-3 p-3 border rounded-lg transition-colors group",
        task.done
          ? "border-gray-100 bg-gray-50"
          : isOverdue
            ? "border-red-200 bg-red-50 hover:border-red-300"
            : "border-gray-200 bg-white hover:border-blue-200",
        onEdit && "cursor-pointer"
      )}
      onClick={() => onEdit?.(task)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.(task.id);
        }}
        className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors"
      >
        {task.done ? (
          <CheckCircle2 size={18} className="text-green-500" />
        ) : (
          <Circle size={18} />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            "text-sm font-medium",
            task.done
              ? "line-through text-gray-400"
              : isOverdue
                ? "text-red-600"
                : "text-gray-800 group-hover:text-blue-600"
          )}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span
            className={clsx(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              taskTypeColor(task.type)
            )}
          >
            {task.type}
          </span>
          {task.meetingSource && task.type === "MEETING" && (() => {
            const cfg = MEETING_SOURCE_CONFIG[task.meetingSource];
            return cfg ? (
              <span
                className={clsx("text-xs font-medium px-1.5 py-0.5 rounded", cfg.className)}
                title="Origem da reunião"
              >
                {cfg.label}
              </span>
            ) : null;
          })()}
          {task.dueDate && (
            <span className={clsx(
              "flex items-center gap-1 text-xs",
              isOverdue ? "text-red-500 font-semibold" : isToday ? "text-orange-600 font-medium" : "text-gray-400"
            )}>
              <Calendar size={11} />
              {formatTaskDate(task)}
              {hasTime && (
                <span className={clsx(isOverdue ? "text-red-500" : isToday ? "text-orange-600" : "text-gray-500")}>
                  {timeStr}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Postpone button — only for pending tasks */}
      {!task.done && onPostpone && (
        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <PostponeDropdown
            currentDueDate={task.dueDate}
            onPostpone={(newDate) => onPostpone(task.id, newDate)}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}
