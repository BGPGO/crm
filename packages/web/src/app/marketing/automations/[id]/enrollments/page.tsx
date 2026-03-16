"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
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
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";

type EnrollmentStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "CANCELLED";

interface Enrollment {
  id: string;
  contactName: string;
  contactEmail: string | null;
  status: EnrollmentStatus;
  enrolledAt: string;
  currentStepOrder: number | null;
  currentStepAction: string | null;
  nextActionAt: string | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EnrollmentsResponse {
  data: Enrollment[];
  meta: Meta;
}

const statusConfig: Record<
  EnrollmentStatus,
  { variant: "blue" | "green" | "red" | "yellow" | "gray"; label: string }
> = {
  ACTIVE: { variant: "blue", label: "Ativa" },
  COMPLETED: { variant: "green", label: "Concluída" },
  FAILED: { variant: "red", label: "Falhou" },
  PAUSED: { variant: "yellow", label: "Pausada" },
  CANCELLED: { variant: "gray", label: "Cancelada" },
};

const ACTION_LABELS: Record<string, string> = {
  ADD_TAG: "Adicionar Tag",
  REMOVE_TAG: "Remover Tag",
  SEND_EMAIL: "Enviar Email",
  WAIT: "Aguardar",
  UPDATE_FIELD: "Atualizar Campo",
  MOVE_PIPELINE_STAGE: "Mover Etapa",
  CONDITION: "Condição",
};

export default function AutomationEnrollmentsPage() {
  const params = useParams();
  const id = params.id as string;

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [automationName, setAutomationName] = useState("");

  const fetchEnrollments = useCallback(
    async (currentPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
        });
        const result = await api.get<EnrollmentsResponse>(
          `/automations/${id}/enrollments?${params.toString()}`
        );
        setEnrollments(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Erro ao buscar inscrições:", err);
        setError("Falha ao carregar inscrições. Verifique sua conexão e tente novamente.");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    // Fetch automation name
    api
      .get<{ data: { name: string } }>(`/automations/${id}`)
      .then((res) => setAutomationName(res.data.name))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchEnrollments(page);
  }, [page, fetchEnrollments]);

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Inscrições"
        breadcrumb={[
          "Marketing",
          "Automações",
          automationName || "...",
          "Inscrições",
        ]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-4">
        {/* Back link */}
        <Link
          href={`/marketing/automations/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para {automationName || "Automação"}
        </Link>

        {/* Error state */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-center justify-between">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => fetchEnrollments(page)}
              className="px-4 py-2 text-sm font-medium text-red-700 hover:text-red-800 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Contato</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Inscrito em</TableHeader>
              <TableHeader>Passo Atual</TableHeader>
              <TableHeader>Próxima Ação</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : enrollments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma inscrição encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              enrollments.map((enrollment) => {
                const config =
                  statusConfig[enrollment.status] ?? statusConfig.ACTIVE;
                return (
                  <TableRow key={enrollment.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {enrollment.contactName?.charAt(0) ?? "?"}
                        </div>
                        <span className="font-medium text-gray-900">
                          {enrollment.contactName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {enrollment.contactEmail || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {formatDateTime(enrollment.enrolledAt)}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {enrollment.currentStepOrder !== null &&
                      enrollment.currentStepOrder !== undefined ? (
                        <span>
                          #{enrollment.currentStepOrder + 1}{" "}
                          <span className="text-gray-500">
                            {ACTION_LABELS[
                              enrollment.currentStepAction ?? ""
                            ] ??
                              enrollment.currentStepAction ??
                              ""}
                          </span>
                        </span>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {enrollment.nextActionAt
                        ? formatDateTime(enrollment.nextActionAt)
                        : "\u2014"}
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
              Mostrando {start}&ndash;{end} de {meta.total} inscrições
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
