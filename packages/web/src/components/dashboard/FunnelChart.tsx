"use client";

import { useState, useMemo } from "react";
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
  const [cumulative, setCumulative] = useState(true);

  // Cumulative: each stage = its count + sum of all stages below it
  const cumulativeStages = useMemo(() => {
    if (!cumulative) return stages;
    const result: FunnelStage[] = [];
    for (let i = 0; i < stages.length; i++) {
      let accCount = 0;
      let accValue = 0;
      for (let j = i; j < stages.length; j++) {
        accCount += stages[j].count;
        accValue += stages[j].value;
      }
      result.push({ ...stages[i], count: accCount, value: accValue });
    }
    return result;
  }, [stages, cumulative]);

  const displayStages = cumulativeStages;
  const maxCount = Math.max(...displayStages.map((s) => s.count), 1);
  const firstCount = displayStages[0]?.count || 1;

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setCumulative(false)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            !cumulative
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Por etapa
        </button>
        <button
          onClick={() => setCumulative(true)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            cumulative
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          Acumulado
        </button>
        <span className="text-[10px] text-gray-400 ml-1">
          {cumulative
            ? "Cada etapa inclui as etapas abaixo"
            : "Negociações na etapa atual"}
        </span>
      </div>

      {/* Bars */}
      <div className="space-y-1.5">
        {displayStages.map((stage, i) => {
          const widthPct =
            stage.count === 0
              ? 3
              : Math.max((stage.count / maxCount) * 100, 5);
          const isHovered = hoveredIndex === i;
          const prevCount =
            i === 0 ? firstCount : displayStages[i - 1].count;
          const convFromPrev =
            prevCount > 0 ? (stage.count / prevCount) * 100 : 0;
          const convFromTotal =
            firstCount > 0 ? (stage.count / firstCount) * 100 : 0;

          // Original (non-cumulative) counts for tooltip
          const originalCount = stages[i].count;
          const originalValue = stages[i].value;

          return (
            <div
              key={stage.name}
              className="relative flex items-center gap-3 group"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Label */}
              <div className="w-36 flex-shrink-0 text-right">
                <span className="text-xs text-gray-600 font-medium truncate block">
                  {stage.name}
                </span>
              </div>

              {/* Bar */}
              <div className="flex-1 relative h-8">
                <div className="flex items-center h-full gap-2">
                  <div
                    className="h-full rounded-md transition-all duration-300 flex items-center"
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
                  {cumulative && i > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
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
                  <div className="absolute left-0 bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl whitespace-nowrap pointer-events-none">
                    <p className="font-semibold mb-1">{stage.name}</p>
                    {cumulative ? (
                      <>
                        <p>
                          Acumulado: {stage.count} neg. —{" "}
                          {formatCurrency(stage.value)}
                        </p>
                        <p className="text-gray-400">
                          Nesta etapa: {originalCount} neg. —{" "}
                          {formatCurrency(originalValue)}
                        </p>
                      </>
                    ) : (
                      <p>
                        {stage.count} negociações —{" "}
                        {formatCurrency(stage.value)}
                      </p>
                    )}
                    {i > 0 && (
                      <p className="mt-0.5">
                        Conversão:{" "}
                        <strong>{convFromPrev.toFixed(1)}%</strong>
                        <span className="text-gray-400">
                          {" "}
                          (do funil: {convFromTotal.toFixed(1)}%)
                        </span>
                      </p>
                    )}
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

              {/* Value + conversion */}
              <div className="w-32 flex-shrink-0 flex flex-col">
                <span className="text-xs text-gray-600 font-medium">
                  {formatCurrency(stage.value)}
                </span>
                {cumulative && i > 0 && (
                  <span className="text-[10px] text-gray-400">
                    {convFromTotal.toFixed(0)}% do total
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
