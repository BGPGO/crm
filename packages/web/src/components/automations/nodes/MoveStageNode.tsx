"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface Stage {
  id: string;
  name: string;
}

export default function MoveStageNode({ config, onChange }: NodeConfigProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStages() {
      try {
        const res = await api.get<{ data: Stage[] }>("/pipeline-stages");
        setStages(res.data || []);
      } catch {
        // API might not be ready
      } finally {
        setLoading(false);
      }
    }
    loadStages();
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Mover para etapa
        </label>
        {loading ? (
          <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <select
            value={config.stageId || ""}
            onChange={(e) => {
              const stage = stages.find((s) => s.id === e.target.value);
              onChange({
                ...config,
                stageId: e.target.value,
                stageName: stage?.name || "",
              });
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
          >
            <option value="">Selecionar etapa...</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
