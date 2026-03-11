"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, Phone, Mail, Calendar, MessageSquare, CheckCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import clsx from "clsx";

type TaskType = "call" | "email" | "meeting" | "note";
type TaskStatus = "pending" | "done" | "overdue";
type FilterTab = "all" | "pending" | "done" | "overdue";

interface Task {
  id: string;
  title: string;
  type: TaskType;
  deal: string;
  dueDate: string;
  status: TaskStatus;
}

const tasks: Task[] = [
  { id: "1", title: "Ligar para Carlos Souza — renovação contrato", type: "call", deal: "LogiTrans Express", dueDate: "2025-03-12", status: "pending" },
  { id: "2", title: "Enviar proposta revisada", type: "email", deal: "Tech Solutions", dueDate: "2025-03-10", status: "overdue" },
  { id: "3", title: "Reunião de kickoff com Indústrias Norte", type: "meeting", deal: "Indústrias Norte S.A.", dueDate: "2025-03-15", status: "pending" },
  { id: "4", title: "Follow-up pós apresentação", type: "email", deal: "Empresa ABC Ltda", dueDate: "2025-03-08", status: "done" },
  { id: "5", title: "Enviar contrato assinado", type: "email", deal: "Comércio Sul Ltda", dueDate: "2025-03-05", status: "done" },
  { id: "6", title: "Confirmar reunião na próxima semana", type: "call", deal: "Consultoria Premium", dueDate: "2025-03-13", status: "pending" },
  { id: "7", title: "Anotar resultado da reunião de negociação", type: "note", deal: "LogiTrans Express", dueDate: "2025-03-09", status: "overdue" },
];

const typeIcons: Record<TaskType, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  note: MessageSquare,
};

const typeLabels: Record<TaskType, string> = {
  call: "Ligação",
  email: "E-mail",
  meeting: "Reunião",
  note: "Nota",
};

const typeColors: Record<TaskType, string> = {
  call: "text-blue-600 bg-blue-100",
  email: "text-green-600 bg-green-100",
  meeting: "text-purple-600 bg-purple-100",
  note: "text-orange-600 bg-orange-100",
};

const statusConfig: Record<TaskStatus, { label: string; variant: "green" | "yellow" | "red" | "gray" }> = {
  pending: { label: "Pendente", variant: "yellow" },
  done: { label: "Concluída", variant: "green" },
  overdue: { label: "Atrasada", variant: "red" },
};

const filterTabs: { key: FilterTab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Pendentes" },
  { key: "done", label: "Concluídas" },
  { key: "overdue", label: "Atrasadas" },
];

export default function TasksPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const filtered = activeFilter === "all"
    ? tasks
    : tasks.filter((t) => t.status === activeFilter);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Tarefas" breadcrumb={["CRM", "Tarefas"]} />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {filterTabs.map((tab) => {
              const count = tab.key === "all" ? tasks.length : tasks.filter((t) => t.status === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
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
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="primary" size="sm">
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
              <TableHeader>Vencimento</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((task) => {
              const Icon = typeIcons[task.type];
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {task.status === "done" && (
                        <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                      )}
                      {task.status === "overdue" && (
                        <Clock size={16} className="text-red-500 flex-shrink-0" />
                      )}
                      {task.status === "pending" && (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                      )}
                      <span className={clsx(
                        "font-medium",
                        task.status === "done" ? "text-gray-400 line-through" : "text-gray-900"
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
                  <TableCell className="text-gray-600">{task.deal}</TableCell>
                  <TableCell className={clsx(
                    "text-sm",
                    task.status === "overdue" ? "text-red-600 font-medium" : "text-gray-500"
                  )}>
                    {formatDate(task.dueDate)}
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
            })}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
