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
import { Plus, Phone, Mail, Calendar, MapPin, MoreHorizontal, CheckCircle, Clock, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import PostponeDropdown from "@/components/ui/PostponeDropdown";
import { formatDate } from "@/lib/formatters";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import TaskTitleCombobox from "@/components/ui/TaskTitleCombobox";
import clsx from "clsx";

type ApiTaskType = "CALL" | "EMAIL" | "MEETING" | "VISIT" | "OTHER";
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
  description: string | null;
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

interface UsersResponse {
  data: User[];
}

interface TaskCounts {
  ALL: number;
  PENDING: number;
  COMPLETED: number;
  OVERDUE: number;
}

interface TaskForm {
  title: string;
  type: ApiTaskType;
  dueDate: string;
  userId: string;
  description: string;
}

const typeIcons: Record<ApiTaskType, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  VISIT: MapPin,
  OTHER: MoreHorizontal,
};

const typeLabels: Record<ApiTaskType, string> = {
  CALL: "Ligação",
  EMAIL: "E-mail",
  MEETING: "Reunião",
  VISIT: "Visita",
  OTHER: "Outro",
};

const typeColors: Record<ApiTaskType, string> = {
  CALL: "text-blue-600 bg-blue-100",
  EMAIL: "text-green-600 bg-green-100",
  MEETING: "text-purple-600 bg-purple-100",
  VISIT: "text-orange-600 bg-orange-100",
  OTHER: "text-gray-600 bg-gray-100",
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
  { value: "VISIT", label: "Visita" },
  { value: "OTHER", label: "Outro" },
];

function dueDateToInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function TasksPage() {
  const { user: authUser } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [counts, setCounts] = useState<TaskCounts>({ ALL: 0, PENDING: 0, COMPLETED: 0, OVERDUE: 0 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("PENDING");
  const [userFilter, setUserFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>({ title: "", type: "CALL", dueDate: "", userId: "", description: "" });

  // Batch selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<"dueDate" | "userId" | "status" | "type" | "delete" | null>(null);
  const [batchValue, setBatchValue] = useState("");
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // Users list for assignee picker
  const [users, setUsers] = useState<User[]>([]);

  const fetchUsers = useCallback(async () => {
    try {
      const result = await api.get<UsersResponse>("/users?limit=50");
      setUsers(result.data);
    } catch (err) {
      console.error("Erro ao buscar usuários:", err);
    }
  }, []);

  const buildBaseParams = useCallback((uid: string) => {
    const p = new URLSearchParams();
    if (uid) p.set("userId", uid);
    return p;
  }, []);

  const fetchTasks = useCallback(async (currentPage: number, filter: FilterTab, uid: string) => {
    setLoading(true);
    try {
      const params = buildBaseParams(uid);
      params.set("page", String(currentPage));
      params.set("limit", "20");
      if (filter !== "ALL") params.set("status", filter);
      const result = await api.get<TasksResponse>(`/tasks?${params.toString()}`);
      setTasks(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar tarefas:", err);
    } finally {
      setLoading(false);
    }
  }, [buildBaseParams]);

  const fetchCounts = useCallback(async (uid: string) => {
    try {
      const params = uid ? `?userId=${uid}` : "";
      const res = await api.get<{ data: TaskCounts }>(`/tasks/counts${params}`);
      setCounts(res.data);
    } catch (err) {
      console.error("Erro ao buscar contagens:", err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCounts(userFilter);
  }, [userFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTasks(page, activeFilter, userFilter);
  }, [page, activeFilter, userFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selection when filter/page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, activeFilter, userFilter]);

  const handleFilterChange = (filter: FilterTab) => {
    setActiveFilter(filter);
    setPage(1);
  };

  const handleUserFilterChange = (uid: string) => {
    setUserFilter(uid);
    setPage(1);
  };

  const handleToggleStatus = async (task: Task) => {
    setTogglingId(task.id);
    try {
      const newStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
      await api.put(`/tasks/${task.id}`, { status: newStatus });
      window.dispatchEvent(new Event('tasks-changed'));
      await fetchTasks(page, activeFilter, userFilter);
      await fetchCounts(userFilter);
    } catch (err) {
      console.error("Erro ao atualizar tarefa:", err);
    } finally {
      setTogglingId(null);
    }
  };

  // ── Selection helpers ────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  const allSelected = tasks.length > 0 && selectedIds.size === tasks.length;
  const someSelected = selectedIds.size > 0;

  // ── Batch actions ────────────────────────────────────────────────────

  const openBatchModal = (action: typeof batchAction) => {
    setBatchAction(action);
    setBatchValue("");
    setBatchModalOpen(true);
  };

  const closeBatchModal = () => {
    setBatchModalOpen(false);
    setBatchAction(null);
    setBatchValue("");
  };

  const handleBatchSubmit = async () => {
    if (!batchAction || selectedIds.size === 0) return;
    setBatchSubmitting(true);
    try {
      const ids = Array.from(selectedIds);

      if (batchAction === "delete") {
        await api.delete("/tasks/batch", { ids });
      } else {
        const dataMap: Record<string, Record<string, string>> = {
          dueDate: { dueDate: batchValue },
          userId: { userId: batchValue },
          status: { status: batchValue },
          type: { type: batchValue },
        };
        await api.patch("/tasks/batch", { ids, data: dataMap[batchAction] });
      }

      window.dispatchEvent(new Event('tasks-changed'));
      closeBatchModal();
      setSelectedIds(new Set());
      await fetchTasks(page, activeFilter, userFilter);
      await fetchCounts(userFilter);
    } catch (err) {
      console.error("Erro na ação em lote:", err);
    } finally {
      setBatchSubmitting(false);
    }
  };

  // Open modal to create
  const openCreateModal = () => {
    setEditingTask(null);
    setForm({
      title: "",
      type: "CALL",
      dueDate: "",
      userId: authUser?.id || "",
      description: "",
    });
    setModalOpen(true);
  };

  // Open modal to edit
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      type: task.type,
      dueDate: dueDateToInput(task.dueDate),
      userId: task.user?.id || "",
      description: task.description || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingTask(null);
  };

  // Create or update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        title: form.title,
        type: form.type,
        userId: form.userId || authUser?.id,
        dueDate: form.dueDate || undefined,
        description: form.description || undefined,
      };

      if (editingTask) {
        await api.put(`/tasks/${editingTask.id}`, payload);
      } else {
        await api.post("/tasks", payload);
      }
      window.dispatchEvent(new Event('tasks-changed'));
      closeModal();
      await fetchTasks(page, activeFilter, userFilter);
      await fetchCounts(userFilter);
    } catch (err) {
      console.error("Erro ao salvar tarefa:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Postpone task
  const handlePostpone = async (taskId: string, newDate: Date) => {
    try {
      await api.put(`/tasks/${taskId}`, { dueDate: newDate.toISOString() });
      window.dispatchEvent(new Event('tasks-changed'));
      await fetchTasks(page, activeFilter, userFilter);
      await fetchCounts(userFilter);
    } catch (err) {
      console.error("Erro ao adiar tarefa:", err);
    }
  };

  // Delete task
  const handleDelete = async () => {
    if (!editingTask) return;
    if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    setSubmitting(true);
    try {
      await api.delete(`/tasks/${editingTask.id}`);
      window.dispatchEvent(new Event('tasks-changed'));
      closeModal();
      await fetchTasks(page, activeFilter, userFilter);
      await fetchCounts(userFilter);
    } catch (err) {
      console.error("Erro ao excluir tarefa:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  const isEditing = !!editingTask;

  // ── Batch action modal titles and content ────────────────────────────

  const batchModalTitle: Record<string, string> = {
    dueDate: "Alterar Data de Vencimento",
    userId: "Alterar Responsável",
    status: "Alterar Status",
    type: "Alterar Tipo",
    delete: "Excluir Tarefas",
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Tarefas" breadcrumb={["CRM", "Tarefas"]} />

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Overdue Banner */}
        {counts.OVERDUE > 0 && (
          <div className="flex items-center gap-3 bg-red-600 text-white rounded-lg px-5 py-3 shadow-md animate-pulse">
            <span className="text-xl">⚠️</span>
            <span className="font-semibold text-sm">
              Você tem {counts.OVERDUE} tarefa{counts.OVERDUE > 1 ? "s" : ""} atrasada{counts.OVERDUE > 1 ? "s" : ""}!
            </span>
            <button
              onClick={() => handleFilterChange("OVERDUE")}
              className="ml-auto px-3 py-1 text-xs font-bold bg-white text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              Ver atrasadas
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
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
                  tab.key === "OVERDUE" && counts.OVERDUE > 0
                    ? "bg-red-500 text-white font-bold animate-pulse"
                    : activeFilter === tab.key
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-200 text-gray-500"
                )}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={userFilter}
              onChange={(e) => handleUserFilterChange(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos os responsáveis</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              <Plus size={14} />
              Nova Tarefa
            </Button>
          </div>
        </div>

        {/* Batch action bar */}
        {someSelected && (
          <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 animate-in fade-in">
            <span className="text-sm font-medium text-blue-800">
              {selectedIds.size} {selectedIds.size === 1 ? "tarefa selecionada" : "tarefas selecionadas"}
            </span>
            <div className="h-4 w-px bg-blue-200 mx-1" />
            <button
              onClick={() => openBatchModal("dueDate")}
              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Alterar Data
            </button>
            <button
              onClick={() => openBatchModal("userId")}
              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Alterar Responsável
            </button>
            <button
              onClick={() => openBatchModal("status")}
              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Alterar Status
            </button>
            <button
              onClick={() => openBatchModal("type")}
              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
            >
              Alterar Tipo
            </button>
            <button
              onClick={() => openBatchModal("delete")}
              className="px-2.5 py-1 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 size={12} className="inline mr-1" />
              Excluir
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto p-1 text-blue-400 hover:text-blue-600 transition-colors"
              title="Limpar seleção"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </TableHeader>
              <TableHeader>Tarefa</TableHeader>
              <TableHeader className="hidden sm:table-cell">Tipo</TableHeader>
              <TableHeader className="hidden lg:table-cell">Negociação</TableHeader>
              <TableHeader className="hidden md:table-cell">Responsável</TableHeader>
              <TableHeader className="hidden sm:table-cell">Vencimento</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="w-10"></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma tarefa encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const Icon = typeIcons[task.type] ?? Phone;
                const isCompleted = task.status === "COMPLETED";
                const isOverdue = task.status === "OVERDUE" || (task.status === "PENDING" && task.dueDate && new Date(task.dueDate) < new Date());
                const isSelected = selectedIds.has(task.id);

                return (
                  <TableRow
                    key={task.id}
                    className={clsx(
                      "cursor-pointer",
                      isOverdue && !isSelected
                        ? "bg-red-50 border-l-4 border-l-red-500 hover:bg-red-100"
                        : isSelected
                          ? "bg-blue-50 hover:bg-blue-100"
                          : "hover:bg-gray-50"
                    )}
                    onClick={() => openEditModal(task)}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(task.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleStatus(task); }}
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
                    <TableCell className="hidden sm:table-cell">
                      <div className={clsx("inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", typeColors[task.type])}>
                        <Icon size={12} />
                        {typeLabels[task.type]}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-gray-600">
                      {task.deal?.title || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-gray-600">
                      {task.user?.name || "—"}
                    </TableCell>
                    <TableCell className={clsx(
                      "hidden sm:table-cell",
                      "text-sm",
                      isOverdue ? "text-red-600 font-bold" : "text-gray-500"
                    )}>
                      {task.dueDate
                        ? isOverdue
                          ? (() => {
                              const days = Math.floor((Date.now() - new Date(task.dueDate).getTime()) / 86400000);
                              if (days === 0) return "Vence hoje";
                              return `${days} dia${days !== 1 ? "s" : ""} atrasada`;
                            })()
                          : formatDate(task.dueDate)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[task.status].variant}>
                        {statusConfig[task.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {!isCompleted && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <PostponeDropdown
                            currentDueDate={task.dueDate}
                            onPostpone={(newDate) => handlePostpone(task.id, newDate)}
                            size="sm"
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
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

      {/* Create / Edit Task Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={isEditing ? "Editar Tarefa" : "Nova Tarefa"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Título *</label>
            <TaskTitleCombobox
              value={form.title}
              onChange={(val) => setForm((f) => ({ ...f, title: val }))}
              placeholder="Descreva a tarefa..."
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Responsável *</label>
              <select
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                required
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          <Input
            label="Data de vencimento"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Observações sobre a tarefa..."
              rows={3}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white resize-none"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={submitting}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Excluir
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeModal}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={submitting} disabled={!form.userId}>
                {isEditing ? "Salvar" : "Criar Tarefa"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Batch Action Modal */}
      <Modal
        isOpen={batchModalOpen}
        onClose={closeBatchModal}
        title={batchAction ? batchModalTitle[batchAction] : ""}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {batchAction === "delete"
              ? `Tem certeza que deseja excluir ${selectedIds.size} tarefa${selectedIds.size > 1 ? "s" : ""}? Esta ação não pode ser desfeita.`
              : `Aplicar alteração em ${selectedIds.size} tarefa${selectedIds.size > 1 ? "s" : ""} selecionada${selectedIds.size > 1 ? "s" : ""}.`
            }
          </p>

          {batchAction === "dueDate" && (
            <Input
              label="Nova data de vencimento"
              type="date"
              value={batchValue}
              onChange={(e) => setBatchValue(e.target.value)}
            />
          )}

          {batchAction === "userId" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Novo responsável</label>
              <select
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {batchAction === "status" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Novo status</label>
              <select
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                <option value="PENDING">Pendente</option>
                <option value="COMPLETED">Concluída</option>
              </select>
            </div>
          )}

          {batchAction === "type" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Novo tipo</label>
              <select
                value={batchValue}
                onChange={(e) => setBatchValue(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value="">Selecione...</option>
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={closeBatchModal}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={batchAction === "delete" ? "danger" : "primary"}
              size="sm"
              loading={batchSubmitting}
              disabled={batchAction !== "delete" && !batchValue}
              onClick={handleBatchSubmit}
            >
              {batchAction === "delete" ? `Excluir ${selectedIds.size} tarefa${selectedIds.size > 1 ? "s" : ""}` : "Aplicar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
