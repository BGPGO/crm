"use client";

import { Plus } from "lucide-react";

interface FlowConnectorProps {
  onAdd: () => void;
}

export default function FlowConnector({ onAdd }: FlowConnectorProps) {
  return (
    <div className="flex flex-col items-center relative">
      {/* Vertical dashed line */}
      <div className="h-10 border-l-2 border-dashed border-gray-300" />

      {/* Add button centered on the line */}
      <button
        onClick={onAdd}
        className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-dashed border-gray-300 bg-white flex items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-colors z-10"
        title="Adicionar etapa"
      >
        <Plus size={14} />
      </button>

      {/* Arrow pointing down */}
      <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-gray-300" />
    </div>
  );
}
