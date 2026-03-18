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
  if (stages.length === 0) return <p className="text-sm text-gray-400 text-center py-8">Nenhuma etapa no funil</p>;

  const firstCount = stages[0]?.count || 1;
  const totalStages = stages.length;

  // SVG dimensions
  const svgWidth = 500;
  const stageHeight = 44;
  const gap = 2;
  const svgHeight = totalStages * stageHeight + (totalStages - 1) * gap;
  const minWidthPct = 0.18; // minimum 18% width for last stage

  return (
    <div className="flex gap-4 items-start mt-2">
      {/* SVG Funnel */}
      <div className="flex-1 min-w-0">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full"
          style={{ maxHeight: `${Math.max(svgHeight, 300)}px` }}
        >
          {stages.map((stage, i) => {
            const prevCount = i === 0 ? firstCount : stages[i - 1].count;
            const convFromPrev = prevCount > 0 ? (stage.count / prevCount) * 100 : 0;
            const isHovered = hoveredIndex === i;

            // Calculate widths: each stage proportional to its count, min 18%
            const topWidthPct = i === 0
              ? 1
              : Math.max((stages[i - 1].count / firstCount), minWidthPct);
            const bottomWidthPct = Math.max((stage.count / firstCount), minWidthPct);

            // If first stage, top = 100%
            const topW = i === 0 ? svgWidth : topWidthPct * svgWidth;
            const bottomW = bottomWidthPct * svgWidth;

            const y = i * (stageHeight + gap);
            const cx = svgWidth / 2;

            // Trapezoid points
            const x1Top = cx - topW / 2;
            const x2Top = cx + topW / 2;
            const x1Bot = cx - bottomW / 2;
            const x2Bot = cx + bottomW / 2;

            const points = `${x1Top},${y} ${x2Top},${y} ${x2Bot},${y + stageHeight} ${x1Bot},${y + stageHeight}`;

            return (
              <g
                key={stage.name}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                {/* Trapezoid shape */}
                <polygon
                  points={points}
                  fill={stage.color}
                  opacity={isHovered ? 1 : 0.88}
                  className="transition-opacity duration-150"
                />

                {/* Stage name */}
                <text
                  x={cx}
                  y={y + stageHeight / 2 - 6}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                  fontWeight="600"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  {stage.name}
                </text>

                {/* Count + value */}
                <text
                  x={cx}
                  y={y + stageHeight / 2 + 8}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize="10"
                  fontWeight="500"
                >
                  {stage.count} neg. — {formatCurrency(stage.value)}
                </text>

                {/* Conversion badge between stages (on the right side) */}
                {i > 0 && (
                  <>
                    <rect
                      x={x2Top + 8}
                      y={y - gap / 2 - 8}
                      width={38}
                      height={16}
                      rx={8}
                      fill={convFromPrev >= 50 ? "#DCFCE7" : convFromPrev >= 25 ? "#FEF9C3" : "#FEE2E2"}
                    />
                    <text
                      x={x2Top + 27}
                      y={y - gap / 2 + 3}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={convFromPrev >= 50 ? "#166534" : convFromPrev >= 25 ? "#854D0E" : "#991B1B"}
                    >
                      {convFromPrev.toFixed(0)}%
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Side panel: details for hovered stage */}
      <div className="w-44 flex-shrink-0 hidden sm:block">
        {hoveredIndex !== null && stages[hoveredIndex] ? (() => {
          const stage = stages[hoveredIndex];
          const i = hoveredIndex;
          const prevCount = i === 0 ? firstCount : stages[i - 1].count;
          const convFromPrev = prevCount > 0 ? (stage.count / prevCount) * 100 : 0;
          const convFromTotal = firstCount > 0 ? (stage.count / firstCount) * 100 : 0;

          return (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-semibold text-gray-800">{stage.name}</span>
              </div>
              <div className="space-y-1.5">
                <div>
                  <p className="text-[10px] text-gray-400">Negociações</p>
                  <p className="text-sm font-bold text-gray-900">{stage.count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">Valor</p>
                  <p className="text-sm font-bold text-blue-600">{formatCurrency(stage.value)}</p>
                </div>
                {i > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400">Conv. etapa anterior</p>
                    <p className={`text-sm font-bold ${convFromPrev >= 50 ? 'text-green-600' : convFromPrev >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
                      {convFromPrev.toFixed(1)}%
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-gray-400">Conv. do funil</p>
                  <p className="text-sm font-bold text-purple-600">{convFromTotal.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          );
        })() : (
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-center justify-center h-40">
            <p className="text-xs text-gray-400 text-center">Passe o mouse sobre o funil para ver detalhes</p>
          </div>
        )}
      </div>
    </div>
  );
}
