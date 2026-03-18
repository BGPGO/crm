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
  const firstCount = stages[0]?.count || 1;

  return (
    <div className="space-y-0">
      {stages.map((stage, i) => {
        const prevCount = i === 0 ? firstCount : stages[i - 1].count;
        const convFromPrev = prevCount > 0 ? ((stage.count / prevCount) * 100) : 0;
        const convFromTotal = firstCount > 0 ? ((stage.count / firstCount) * 100) : 0;

        // Width narrows as funnel progresses: first stage = 100%, each subsequent gets proportionally smaller
        const widthPct = firstCount > 0 ? Math.max((stage.count / firstCount) * 100, 15) : 100;
        const isHovered = hoveredIndex === i;
        const isFirst = i === 0;
        const isLast = i === stages.length - 1;

        return (
          <div key={stage.name}>
            {/* Conversion arrow between stages */}
            {i > 0 && (
              <div className="flex items-center justify-center py-0.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-gray-400">↓</span>
                  <span className={`font-semibold ${convFromPrev >= 50 ? 'text-green-600' : convFromPrev >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {convFromPrev.toFixed(0)}%
                  </span>
                </div>
              </div>
            )}

            {/* Funnel stage row */}
            <div
              className="flex items-center gap-3 group cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Stage name */}
              <div className="w-32 flex-shrink-0 text-right">
                <span className="text-xs text-gray-600 font-medium truncate block">{stage.name}</span>
              </div>

              {/* Trapezoid bar */}
              <div className="flex-1 flex justify-center relative">
                <div
                  className="h-9 rounded-sm transition-all duration-300 flex items-center justify-center relative"
                  style={{
                    width: `${widthPct}%`,
                    minWidth: '60px',
                    backgroundColor: stage.color,
                    opacity: isHovered ? 1 : 0.85,
                    clipPath: isFirst
                      ? `polygon(0 0, 100% 0, ${100 - 2}% 100%, 2% 100%)`
                      : isLast
                      ? `polygon(2% 0, ${100 - 2}% 0, ${100 - 4}% 100%, 4% 100%)`
                      : `polygon(1% 0, ${100 - 1}% 0, ${100 - 3}% 100%, 3% 100%)`,
                  }}
                >
                  <span className="text-white text-xs font-bold drop-shadow-sm">
                    {stage.count}
                  </span>
                </div>

                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none">
                    <p className="font-semibold mb-1">{stage.name}</p>
                    <p>{stage.count} negociações — {formatCurrency(stage.value)}</p>
                    {i > 0 && <p>Conversão da etapa anterior: <strong>{convFromPrev.toFixed(1)}%</strong></p>}
                    <p>Conversão do funil: <strong>{convFromTotal.toFixed(1)}%</strong></p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #111827' }} />
                  </div>
                )}
              </div>

              {/* Right side: value + conversion */}
              <div className="w-36 flex-shrink-0 flex flex-col">
                <span className="text-xs font-medium text-gray-700">{formatCurrency(stage.value)}</span>
                <span className="text-[10px] text-gray-400">
                  {convFromTotal.toFixed(0)}% do funil
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
