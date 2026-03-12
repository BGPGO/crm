"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";

export interface FunnelStage {
  name: string;
  color: string;
  count: number;
  value: number;
}

interface FunnelChartProps {
  stages: FunnelStage[];
}

export default function FunnelChart({ stages }: FunnelChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const widthPct = stage.count === 0 ? 2 : Math.max((stage.count / maxCount) * 100, 4);
        const isHovered = hoveredIndex === i;

        return (
          <div
            key={stage.name}
            className="relative flex items-center gap-3 group"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Label esquerda */}
            <div className="w-36 flex-shrink-0 text-right">
              <span className="text-xs text-gray-600 font-medium truncate block">
                {stage.name}
              </span>
            </div>

            {/* Barra */}
            <div className="flex-1 relative h-8">
              <div className="flex items-center h-full gap-1.5">
                <div
                  className="h-full rounded-md transition-all duration-200 flex items-center justify-center"
                  style={{
                    width: `${widthPct}%`,
                    minWidth: stage.count === 0 ? "8px" : "24px",
                    backgroundColor: stage.color,
                    opacity: isHovered ? 1 : 0.85,
                  }}
                >
                  {widthPct >= 6 && (
                    <span className="text-white text-xs font-semibold whitespace-nowrap px-2">
                      {stage.count}
                    </span>
                  )}
                </div>
                {widthPct < 6 && (
                  <span className="text-xs font-semibold text-gray-500">
                    {stage.count}
                  </span>
                )}
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute left-0 bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none">
                  <p className="font-semibold mb-0.5">{stage.name}</p>
                  <p>{stage.count} negociações</p>
                  <p>{formatCurrency(stage.value)}</p>
                  <div
                    className="absolute top-full left-4 w-0 h-0"
                    style={{
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: "5px solid #111827",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Valor direita */}
            <div className="w-28 flex-shrink-0">
              <span className="text-xs text-gray-500">
                {formatCurrency(stage.value)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
