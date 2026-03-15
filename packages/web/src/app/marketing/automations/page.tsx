"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

interface Automation {
  id: string;
  name: string;
  triggerType: string;
  triggerConfig: any;
  status: AutomationStatus;
  stepsCount: number;
  enrollmentsCount: number;
  createdAt: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface AutomationsResponse {
  data: Automation[];
  meta: Meta;
}

const statusConfig: Record<
  AutomationStatus,
  { variant: "gray" | "green" | "yellow" | "red"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  ACTIVE: { variant: "green", label: "Ativa" },
  PAUSED: { variant: "yellow", label: "Pausada" },
  ARCHIVED: { variant: "red", label: "Arquivada" },
};

const TRIGGER_LABELS: Record<string, string> = {
  TAG_ADDED: "Tag adicionada",
  TAG_REMOVED: "Tag removida",
  STAGE_CHANGED: "Etapa alterada",
  CONTACT_CREATED: "Contato criado",
  FIELD_UPDATED: "Campo atualizado",
  DATE_BASED: "Baseado em data",
};

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchAutomations = useCallback(
    async (currentPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
        });
        if (statusFilter) params.set("status", statusFilter);

        const result = await api.get<AutomationsResponse>(
          `/automations?${params.toString()}`
        );
        setAutomations(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Erro ao buscar automações:", err);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchAutomations(page);
  }, [page, fetchAutomations]);

  useEffect(() => {
    setPage(1);
    fetchAutomations(1);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleStatus = async (automation: Automation) => {
    const newStatus =
      automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await api.patch(`/automations/${automation.id}`, { status: newStatus });
      fetchAutomations(page);
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
    try {
      await api.delete(`/automations/${id}`);
      fetchAutomations(page);
    } catch (err) {
      console.error("Erro ao excluir automação:", err);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Automações" breadcrumb={["Marketing", "Automações"]} />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="ACTIVE">Ativa</option>
              <option value="PAUSED">Pausada</option>
              <option value="ARCHIVED">Arquivada</option>
            </select>
          </div>

          <Link href="/marketing/automations/new">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              Nova Automação
            </Button>
          </Link>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>Gatilho</TableHeader>
              <TableHeader>Passos</TableHeader>
              <TableHeader>Inscrições</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Criado em</TableHeader>
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
            ) : automations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma automação encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              automations.map((automation) => {
                const config =
                  statusConfig[automation.status] ?? statusConfig.DRAFT;
                return (
                  <TableRow key={automation.id}>
                    <TableCell>
                      <Link
                        href={`/marketing/automations/${automation.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {automation.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {TRIGGER_LABELS[automation.triggerType] ??
                        automation.triggerType}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {automation.stepsCount ?? 0}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {automation.enrollmentsCount ?? 0}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatDate(automation.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(automation.status === "ACTIVE" ||
                          automation.status === "PAUSED" ||
                          automation.status === "DRAFT") && (
                          <button
                            onClick={() => handleToggleStatus(automation)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title={
                              automation.status === "ACTIVE"
                                ? "Pausar"
                                : "Ativar"
                            }
                          >
                            {automation.status === "ACTIVE" ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} />
                            )}
                          </button>
                        )}
                        <Link
                          href={`/marketing/automations/${automation.id}`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </Link>
                        <Link
                          href={`/marketing/automations/${automation.id}/enrollments`}
                          className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors inline-flex"
                          title="Ver inscrições"
                        >
                          <Eye size={14} />
                        </Link>
                        <button
                          onClick={() => handleDelete(automation.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
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
              Mostrando {start}&ndash;{end} de {meta.total} automações
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
    </div>
  );
}
