"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, Phone, Mail, Calendar, MessageSquare, CheckCircle, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { api } from "@/lib/api";
import clsx from "clsx";

type ApiTaskType = "CALL" | "EMAIL" | "MEETING" | "NOTE";
type ApiTaskStatus = "PENDING" | "COMPLETED" | "OVERDUE";
type FilterTab = "ALL" | "PENDING" | "COMPLETED" | "OVERDUE";

interface Deal {
  id: string;
  title: string;
}

interface User {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  type: ApiTaskType;
  dueDate: string | null;
  status: ApiTaskStatus;
  completedAt: string | null;
  user: User;
  deal: Deal | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface TasksResponse {
  data: Task[];
  meta: Meta;
}

interface TaskCounts {
  ALL: number;
  PENDING: number;
  COMPLETED: number;
  OVERDUE: number;
}

interface NewTaskForm {
  title: string;
  type: ApiTaskType;
  dueDate: string;
}

const typeIcons: Record<ApiTaskType, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  NOTE: MessageSquare,
};

const typeLabels: Record<ApiTaskType, string> = {
  CALL: "Ligação",
  EMAIL: "E-mail",
  MEETING: "Reunião",
  NOTE: "Nota",
};

const typeColors: Record<ApiTaskType, string> = {
  CALL: "text-blue-600 bg-blue-100",
  EMAIL: "text-green-600 bg-green-100",
  MEETING: "text-purple-600 bg-purple-100",
  NOTE: "text-orange-600 bg-orange-100",
};

const statusConfig: Record<ApiTaskStatus, { label: string; variant: "green" | "yellow" | "red" | "gray" }> = {
  PENDING: { label: "Pendente", variant: "yellow" },
  COMPLETED: { label: "Concluída", variant: "green" },
  OVERDUE: { label: "Atrasada", variant: "red" },
};

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "PENDING", label: "Pendentes" },
  { key: "COMPLETED", label: "Concluídas" },
  { key: "OVERDUE", label: "Atrasadas" },
];

const TASK_TYPES: { value: ApiTaskType; label: string }[] = [
  { value: "CALL", label: "Ligação" },
  { value: "EMAIL", label: "E-mail" },
  { value: "MEETING", label: "Reunião" },
  { value: "NOTE", label: "Nota" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [counts, setCounts] = useState<TaskCounts>({ ALL: 0, PENDING: 0, COMPLETED: 0, OVERDUE: 0 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [defaultUserId, setDefaultUserId] = useState<string>("");
  const [form, setForm] = useState<NewTaskForm>({ title: "", type: "CALL", dueDate: "" });

  const fetchTasks = useCallback(async (currentPage: number, filter: FilterTab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (filter !== "ALL") params.set("status", filter);
      const result = await api.get<TasksResponse>(`/tasks?${params.toString()}`);
      setTasks(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar tarefas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const [all, pending, completed, overdue] = await Promise.all([
        api.get<TasksResponse>("/tasks?limit=1"),
        api.get<TasksResponse>("/tasks?limit=1&status=PENDING"),
        api.get<TasksResponse>("/tasks?limit=1&status=COMPLETED"),
        api.get<TasksResponse>("/tasks?limit=1&status=OVERDUE"),
      ]);
      setCounts({
        ALL: all.meta.total,
        PENDING: pending.meta.total,
        COMPLETED: completed.meta.total,
        OVERDUE: overdue.meta.total,
      });
    } catch (err) {
      console.error("Erro ao buscar contagens:", err);
    }
  }, []);

  const fetchDefaultUser = useCallback(async () => {
    try {
      const result = await api.get<{ data: User[] }>("/users");
      if (result.data.length > 0) {
        setDefaultUserId(result.data[0].id);
      }
    } catch (err) {
      console.error("Erro ao buscar usuários:", err);
    }
  }, []);

  useEffect(() => {
    fetchDefaultUser();
    fetchCounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTasks(page, activeFilter);
  }, [page, activeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (filter: FilterTab) => {
    setActiveFilter(filter);
    setPage(1);
  };

  const handleToggleStatus = async (task: Task) => {
    setTogglingId(task.id);
    try {
      const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      await fetchTasks(page, activeFilter);
      await fetchCounts();
    } catch (err) {
      console.error("Erro ao atualizar tarefa:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const openModal = () => {
    setForm({ title: "", type: "CALL", dueDate: "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/tasks", {
        title: form.title,
        type: form.type,
        userId: defaultUserId,
        dueDate: form.dueDate || undefined,
      });
      setModalOpen(false);
      await fetchTasks(page, activeFilter);
      await fetchCounts();
    } catch (err) {
      console.error("Erro ao criar tarefa:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Tarefas" breadcrumb={["CRM", "Tarefas"]} />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleFilterChange(tab.key)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  activeFilter === tab.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {tab.label}
                <span className={clsx(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-xs",
                  activeFilter === tab.key ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-500"
                )}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          <Button variant="primary" size="sm" onClick={openModal}>
            <Plus size={14} />
            Nova Tarefa
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Tarefa</TableHeader>
              <TableHeader>Tipo</TableHeader>
              <TableHeader>Negociação</TableHeader>
              <TableHeader>Responsável</TableHeader>
              <TableHeader>Vencimento</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma tarefa encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const Icon = typeIcons[task.type] ?? Phone;
                const isCompleted = task.status === "COMPLETED";
                const isOverdue = task.status === "OVERDUE";

                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(task)}
                          disabled={togglingId === task.id}
                          className="flex-shrink-0 disabled:opacity-50"
                          title={isCompleted ? "Marcar como pendente" : "Marcar como concluída"}
                        >
                          {isCompleted ? (
                            <CheckCircle size={16} className="text-green-500" />
                          ) : isOverdue ? (
                            <Clock size={16} className="text-red-500" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-blue-400 transition-colors" />
                          )}
                        </button>
                        <span className={clsx(
                          "font-medium",
                          isCompleted ? "text-gray-400 line-through" : "text-gray-900"
                        )}>
                          {task.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", typeColors[task.type])}>
                        <Icon size={12} />
                        {typeLabels[task.type]}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {task.deal?.title || "—"}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {task.user?.name || "—"}
                    </TableCell>
                    <TableCell className={clsx(
                      "text-sm",
                      isOverdue ? "text-red-600 font-medium" : "text-gray-500"
                    )}>
                      {task.dueDate ? formatDate(task.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[task.status].variant}>
                        {statusConfig[task.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">Editar</Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Mostrando {start}–{end} de {meta.total} tarefas
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={meta.page <= 1}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium">
                {meta.page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={meta.page >= meta.totalPages}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* New Task Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Tarefa">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Título *"
            placeholder="Descreva a tarefa..."
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Tipo *</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ApiTaskType }))}
              required
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Data de vencimento"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!defaultUserId}>
              Criar Tarefa
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
