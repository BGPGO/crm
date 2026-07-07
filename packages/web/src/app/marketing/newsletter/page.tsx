"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

interface Edition {
  id: string;
  subject: string;
  status: "DRAFT" | "SENT";
  isTest: boolean;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number | null;
  clickRate: number | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EditionsResponse {
  data: Edition[];
  meta: Meta;
}

const statusConfig: Record<
  Edition["status"],
  { variant: "gray" | "green"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  SENT: { variant: "green", label: "Enviada" },
};

export default function NewsletterPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchEditions = useCallback(async (currentPage: number) => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<EditionsResponse>(
        `/newsletters?page=${currentPage}&limit=20`
      );
      setEditions(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar edições:", err);
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEditions(page);
  }, [page, fetchEditions]);

  const formatRate = (rate: number | null) => {
    if (rate === null || rate === undefined) return "—";
    return `${(rate * 100).toFixed(1)}%`;
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Newsletter" breadcrumb={["Marketing", "Newsletter"]} />
      <MarketingNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => fetchEditions(page)}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <p className="text-sm text-gray-500">
          Edições do email semanal BGP Insights — enviado toda segunda às 5h, com
          rastreamento de abertura e clique por botão.
        </p>

        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Assunto</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="hidden md:table-cell">Destinatários</TableHeader>
                <TableHeader className="hidden lg:table-cell">Abertura</TableHeader>
                <TableHeader className="hidden lg:table-cell">Cliques</TableHeader>
                <TableHeader className="hidden md:table-cell">Data</TableHeader>
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
              ) : editions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-8 text-center text-sm text-gray-500">
                      Nenhuma edição ainda. A primeira aparece aqui assim que for
                      criada ou enviada.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                editions.map((edition) => {
                  const status = statusConfig[edition.status] || statusConfig.DRAFT;
                  return (
                    <TableRow key={edition.id}>
                      <TableCell>
                        <Link
                          href={`/marketing/newsletter/${edition.id}`}
                          className="font-medium text-gray-900 hover:text-petrol-600"
                        >
                          {edition.subject}
                        </Link>
                        {edition.isTest && (
                          <span className="ml-2 text-xs text-gray-400">(teste)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {edition.recipientCount}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatRate(edition.openRate)}
                        <span className="text-xs text-gray-400 ml-1">
                          ({edition.uniqueOpens})
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatRate(edition.clickRate)}
                        <span className="text-xs text-gray-400 ml-1">
                          ({edition.uniqueClicks})
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDate(edition.sentAt || edition.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/marketing/newsletter/${edition.id}`}
                          className="text-gray-400 hover:text-petrol-600"
                          aria-label="Ver detalhes"
                        >
                          <Eye size={16} />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {start}–{end} de {meta.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="p-1.5 rounded border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Próxima página"
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
