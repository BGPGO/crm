"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import MarketingNav from "@/components/marketing/MarketingNav";
import TagBadge from "@/components/marketing/TagBadge";
import TagSelector from "@/components/marketing/TagSelector";
import EngagementBadge from "@/components/marketing/EngagementBadge";
import { Search, ChevronLeft, ChevronRight, Upload, Tag } from "lucide-react";
import { api } from "@/lib/api";

type EngagementLevel = "ENGAGED" | "INTERMEDIATE" | "DISENGAGED";

interface ContactTag {
  id: string;
  name: string;
  color: string;
}

interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: ContactTag[];
  score: number | null;
  engagementLevel: EngagementLevel | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface LeadsResponse {
  data: Lead[];
  meta: Meta;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterEngagement, setFilterEngagement] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterTagIdsRef = useRef(filterTagIds);
  filterTagIdsRef.current = filterTagIds;

  const filterEngagementRef = useRef(filterEngagement);
  filterEngagementRef.current = filterEngagement;

  const fetchLeads = useCallback(
    async (currentPage: number, searchTerm: string) => {
      setError(null);
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
        });
        if (searchTerm) params.set("search", searchTerm);
        if (filterTagIdsRef.current.length > 0) params.set("tags", filterTagIdsRef.current.join(","));
        if (filterEngagementRef.current) params.set("engagementLevel", filterEngagementRef.current);

        const result = await api.get<LeadsResponse>(
          `/contacts?${params.toString()}`
        );
        setLeads(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Erro ao buscar leads:", err);
        setError('Erro ao carregar dados. Tente novamente.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Single effect: fetch on mount + when filters change reset page
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      fetchLeads(page, search);
      return;
    }
    setPage(1);
    fetchLeads(1, search);
  }, [filterTagIds, filterEngagement]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFirstRender.current) return;
    fetchLeads(page, search);
  }, [page, fetchLeads]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLeads(1, value);
    }, 300);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  };

  const handleBulkAssign = async () => {
    if (bulkTagIds.length === 0 || selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      await api.post("/tags/bulk-assign", {
        contactIds: selectedIds,
        tagIds: bulkTagIds,
      });
      setBulkModalOpen(false);
      setBulkTagIds([]);
      setSelectedIds([]);
      fetchLeads(page, search);
    } catch (err) {
      console.error("Erro ao atribuir tags:", err);
    } finally {
      setBulkLoading(false);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Leads" breadcrumb={["Marketing", "Leads"]} />
      <MarketingNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchLeads(page, search)} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
            {/* Search */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Buscar leads..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Tag filter */}
            <div className="w-full sm:w-64">
              <TagSelector
                selectedTagIds={filterTagIds}
                onChange={setFilterTagIds}
              />
            </div>

            {/* Engagement filter */}
            <select
              value={filterEngagement}
              onChange={(e) => setFilterEngagement(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos os engajamentos</option>
              <option value="ENGAGED">Engajado</option>
              <option value="INTERMEDIATE">Intermediário</option>
              <option value="DISENGAGED">Desengajado</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBulkModalOpen(true)}
              >
                <Tag size={14} />
                Atribuir Tags ({selectedIds.length})
              </Button>
            )}
            <Link href="/marketing/leads/import">
              <Button variant="secondary" size="sm">
                <Upload size={14} />
                Importar
              </Button>
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selectedIds.length === leads.length}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </TableHeader>
              <TableHeader>Nome</TableHeader>
              <TableHeader className="hidden sm:table-cell">Email</TableHeader>
              <TableHeader className="hidden md:table-cell">Tags</TableHeader>
              <TableHeader className="hidden lg:table-cell">Score</TableHeader>
              <TableHeader className="hidden sm:table-cell">Engajamento</TableHeader>
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
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhum lead encontrado.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-gray-300"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {lead.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">
                        {lead.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-600">
                    {lead.email || "\u2014"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags?.map((tag) => (
                        <TagBadge
                          key={tag.id}
                          name={tag.name}
                          color={tag.color}
                        />
                      ))}
                      {(!lead.tags || lead.tags.length === 0) && (
                        <span className="text-gray-400 text-xs">\u2014</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {lead.score !== null && lead.score !== undefined ? (
                      <span className="font-medium text-gray-900">
                        {lead.score}
                      </span>
                    ) : (
                      <span className="text-gray-400">\u2014</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {lead.engagementLevel ? (
                      <EngagementBadge level={lead.engagementLevel} />
                    ) : (
                      <span className="text-gray-400 text-xs">\u2014</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/contacts/${lead.id}`}
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
        </div>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
            <span>
              Mostrando {start}\u2013{end} de {meta.total} leads
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

      {/* Bulk Tag Assignment Modal */}
      <Modal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title={`Atribuir Tags (${selectedIds.length} leads)`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Selecione as tags que deseja atribuir aos leads selecionados.
          </p>
          <TagSelector selectedTagIds={bulkTagIds} onChange={setBulkTagIds} />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={bulkLoading}
              disabled={bulkTagIds.length === 0}
              onClick={handleBulkAssign}
            >
              Atribuir Tags
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
