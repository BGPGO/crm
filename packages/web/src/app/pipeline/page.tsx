"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import StageColumn from "@/components/pipeline/StageColumn";
import type { StageSummary } from "@/components/pipeline/StageColumn";
import NewDealModal from "@/components/pipeline/NewDealModal";
import AdvancedFiltersModal, {
  type AdvancedFilters,
  countAdvancedFilters,
} from "@/components/pipeline/AdvancedFiltersModal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import {
  LayoutGrid,
  List,
  Plus,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  SlidersHorizontal,
} from "lucide-react";
import type { Deal } from "@/components/pipeline/DealCard";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";

// ─── API response types ───────────────────────────────────────────────────────

interface ApiPipelineStub {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; order: number; color?: string }>;
  _count?: { deals: number };
}

interface ApiPipelinesResponse {
  data: ApiPipelineStub[];
}

interface ApiPipelineDetail {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; order: number; color?: string }>;
}

interface ApiPipelineDetailResponse {
  data: ApiPipelineDetail;
}

interface ApiSummaryStage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  dealCount: number;
  totalValue: number;
}

interface ApiSummaryResponse {
  data: {
    stages: ApiSummaryStage[];
    totalDeals: number;
    totalValue: number;
    countsByStatus?: { OPEN: number; WON: number; LOST: number };
  };
}

interface DealsByStageResponse {
  data: {
    stages: Record<string, { deals: Deal[]; total: number }>;
  };
}

interface DealsResponse {
  data: Deal[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface ApiUser {
  id: string;
  name: string;
  email?: string;
}

interface ApiUsersResponse {
  data: ApiUser[];
}

// ─── Filter types ─────────────────────────────────────────────────────────────

type FilterType = "all" | "active" | "won" | "lost";
type PeriodFilter = "all" | "this_month" | "last_3" | "last_6" | "this_year";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SELECT_CLASS =
  "appearance-none text-sm bg-white border border-gray-200 rounded-md px-3 py-1.5 pr-7 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500";

const ALLOWED_COLORS = [
  "bg-slate-400",
  "bg-blue-400",
  "bg-cyan-400",
  "bg-yellow-400",
  "bg-orange-400",
  "bg-purple-400",
  "bg-pink-400",
  "bg-green-400",
  "bg-red-400",
];

function stageColor(color?: string | null, index = 0): string {
  if (color && ALLOWED_COLORS.includes(color)) return color;
  return ALLOWED_COLORS[index % ALLOWED_COLORS.length];
}

// ─── Status badge (list view) ────────────────────────────────────────────────

function StatusBadge({ status }: { status: Deal["status"] }) {
  if (status === "WON") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-sm bg-green-500 inline-block" />
        Ganha
      </span>
    );
  }
  if (status === "LOST") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
        <span className="w-1.5 h-1.5 rounded-sm bg-red-500 inline-block" />
        Perdida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
      <span className="w-1.5 h-1.5 rounded-sm bg-blue-500 inline-block" />
      Em andamento
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const LIST_PAGE_SIZE = 50;

export default function PipelinePage() {
  const router = useRouter();

  // Pipeline state
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelines, setPipelines] = useState<ApiPipelineStub[]>([]);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  // Summary state (stage counts/values)
  const [stageSummaries, setStageSummaries] = useState<StageSummary[]>([]);
  const [totalDeals, setTotalDeals] = useState(0);

  // List view state
  const [listDeals, setListDeals] = useState<Deal[]>([]);
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  // Batch deals from /deals-by-stage
  const [batchDeals, setBatchDeals] = useState<Record<string, { deals: Deal[]; total: number }>>({});

  // Drag-and-drop: per-stage injected deals for optimistic updates
  const [injectedDeals, setInjectedDeals] = useState<
    Record<string, Deal[] | undefined>
  >({});
  // Track deals per stage for drag-and-drop source
  const stageDealsRef = useRef<Record<string, Deal[]>>({});

  // Users for filter dropdown
  const [users, setUsers] = useState<ApiUser[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCount = countAdvancedFilters(advancedFilters);

  // ── Search debounce ──────────────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
    }, 400);
  }, []);

  // ── Build API filter params ───────────────────────────────────────────────

  const apiFilters = useMemo(() => ({
    status: filter,
    userId: userFilter,
    period: periodFilter,
    search: searchQuery || undefined,
    ...advancedFilters,
  }), [filter, userFilter, periodFilter, searchQuery, advancedFilters]);

  // ── Build query params from filter opts ────────────────────────────────

  const buildFilterParams = useCallback((opts?: Record<string, string | undefined>): URLSearchParams => {
    const params = new URLSearchParams();
    if (!opts) return params;
    const statusMap: Record<string, string> = { active: "OPEN", won: "WON", lost: "LOST" };
    for (const [key, val] of Object.entries(opts)) {
      if (!val || val === "all") continue;
      if (key === "status") {
        params.set("status", statusMap[val] || val);
      } else {
        params.set(key, val);
      }
    }
    return params;
  }, []);

  // ── Fetch summary for a pipeline (with optional filters) ────────────────

  const fetchSummary = useCallback(
    async (
      id: string,
      opts?: Record<string, string | undefined>
    ) => {
      try {
        const params = buildFilterParams(opts);

        const qs = params.toString();
        const url = `/pipelines/${id}/summary${qs ? `?${qs}` : ""}`;
        const res = await api.get<ApiSummaryResponse>(url);
        const sorted = [...res.data.stages].sort((a, b) => a.order - b.order);
        setStageSummaries(
          sorted.map((s, idx) => ({
            id: s.id,
            name: s.name,
            color: stageColor(s.color, idx),
            dealCount: s.dealCount,
            totalValue: s.totalValue,
          }))
        );
        setTotalDeals(res.data.totalDeals);

        if (sorted.length > 0) setDefaultStageId(sorted[0].id);
      } catch {
        // summary fetch failure is non-fatal
      }
    },
    []
  );

  // ── Fetch batch deals for kanban ───────────────────────────────────────

  const fetchBatchDeals = useCallback(
    async (id: string, opts?: Record<string, string | undefined>) => {
      setBatchDeals({});
      try {
        const params = buildFilterParams(opts);
        const qs = params.toString();
        const url = `/pipelines/${id}/deals-by-stage${qs ? `?${qs}` : ""}`;
        const res = await api.get<DealsByStageResponse>(url);
        setBatchDeals(res.data.stages);

        // Update stageDealsRef for drag-and-drop
        for (const [stageId, stageData] of Object.entries(res.data.stages)) {
          stageDealsRef.current[stageId] = stageData.deals;
        }
      } catch {
        setBatchDeals({});
      }
    },
    []
  );

  // Build opts object from all filters
  const allFilterOpts = useMemo(() => ({
    status: filter,
    userId: userFilter,
    period: periodFilter,
    search: searchQuery || undefined,
    ...advancedFilters,
  }), [filter, userFilter, periodFilter, searchQuery, advancedFilters]);

  // Re-fetch summary + batch deals when filters change
  useEffect(() => {
    if (pipelineId) {
      fetchSummary(pipelineId, allFilterOpts);
      if (view === "kanban") {
        fetchBatchDeals(pipelineId, allFilterOpts);
      }
    }
  }, [pipelineId, allFilterOpts, fetchSummary, fetchBatchDeals, view]);

  // ── Fetch users ──────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get<ApiUsersResponse>("/users");
      setUsers(res.data);
    } catch {
      // If /users endpoint doesn't exist, fail silently
      setUsers([]);
    }
  }, []);

  // ── Fetch pipeline detail (stages only, no deals) ───────────────────────

  const fetchPipelineDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const detailRes = await api.get<ApiPipelineDetailResponse>(`/pipelines/${id}`);

        const pipeline = detailRes.data;
        const sorted = [...pipeline.stages].sort(
          (a, b) => a.order - b.order
        );

        // Build initial stage list from pipeline structure;
        // the useEffect that watches pipelineId will call fetchSummary with filters
        setStageSummaries(
          sorted.map((s, idx) => ({
            id: s.id,
            name: s.name,
            color: stageColor(s.color, idx),
            dealCount: 0,
            totalValue: 0,
          }))
        );

        if (sorted.length > 0) setDefaultStageId(sorted[0].id);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erro ao carregar pipeline";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── Fetch pipelines list on mount ───────────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const listRes = await api.get<ApiPipelinesResponse>("/pipelines");
      const list = listRes.data;

      if (!list || list.length === 0) {
        setStageSummaries([]);
        setLoading(false);
        return;
      }

      setPipelines(list);
      const first = list[0];
      setPipelineId(first.id);

      await Promise.all([fetchPipelineDetail(first.id), fetchUsers()]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar pipeline";
      setError(message);
      setLoading(false);
    }
  }, [fetchPipelineDetail, fetchUsers]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // ── Pipeline switcher ───────────────────────────────────────────────────

  const handlePipelineChange = useCallback(
    async (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setPipelineId(id);
      setFilter("all");
      setUserFilter("all");
      setPeriodFilter("all");
      setSearchInput("");
      setSearchQuery("");
      setAdvancedFilters({});
      setInjectedDeals({});
      stageDealsRef.current = {};
      await fetchPipelineDetail(id);
    },
    [fetchPipelineDetail]
  );

  // ── List view: fetch deals ──────────────────────────────────────────────

  const fetchListDeals = useCallback(
    async (pageNum: number) => {
      if (!pipelineId) return;
      setListLoading(true);
      try {
        const params = buildFilterParams(allFilterOpts);
        params.set("page", String(pageNum));
        params.set("limit", String(LIST_PAGE_SIZE));

        const res = await api.get<DealsResponse>(
          `/pipelines/${pipelineId}/deals?${params.toString()}`
        );
        setListDeals(res.data);
        setListPage(res.meta.page);
        setListTotalPages(res.meta.totalPages);
        setListTotal(res.meta.total);
      } catch {
        setListDeals([]);
      } finally {
        setListLoading(false);
      }
    },
    [pipelineId, allFilterOpts, buildFilterParams]
  );

  // Fetch list deals when switching to list view or filters change
  useEffect(() => {
    if (view === "list" && pipelineId) {
      setListPage(1);
      fetchListDeals(1);
    }
  }, [view, pipelineId, allFilterOpts, fetchListDeals]);

  // ── Drag and drop ───────────────────────────────────────────────────────

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const srcDeals = [...(stageDealsRef.current[source.droppableId] || [])];
    const dstDeals =
      source.droppableId === destination.droppableId
        ? srcDeals
        : [...(stageDealsRef.current[destination.droppableId] || [])];

    const [moved] = srcDeals.splice(source.index, 1);
    if (!moved) return;

    const dstStageSummary = stageSummaries.find(
      (s) => s.id === destination.droppableId
    );
    const updatedDeal: Deal = {
      ...moved,
      stage: {
        id: destination.droppableId,
        name: dstStageSummary?.name || moved.stage.name,
      },
    };
    dstDeals.splice(destination.index, 0, updatedDeal);

    // Optimistic update via injected deals
    const newInjected: Record<string, Deal[]> = {};
    newInjected[source.droppableId] = srcDeals;
    if (source.droppableId !== destination.droppableId) {
      newInjected[destination.droppableId] = dstDeals;
    }
    setInjectedDeals(newInjected);

    // Also update the ref
    stageDealsRef.current[source.droppableId] = srcDeals;
    if (source.droppableId !== destination.droppableId) {
      stageDealsRef.current[destination.droppableId] = dstDeals;
    }

    // Persist to API
    try {
      await api.patch(`/deals/${draggableId}/stage`, {
        stageId: destination.droppableId,
      });
      setInjectedDeals({});
      if (pipelineId) {
        fetchSummary(pipelineId, allFilterOpts);
        fetchBatchDeals(pipelineId, allFilterOpts);
      }
    } catch {
      setInjectedDeals({});
      if (pipelineId) {
        fetchSummary(pipelineId, allFilterOpts);
        fetchBatchDeals(pipelineId, allFilterOpts);
      }
    }
  };

  // ── Track deals loaded by each StageColumn ──────────────────────────────

  const handleDealsLoaded = useCallback(
    (stageId: string, deals: Deal[]) => {
      stageDealsRef.current[stageId] = deals;
    },
    []
  );

  // ── New deal created ────────────────────────────────────────────────────

  const handleDealCreated = useCallback(
    (_deal: Deal) => {
      if (pipelineId) {
        fetchSummary(pipelineId, allFilterOpts);
        fetchBatchDeals(pipelineId, allFilterOpts);
        setInjectedDeals({});
      }
      if (view === "list") {
        fetchListDeals(listPage);
      }
    },
    [pipelineId, fetchSummary, fetchBatchDeals, allFilterOpts, view, fetchListDeals, listPage]
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Pipeline Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            className={`p-1.5 transition-colors ${
              view === "kanban"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
            title="Visualização Kanban"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-1.5 border-l border-gray-200 transition-colors ${
              view === "list"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
            title="Visualização Lista"
          >
            <List size={15} />
          </button>
        </div>

        {/* Funil dropdown */}
        <div className="relative">
          <select
            value={pipelineId || ""}
            onChange={handlePipelineChange}
            className={`${SELECT_CLASS} text-gray-700 font-medium`}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {pipelines.length === 0 && <option value="">Vendas</option>}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
            ▾
          </span>
        </div>

        {/* User dropdown */}
        <div className="relative">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className={`${SELECT_CLASS} text-gray-600`}
          >
            <option value="all">Todas as negociações</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
            ▾
          </span>
        </div>

        {/* Período dropdown */}
        <div className="relative">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className={`${SELECT_CLASS} text-gray-600`}
          >
            <option value="all">Todos os períodos</option>
            <option value="this_month">Este mês</option>
            <option value="last_3">Últimos 3 meses</option>
            <option value="last_6">Últimos 6 meses</option>
            <option value="this_year">Este ano</option>
          </select>
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar negociação..."
            className="pl-8 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-md w-48 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Advanced filters button */}
        <button
          onClick={() => setAdvancedOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors ${
            advancedCount > 0
              ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <SlidersHorizontal size={14} />
          Filtros
          {advancedCount > 0 && (
            <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-medium">
              {advancedCount}
            </span>
          )}
        </button>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 ml-1">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "active", label: "Em andamento" },
              { value: "won", label: "Ganhos" },
              { value: "lost", label: "Perdidos" },
            ] as { value: FilterType; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Deals badge */}
        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
          {totalDeals} Negociações
        </span>

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors shadow-sm"
          >
            <Plus size={14} />
            Criar
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Loader2 size={32} className="animate-spin" />
            <p className="text-sm">Carregando pipeline…</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm text-center">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-3">
              {error}
            </p>
            <button
              onClick={fetchPipeline}
              className="text-sm text-blue-600 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Empty pipeline */}
      {!loading && !error && stageSummaries.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">Nenhum pipeline encontrado.</p>
        </div>
      )}

      {/* Kanban Board */}
      {!loading && !error && stageSummaries.length > 0 && view === "kanban" && pipelineId && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
            <div className="flex gap-3 h-full min-w-max">
              {stageSummaries.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  pipelineId={pipelineId}
                  filters={apiFilters}
                  initialDeals={batchDeals[stage.id]?.deals}
                  initialTotal={batchDeals[stage.id]?.total}
                  injectedDeals={injectedDeals[stage.id]}
                  onAddDeal={() => setIsModalOpen(true)}
                  onDealsLoaded={handleDealsLoaded}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
      )}

      {/* List View */}
      {!loading && !error && stageSummaries.length > 0 && view === "list" && (
        <div className="flex-1 overflow-auto p-4">
          {listLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Título</TableHeader>
                    <TableHeader>Etapa</TableHeader>
                    <TableHeader>Valor</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Contato / Empresa</TableHeader>
                    <TableHeader>Responsável</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listDeals.map((deal) => (
                    <TableRow
                      key={deal.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/pipeline/${deal.id}`)}
                    >
                      <TableCell className="font-medium text-gray-900">
                        {deal.title}
                      </TableCell>
                      <TableCell>{deal.stage?.name ?? "—"}</TableCell>
                      <TableCell className="font-semibold text-blue-600">
                        {formatCurrency(deal.value ?? 0)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={deal.status} />
                      </TableCell>
                      <TableCell>
                        {deal.organization?.name ?? deal.contact?.name ?? "—"}
                      </TableCell>
                      <TableCell>{deal.user?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {listDeals.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-gray-400 py-8"
                      >
                        Nenhuma negociação encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination controls */}
              {listTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs text-gray-500">
                    Mostrando {(listPage - 1) * LIST_PAGE_SIZE + 1}–
                    {Math.min(listPage * LIST_PAGE_SIZE, listTotal)} de{" "}
                    {listTotal}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchListDeals(listPage - 1)}
                      disabled={listPage <= 1}
                      className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-600 px-2">
                      {listPage} / {listTotalPages}
                    </span>
                    <button
                      onClick={() => fetchListDeals(listPage + 1)}
                      disabled={listPage >= listTotalPages}
                      className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Nova Negociação modal */}
      {pipelineId && (
        <NewDealModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          pipelineId={pipelineId}
          defaultStageId={defaultStageId}
          onDealCreated={handleDealCreated}
        />
      )}

      {/* Advanced Filters modal */}
      <AdvancedFiltersModal
        isOpen={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        current={advancedFilters}
        onApply={setAdvancedFilters}
      />
    </div>
  );
}
