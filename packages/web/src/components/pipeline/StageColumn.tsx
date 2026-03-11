"use client";

import { Droppable } from "@hello-pangea/dnd";
import { Plus, MoreHorizontal } from "lucide-react";
import DealCard, { Deal } from "./DealCard";
import { formatCurrency } from "@/lib/formatters";
import clsx from "clsx";

export interface Stage {
  id: string;
  name: string;
  color?: string;
  deals: Deal[];
}

interface StageColumnProps {
  stage: Stage;
  onAddDeal?: () => void;
}

const totalValue = (deals: Deal[]) =>
  deals.reduce((sum, d) => sum + d.value, 0);

export default function StageColumn({ stage, onAddDeal }: StageColumnProps) {
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
              ({stage.deals.length})
            </span>
            <span className="text-xs text-gray-500 font-medium flex-shrink-0 ml-1">
              {formatCurrency(totalValue(stage.deals))}
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
            <button className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <MoreHorizontal size={13} />
            </button>
          </div>
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
            {stage.deals.length === 0 && !snapshot.isDraggingOver ? (
              <div className="flex items-center justify-center h-20 text-xs text-gray-400 text-center border-2 border-dashed border-gray-200 rounded-lg bg-white">
                Nenhuma negociação
              </div>
            ) : (
              stage.deals.map((deal, index) => (
                <DealCard key={deal.id} deal={deal} index={index} />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
