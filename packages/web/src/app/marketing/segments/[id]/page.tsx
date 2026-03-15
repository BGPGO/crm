"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
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
import { RefreshCw, ArrowLeft, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

interface SegmentFilter {
  field: string;
  operator: string;
  value: string;
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
  filters: SegmentFilter[];
  contactCount: number;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ContactsResponse {
  data: Contact[];
  meta: Meta;
}

const operatorLabels: Record<string, string> = {
  equals: "igual a",
  not_equals: "diferente de",
  contains: "contém",
  not_contains: "não contém",
  greater_than: "maior que",
  less_than: "menor que",
  is_empty: "está vazio",
  is_not_empty: "não está vazio",
};

export default function SegmentDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [segment, setSegment] = useState<Segment | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loadingSegment, setLoadingSegment] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);

  const fetchSegment = useCallback(async () => {
    setLoadingSegment(true);
    try {
      const result = await api.get<{ data: Segment }>(`/segments/${id}`);
      setSegment(result.data);
    } catch (err) {
      console.error("Erro ao buscar segmento:", err);
    } finally {
      setLoadingSegment(false);
    }
  }, [id]);

  const fetchContacts = useCallback(
    async (currentPage: number) => {
      setLoadingContacts(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
        });
        const result = await api.get<ContactsResponse>(
          `/segments/${id}/contacts?${params.toString()}`
        );
        setContacts(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Erro ao buscar contatos do segmento:", err);
      } finally {
        setLoadingContacts(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchSegment();
  }, [fetchSegment]);

  useEffect(() => {
    fetchContacts(page);
  }, [page, fetchContacts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await api.post<{ data: Segment }>(`/segments/${id}/refresh-count`, {});
      setSegment((prev) =>
        prev ? { ...prev, contactCount: updated.data.contactCount } : prev
      );
      fetchContacts(1);
      setPage(1);
    } catch (err) {
      console.error("Erro ao atualizar contagem:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const formatFilter = (filter: SegmentFilter) => {
    const op = operatorLabels[filter.operator] || filter.operator;
    if (filter.operator === "is_empty" || filter.operator === "is_not_empty") {
      return `${filter.field} ${op}`;
    }
    return `${filter.field} ${op} "${filter.value}"`;
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title={segment?.name || "Segmento"}
        breadcrumb={["Marketing", "Segmentos", segment?.name || "..."]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-6">
        {/* Back link */}
        <Link
          href="/marketing/segments"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para Segmentos
        </Link>

        {loadingSegment ? (
          <Card padding="md">
            <div className="space-y-3">
              <div className="h-6 w-48 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
            </div>
          </Card>
        ) : segment ? (
          <>
            {/* Segment info */}
            <Card padding="md">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {segment.name}
                    </h2>
                    <Badge
                      variant={
                        segment.status === "ACTIVE"
                          ? "green"
                          : segment.status === "DRAFT"
                          ? "yellow"
                          : "gray"
                      }
                    >
                      {segment.status === "ACTIVE"
                        ? "Ativo"
                        : segment.status === "DRAFT"
                        ? "Rascunho"
                        : "Arquivado"}
                    </Badge>
                  </div>
                  {segment.description && (
                    <p className="text-sm text-gray-600">{segment.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <Users size={14} />
                      {segment.contactCount} contatos
                    </span>
                    <span>Criado em {formatDate(segment.createdAt)}</span>
                    <span>Atualizado em {formatDate(segment.updatedAt)}</span>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={refreshing}
                  onClick={handleRefresh}
                >
                  <RefreshCw size={14} />
                  Atualizar Contagem
                </Button>
              </div>
            </Card>

            {/* Filters display */}
            {segment.filters && segment.filters.length > 0 && (
              <Card padding="md">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Filtros do Segmento
                </h3>
                <div className="flex flex-wrap gap-2">
                  {segment.filters.map((filter, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700"
                    >
                      {formatFilter(filter)}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Contacts table */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Contatos no Segmento
              </h3>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Nome</TableHeader>
                    <TableHeader>Email</TableHeader>
                    <TableHeader>Telefone</TableHeader>
                    <TableHeader>Criado em</TableHeader>
                    <TableHeader></TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingContacts ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}>
                            <div className="h-4 bg-gray-100 rounded animate-pulse" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : contacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="py-10 text-center text-gray-400 text-sm">
                          Nenhum contato neste segmento.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {contact.name.charAt(0)}
                            </div>
                            <span className="font-medium text-gray-900">
                              {contact.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {contact.email || "\u2014"}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {contact.phone || "\u2014"}
                        </TableCell>
                        <TableCell className="text-gray-500">
                          {formatDate(contact.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Ver
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {!loadingContacts && meta.total > 0 && (
                <div className="flex items-center justify-between text-sm text-gray-500 mt-4">
                  <span>
                    Mostrando {start}\u2013{end} de {meta.total} contatos
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
            </div>
          </>
        ) : (
          <Card padding="md">
            <p className="text-sm text-gray-500">Segmento não encontrado.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
