"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  Clock,
  Phone,
  Mail,
  Calendar,
  MapPin,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/formatters";
import { api } from "@/lib/api";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  dealCount: number;
  totalValue: number;
}

interface PipelineSummaryData {
  stages: PipelineStage[];
  totalDeals: number;
  totalValue: number;
  countsByStatus: { OPEN: number; WON: number; LOST: number };
}

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  deal?: { title: string } | null;
  user?: { name: string } | null;
}

interface Task {
  id: string;
  title: string;
  type: "CALL" | "EMAIL" | "MEETING" | "VISIT" | "OTHER";
  dueDate: string | null;
  status: "PENDING" | "COMPLETED" | "OVERDUE";
}

interface TaskCounts {
  ALL: number;
  PENDING: number;
  COMPLETED: number;
  OVERDUE: number;
}

const taskTypeIcons: Record<string, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  VISIT: MapPin,
  OTHER: MoreHorizontal,
};

const taskTypeLabels: Record<string, string> = {
  CALL: "Ligação",
  EMAIL: "E-mail",
  MEETING: "Reunião",
  VISIT: "Visita",
  OTHER: "Outro",
};

export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummaryData | null>(null);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({ ALL: 0, PENDING: 0, COMPLETED: 0, OVERDUE: 0 });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch pipelines first to get the default one
      const pipelinesRes = await api.get<{ data: { id: string; name: string }[] }>("/pipelines");
      const defaultPipeline = pipelinesRes.data?.[0];

      const promises: Promise<void>[] = [];

      // Pipeline summary
      if (defaultPipeline) {
        promises.push(
          api.get<{ data: PipelineSummaryData }>(`/pipelines/${defaultPipeline.id}/summary`).then((res) => {
            setPipelineSummary(res.data);
          }).catch(() => {})
        );
      }

      // Task counts
      promises.push(
        api.get<{ data: TaskCounts }>("/tasks/counts").then((res) => {
          setTaskCounts(res.data);
        }).catch(() => {})
      );

      // Recent activities
      promises.push(
        api.get<{ data: Activity[]; meta: unknown }>("/activities?limit=10").then((res) => {
          setActivities(res.data);
        }).catch(() => {})
      );

      // Pending tasks
      promises.push(
        api.get<{ data: Task[]; meta: unknown }>("/tasks?status=PENDING&limit=8").then((res) => {
          setPendingTasks(res.data);
        }).catch(() => {})
      );

      await Promise.all(promises);
    } catch (err) {
      console.error("Erro ao carregar relatórios:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stages = pipelineSummary?.stages || [];
  const maxDealsInStage = Math.max(...stages.map((s) => s.dealCount || 0), 1);

  const totalDeals = pipelineSummary?.totalDeals || 0;
  const totalValue = pipelineSummary?.totalValue || 0;
  const openDeals = pipelineSummary?.countsByStatus?.OPEN || 0;
  const wonDeals = pipelineSummary?.countsByStatus?.WON || 0;
  const lostDeals = pipelineSummary?.countsByStatus?.LOST || 0;
  const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;
  const openPct = totalDeals > 0 ? Math.round((openDeals / totalDeals) * 100) : 0;
  const wonPct = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
  const lostPct = totalDeals > 0 ? Math.round((lostDeals / totalDeals) * 100) : 0;

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Relatórios" breadcrumb={["Analytics", "Relatórios"]} />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">Carregando relatórios...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Relatórios" breadcrumb={["Analytics", "Relatórios"]} />

      <main className="flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Row 1 - Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total de Negociações */}
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Total de Negociações</p>
                <p className="text-2xl font-bold text-gray-900">{totalDeals}</p>
              </div>
            </div>
          </Card>

          {/* Valor Total em Aberto */}
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-green-50 text-green-600">
                <DollarSign size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Valor em Aberto</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(totalValue)}
                </p>
              </div>
            </div>
          </Card>

          {/* Taxa de Conversão */}
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Taxa de Conversão</p>
                <p className="text-2xl font-bold text-gray-900">
                  {conversionRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </Card>

          {/* Tarefas Atrasadas */}
          <Card
            padding="md"
            className={`${taskCounts.OVERDUE > 0 ? "ring-2 ring-red-200 bg-red-50 cursor-pointer hover:ring-red-300 transition-all" : ""}`}
            onClick={() => taskCounts.OVERDUE > 0 && router.push("/tasks?status=OVERDUE")}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${taskCounts.OVERDUE > 0 ? "bg-red-100 text-red-600 animate-pulse" : "bg-orange-50 text-orange-600"}`}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Tarefas Atrasadas</p>
                <p className={`text-2xl font-bold ${taskCounts.OVERDUE > 0 ? "text-red-600" : "text-gray-900"}`}>
                  {taskCounts.OVERDUE}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Row 2 - Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline por Etapa */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Pipeline por Etapa</h3>
            {stages.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Nenhum dado de pipeline disponível
              </div>
            ) : (
              <div className="space-y-3">
                {stages
                  .sort((a, b) => a.order - b.order)
                  .map((stage) => {
                    const count = stage.dealCount || 0;
                    const pct = Math.max((count / maxDealsInStage) * 100, 2);
                    return (
                      <div key={stage.id} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-600 truncate flex-shrink-0 text-right">
                          {stage.name}
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: stage.color || "#3B82F6",
                              minWidth: count > 0 ? "32px" : "0",
                            }}
                          >
                            {count > 0 && (
                              <span className="text-[10px] font-bold text-white drop-shadow-sm">
                                {count}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>

          {/* Negociações por Status */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Negociações por Status</h3>
            <div className="space-y-5">
              {/* Open */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-blue-500" />
                    <span className="text-sm font-medium text-gray-700">Em Aberto</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{openDeals}</span>
                    <Badge variant="blue">{openPct}%</Badge>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${openPct}%` }}
                  />
                </div>
              </div>

              {/* Won */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={14} className="text-green-500" />
                    <span className="text-sm font-medium text-gray-700">Ganhas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{wonDeals}</span>
                    <Badge variant="green">{wonPct}%</Badge>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${wonPct}%` }}
                  />
                </div>
              </div>

              {/* Lost */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <XCircle size={14} className="text-red-500" />
                    <span className="text-sm font-medium text-gray-700">Perdidas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900">{lostDeals}</span>
                    <Badge variant="red">{lostPct}%</Badge>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-full bg-red-500 rounded-full transition-all duration-500"
                    style={{ width: `${lostPct}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Row 3 - Activities & Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Últimas Atividades */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Últimas Atividades</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {activities.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  Nenhuma atividade registrada
                </div>
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activity.deal?.title && (
                          <span className="text-xs text-blue-600 truncate">{activity.deal.title}</span>
                        )}
                        {activity.user?.name && (
                          <span className="text-xs text-gray-400">· {activity.user.name}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                      {formatRelativeTime(activity.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Tarefas Pendentes */}
          <Card padding="none">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Tarefas Pendentes</h3>
              <Badge variant="yellow">{taskCounts.PENDING}</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {pendingTasks.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  Nenhuma tarefa pendente
                </div>
              ) : (
                pendingTasks.map((task) => {
                  const TIcon = taskTypeIcons[task.type] || MoreHorizontal;
                  const isOverdue = task.status === "PENDING" && task.dueDate && new Date(task.dueDate) < new Date();
                  const overdueDays = isOverdue ? Math.floor((Date.now() - new Date(task.dueDate!).getTime()) / 86400000) : 0;
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 transition-colors ${isOverdue ? "bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500" : "hover:bg-gray-50"}`}
                    >
                      <div className={`p-1.5 rounded-full flex-shrink-0 ${isOverdue ? "bg-red-100 text-red-500" : "bg-gray-100 text-gray-500"}`}>
                        <TIcon size={12} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isOverdue ? "text-red-700 font-medium" : "text-gray-700"}`}>{task.title}</p>
                        <p className="text-xs text-gray-400">
                          {taskTypeLabels[task.type] || task.type}
                        </p>
                      </div>
                      {task.dueDate && (
                        <span className={`text-xs flex-shrink-0 ${isOverdue ? "text-red-600 font-bold" : "text-gray-400"}`}>
                          {isOverdue
                            ? overdueDays === 0 ? "Vence hoje" : `${overdueDays} dia${overdueDays !== 1 ? "s" : ""} atrasada`
                            : formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
