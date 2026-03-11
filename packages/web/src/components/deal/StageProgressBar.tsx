"use client";

import clsx from "clsx";

interface Stage {
  id: string;
  name: string;
}

interface StageProgressBarProps {
  stages: Stage[];
  currentStageId: string;
  status?: "active" | "won" | "lost";
  onStageClick?: (stageId: string) => void;
}

export default function StageProgressBar({
  stages,
  currentStageId,
  status = "active",
  onStageClick,
}: StageProgressBarProps) {
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);

  // Para negociações perdidas, exibe etapas extras de contexto ao final
  const displayStages =
    status === "lost"
      ? [
          ...stages,
          { id: "__lost__", name: "Perda Fechada" },
        ]
      : stages;

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200">
      {displayStages.map((stage, idx) => {
        const isLostExtra = stage.id === "__lost__";
        const isPast = !isLostExtra && idx < currentIdx;
        const isCurrent = !isLostExtra && stage.id === currentStageId;
        const isFuture = !isPast && !isCurrent;

        const isLostStage = status === "lost" && isLostExtra;

        return (
          <button
            key={stage.id}
            type="button"
            disabled={isLostExtra || !onStageClick}
            onClick={() => !isLostExtra && onStageClick?.(stage.id)}
            className={clsx(
              "relative flex items-center justify-center whitespace-nowrap text-xs font-medium",
              "h-7 px-3 first:rounded-l-full last:rounded-r-full transition-colors",
              "border-y border-r first:border-l",
              "-mr-px", // sobreposição para efeito de cadeia
              isPast && "bg-blue-500 text-white border-blue-500 hover:bg-blue-600",
              isCurrent && "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 ring-offset-0 z-10",
              isFuture && !isLostStage && "bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600",
              isLostStage && "bg-red-100 text-red-500 border-red-200 cursor-default"
            )}
          >
            {/* Checkmark para etapas passadas */}
            {isPast && (
              <svg
                className="mr-1 flex-shrink-0"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
              >
                <path
                  d="M1.5 5L4 7.5L8.5 2.5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {stage.name}
          </button>
        );
      })}
    </div>
  );
}
