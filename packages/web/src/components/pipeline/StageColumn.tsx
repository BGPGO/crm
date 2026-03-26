"use client";

import { useState, useEffect, useCallback } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Plus, Loader2, ChevronDown } from "lucide-react";
import DealCard, { Deal } from "./DealCard";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api";
import clsx from "clsx";

export interface StageSummary {
  id: string;
  name: string;
  color?: string;
  dealCount: number;
  totalValue: number;
}

export interface Stage {
  id: string;
  name: string;
  color?: string;
  deals: Deal[];
}

interface DealsResponse {
  data: Deal[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

interface StageColumnProps {
  stage: StageSummary;
  pipelineId: string;
  filters: {
    status?: string;
    userId?: string;
    period?: string;
    search?: string;
  };
  /** Pre-loaded deals from batch endpoint (skips initial fetch when present) */
  initialDeals?: Deal[];
  /** Pre-loaded total count from batch endpoint */
  initialTotal?: number;
  /** Externally injected deals (e.g. after drag-and-drop optimistic update) */
  injectedDeals?: Deal[];
  showTicketMedio?: boolean;
  onAddDeal?: () => void;
  onDealsLoaded?: (stageId: string, deals: Deal[]) => void;
}

const PAGE_SIZE = 50;

export default function StageColumn({
  stage,
  pipelineId,
  filters,
  initialDeals,
  initialTotal,
  injectedDeals,
  showTicketMedio,
  onAddDeal,
  onDealsLoaded,
}: StageColumnProps) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals ?? []);
  const [page, setPage] = useState(1);
  const [totalDeals, setTotalDeals] = useState(initialTotal ?? stage.dealCount);
  const [loading, setLoading] = useState(!initialDeals);
  const [loadingMore, setLoadingMore] = useState(false);

  // Destructure to get stable primitive deps
  const { status: fStatus, userId: fUserId, period: fPeriod, search: fSearch } = filters;

  // Build query string from filters
  const buildQuery = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("stageId", stage.id);
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (fStatus && fStatus !== "all") {
        const statusMap: Record<string, string> = {
          active: "OPEN",
          won: "WON",
          lost: "LOST",
        };
        params.set("status", statusMap[fStatus] || fStatus);
      }
      if (fUserId && fUserId !== "all") {
        params.set("userId", fUserId);
      }
      if (fPeriod && fPeriod !== "all") {
        params.set("period", fPeriod);
      }
      if (fSearch) {
        params.set("search", fSearch);
      }
      return params.toString();
    },
    [stage.id, fStatus, fUserId, fPeriod, fSearch]
  );

  // Use initialDeals from batch endpoint when available
  useEffect(() => {
    if (initialDeals) {
      setDeals(initialDeals);
      setTotalDeals(initialTotal ?? initialDeals.length);
      setPage(1);
      setLoading(false);
      onDealsLoaded?.(stage.id, initialDeals);
    } else if (initialDeals === undefined) {
      // Parent is loading new batch — show loading state
      setLoading(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDeals, initialTotal]);

  // Fetch first page only when no initialDeals provided
  useEffect(() => {
    if (initialDeals) return; // Skip: parent already provided data
    let cancelled = false;

    async function fetchDeals() {
      setLoading(true);
      try {
        const qs = buildQuery(1);
        const res = await api.get<DealsResponse>(
          `/pipelines/${pipelineId}/deals?${qs}`
        );
        if (!cancelled) {
          setDeals(res.data);
          setTotalDeals(res.meta.total);
          setPage(1);
          onDealsLoaded?.(stage.id, res.data);
        }
      } catch {
        if (!cancelled) {
          setDeals([]);
          setTotalDeals(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDeals();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, stage.id, buildQuery, initialDeals]);

  // Handle injected deals from drag-and-drop
  useEffect(() => {
    if (injectedDeals) {
      setDeals(injectedDeals);
    }
  }, [injectedDeals]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const qs = buildQuery(nextPage);
      const res = await api.get<DealsResponse>(
        `/pipelines/${pipelineId}/deals?${qs}`
      );
      setDeals((prev) => [...prev, ...res.data]);
      setPage(nextPage);
      setTotalDeals(res.meta.total);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = deals.length < totalDeals;

  return (
    <div className="flex flex-col w-64 flex-shrink-0 bg-white rounded-lg overflow-hidden border border-gray-200">
      {/* Column Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
              {stage.name}
            </h3>
            <span className="text-xs text-gray-400 font-medium flex-shrink-0">
              ({stage.dealCount})
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0 ml-2">
            <button
              onClick={onAddDeal}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Adicionar negociação"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-500 font-medium">
            {formatCurrency(stage.totalValue)}
          </span>
          {showTicketMedio && stage.dealCount > 0 && (
            <span className="text-[10px] text-gray-400">
              · TM {formatCurrency(stage.totalValue / stage.dealCount)}
            </span>
          )}
        </div>
      </div>

      {/* Cards — Droppable area */}
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={clsx(
              "flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] transition-colors duration-150",
              snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-50"
            )}
          >
            {loading ? (
              <div className="flex items-center justify-center h-20">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : deals.length === 0 && !snapshot.isDraggingOver ? (
              <div className="flex items-center justify-center h-20 text-xs text-gray-400 text-center border-2 border-dashed border-gray-200 rounded-lg bg-white">
                Nenhuma negociação
              </div>
            ) : (
              <>
                {deals.map((deal, index) => (
                  <DealCard key={deal.id} deal={deal} index={index} />
                ))}
                {hasMore && (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    Carregar mais ({deals.length}/{totalDeals})
                  </button>
                )}
              </>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
