"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, RefreshCw, Pencil, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

interface Segment {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

interface SegmentsResponse {
  data: Segment[];
}

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSegments = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<SegmentsResponse>("/segments");
      setSegments(result.data);
    } catch (err) {
      console.error("Erro ao buscar segmentos:", err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSegments();
  }, [fetchSegments]);

  const handleRefreshCount = async (id: string) => {
    setRefreshingId(id);
    try {
      const updated = await api.post<{ data: Segment }>(`/segments/${id}/refresh-count`, {});
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, contactCount: updated.data.contactCount } : s))
      );
    } catch (err) {
      console.error("Erro ao atualizar contagem:", err);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este segmento?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/segments/${id}`);
      setSegments((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Erro ao excluir segmento:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const statusBadge = (status: Segment["status"]) => {
    const map: Record<Segment["status"], { variant: "green" | "gray" | "yellow"; label: string }> = {
      ACTIVE: { variant: "green", label: "Ativo" },
      DRAFT: { variant: "yellow", label: "Rascunho" },
      ARCHIVED: { variant: "gray", label: "Arquivado" },
    };
    const { variant, label } = map[status] ?? map.DRAFT;
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Segmentos" breadcrumb={["Marketing", "Segmentos"]} />
      <MarketingNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchSegments()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Crie segmentos para agrupar contatos com base em critérios dinâmicos.
          </p>
          <Link href="/marketing/segments/new">
            <Button variant="primary" size="sm">
              <Plus size={14} />
              Novo Segmento
            </Button>
          </Link>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader className="hidden sm:table-cell">Descrição</TableHeader>
              <TableHeader className="hidden md:table-cell">Contatos</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="hidden lg:table-cell">Atualizado</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : segments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhum segmento criado ainda.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              segments.map((segment) => (
                <TableRow key={segment.id}>
                  <TableCell>
                    <Link
                      href={`/marketing/segments/${segment.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {segment.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-600 max-w-xs truncate">
                    {segment.description || "\u2014"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Users size={14} className="text-gray-400" />
                      {segment.contactCount}
                    </div>
                  </TableCell>
                  <TableCell>{statusBadge(segment.status)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-500">
                    {formatDate(segment.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRefreshCount(segment.id)}
                        disabled={refreshingId === segment.id}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        title="Atualizar contagem"
                      >
                        <RefreshCw
                          size={14}
                          className={refreshingId === segment.id ? "animate-spin" : ""}
                        />
                      </button>
                      <Link href={`/marketing/segments/${segment.id}`}>
                        <button
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(segment.id)}
                        disabled={deletingId === segment.id}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </main>
    </div>
  );
}
