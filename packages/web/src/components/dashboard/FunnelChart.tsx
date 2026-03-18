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
  const firstCount = stages[0]?.count || 1;

  return (
    <div className="space-y-1.5 mt-1">
      {stages.map((stage, i) => {
        const widthPct = stage.count === 0 ? 3 : Math.max((stage.count / maxCount) * 100, 5);
        const isHovered = hoveredIndex === i;
        const prevCount = i === 0 ? firstCount : stages[i - 1].count;
        const convFromPrev = prevCount > 0 ? (stage.count / prevCount) * 100 : 0;
        const convFromTotal = firstCount > 0 ? (stage.count / firstCount) * 100 : 0;

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
              <div className="flex items-center h-full gap-2">
                <div
                  className="h-full rounded-md transition-all duration-200 flex items-center"
                  style={{
                    width: `${widthPct}%`,
                    minWidth: stage.count === 0 ? "8px" : "32px",
                    backgroundColor: stage.color,
                    opacity: isHovered ? 1 : 0.85,
                  }}
                >
                  <span className="text-white text-xs font-bold px-2 whitespace-nowrap">
                    {stage.count}
                  </span>
                </div>

                {/* Conversion badge */}
                {i > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      convFromPrev >= 50
                        ? "bg-green-100 text-green-700"
                        : convFromPrev >= 25
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {convFromPrev.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute left-0 bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none">
                  <p className="font-semibold mb-0.5">{stage.name}</p>
                  <p>{stage.count} negociações — {formatCurrency(stage.value)}</p>
                  {i > 0 && (
                    <p>
                      Conversão da etapa anterior:{" "}
                      <strong>{convFromPrev.toFixed(1)}%</strong>
                    </p>
                  )}
                  <p>
                    Conversão do funil:{" "}
                    <strong>{convFromTotal.toFixed(1)}%</strong>
                  </p>
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
