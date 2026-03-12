"use client";

import { useState, useEffect, useCallback } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import StageColumn from "@/components/pipeline/StageColumn";
import NewDealModal from "@/components/pipeline/NewDealModal";
import {
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  X,
  Loader2,
} from "lucide-react";
import type { Stage } from "@/components/pipeline/StageColumn";
import type { Deal } from "@/components/pipeline/DealCard";
import { api } from "@/lib/api";

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
  deals: Deal[];
}

interface ApiPipelineDetailResponse {
  data: ApiPipelineDetail;
}

// ─── Filter type ──────────────────────────────────────────────────────────────

type FilterType = "all" | "active" | "won" | "lost";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterDeals(deals: Deal[], filter: FilterType): Deal[] {
  if (filter === "all") return deals;
  if (filter === "active") return deals.filter((d) => d.status === "OPEN");
  if (filter === "won") return deals.filter((d) => d.status === "WON");
  if (filter === "lost") return deals.filter((d) => d.status === "LOST");
  return deals;
}

// Map a tailwind color class to one of the safe pipeline stage colors.
// The API may return arbitrary strings; we keep a small allow-list.
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

function stageColor(color?: string, index = 0): string {
  if (color && ALLOWED_COLORS.includes(color)) return color;
  return ALLOWED_COLORS[index % ALLOWED_COLORS.length];
}

// Build Stage array from a pipeline detail response
function buildStages(pipeline: ApiPipelineDetail): Stage[] {
  const sorted = [...pipeline.stages].sort((a, b) => a.order - b.order);

  return sorted.map((s, idx) => ({
    id: s.id,
    name: s.name,
    color: stageColor(s.color, idx),
    deals: pipeline.deals
      .filter((d) => d.stage?.id === s.id)
      .map((d) => ({ ...d, value: Number(d.value) || 0 })),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineName, setPipelineName] = useState("Vendas");
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterType>("all");
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Fetch pipeline on mount ─────────────────────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get list of pipelines — use the first one as default
      const listRes = await api.get<ApiPipelinesResponse>("/pipelines");
      const pipelines = listRes.data;

      if (!pipelines || pipelines.length === 0) {
        setStages([]);
        setLoading(false);
        return;
      }

      const first = pipelines[0];
      setPipelineId(first.id);
      setPipelineName(first.name);

      // 2. Get full pipeline detail (with deals)
      const detailRes = await api.get<ApiPipelineDetailResponse>(
        `/pipelines/${first.id}`
      );
      const pipeline = detailRes.data;

      const builtStages = buildStages(pipeline);
      setStages(builtStages);

      // Default stage = first stage in order
      const sortedStages = [...pipeline.stages].sort(
        (a, b) => a.order - b.order
      );
      if (sortedStages.length > 0) setDefaultStageId(sortedStages[0].id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar pipeline";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  // ── Drag and drop ───────────────────────────────────────────────────────────

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    // Capture previous state for rollback
    const previousStages = stages;

    // Optimistic update
    setStages((prev) => {
      const next = prev.map((s) => ({ ...s, deals: [...s.deals] }));
      const srcStage = next.find((s) => s.id === source.droppableId)!;
      const dstStage = next.find((s) => s.id === destination.droppableId)!;
      const [moved] = srcStage.deals.splice(source.index, 1);
      // Update the deal's stage reference optimistically
      const updatedDeal: Deal = {
        ...moved,
        stage: { id: destination.droppableId, name: dstStage.name },
      };
      dstStage.deals.splice(destination.index, 0, updatedDeal);
      return next;
    });

    // Persist to API
    try {
      await api.patch(`/deals/${draggableId}/stage`, {
        stageId: destination.droppableId,
      });
    } catch {
      // Revert on failure
      setStages(previousStages);
    }
  };

  // ── New deal created ────────────────────────────────────────────────────────

  const handleDealCreated = useCallback((deal: Deal) => {
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== deal.stage?.id) return s;
        return { ...s, deals: [deal, ...s.deals] };
      })
    );
  }, []);

  // ── Derived state ───────────────────────────────────────────────────────────

  const visibleStages = stages.map((s) => ({
    ...s,
    deals: filterDeals(s.deals, filter),
  }));

  const totalDeals = visibleStages.reduce((sum, s) => sum + s.deals.length, 0);

  // ── Render ──────────────────────────────────────────────────────────────────

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
        <button className="flex items-center gap-1.5 text-sm text-gray-700 font-medium bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          {pipelineName}
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {/* Minhas negociações dropdown */}
        <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          Minhas negociações
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {/* Período dropdown */}
        <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          Todos os períodos
          <ChevronDown size={13} className="text-gray-400" />
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
          <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <SlidersHorizontal size={13} />
            Filtros (0)
          </button>
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
      {!loading && !error && stages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">Nenhum pipeline encontrado.</p>
        </div>
      )}

      {/* Kanban Board */}
      {!loading && !error && stages.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
            <div className="flex gap-3 h-full min-w-max">
              {visibleStages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  onAddDeal={() => setIsModalOpen(true)}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
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
    </div>
  );
}
