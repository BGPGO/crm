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

const fieldOptions = [
  { value: "lead_responded", label: "Lead respondeu", type: "boolean" },
  { value: "meeting_scheduled", label: "Reunião marcada", type: "boolean" },
  { value: "has_tag", label: "Tem tag", type: "text" },
  { value: "sector", label: "Setor do contato", type: "text" },
  { value: "deal_stage", label: "Etapa da negociação", type: "text" },
  { value: "deal.stageId", label: "Etapa do negócio (ID)", type: "stage" },
  { value: "has_email", label: "Tem email", type: "boolean" },
  { value: "days_in_stage", label: "Dias na etapa atual", type: "number" },
  { value: "expected_return_date", label: "Data de retorno (dias até)", type: "number" },
];

const booleanOperators = [
  { value: "is_true", label: "é verdadeiro" },
  { value: "is_false", label: "é falso" },
];

const textOperators = [
  { value: "equals", label: "igual a" },
  { value: "not_equals", label: "diferente de" },
  { value: "contains", label: "contém" },
  { value: "is_empty", label: "está vazio" },
  { value: "is_not_empty", label: "não está vazio" },
];

const numberOperators = [
  { value: "equals", label: "igual a" },
  { value: "greater_than", label: "maior que" },
  { value: "less_than", label: "menor que" },
];

export default function ConditionNode({ config, onChange }: NodeConfigProps) {
  const field = config.field || "";
  const operator = config.operator || "";
  const value = config.value || "";

  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);

  const selectedField = fieldOptions.find((f) => f.value === field);
  const fieldType = selectedField?.type ?? "text";
  const isBoolean = fieldType === "boolean";
  const isNumber = fieldType === "number";
  const isStage = fieldType === "stage";
  const noValueRequired = isBoolean || operator === "is_empty" || operator === "is_not_empty";

  const operators =
    isBoolean ? booleanOperators :
    isNumber   ? numberOperators  :
    isStage    ? textOperators.filter((op) => op.value === "equals" || op.value === "not_equals") :
                 textOperators;

  // Fetch pipeline stages when needed
  useEffect(() => {
    if (!isStage || stages.length > 0) return;
    setStagesLoading(true);
    async function loadStages() {
      try {
        const pipRes = await api.get<{ data: Array<{ id: string; stages: Stage[] }> }>("/pipelines");
        const firstPipeline = (pipRes.data || [])[0];
        if (firstPipeline?.stages) {
          setStages(firstPipeline.stages);
        } else if (firstPipeline?.id) {
          const res = await api.get<{ data: Stage[] }>(`/pipeline-stages?pipelineId=${firstPipeline.id}`);
          setStages(res.data || []);
        }
      } catch {
        // API might not be ready
      } finally {
        setStagesLoading(false);
      }
    }
    loadStages();
  }, [isStage, stages.length]);

  // Resolve stage name for display
  const stageName = isStage && value
    ? stages.find((s) => s.id === value)?.name || config._stageName || ""
    : "";

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Campo
        </label>
        <select
          value={field}
          onChange={(e) =>
            onChange({ ...config, field: e.target.value, operator: "", value: "", _stageName: "" })
          }
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
        >
          <option value="">Selecionar campo...</option>
          {fieldOptions.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {field && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Operador
          </label>
          <select
            value={operator}
            onChange={(e) => onChange({ ...config, operator: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
          >
            <option value="">Selecionar...</option>
            {operators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stage selector (when field is deal.stageId) */}
      {field && isStage && !noValueRequired && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Etapa
          </label>
          {stagesLoading ? (
            <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <select
              value={value}
              onChange={(e) => {
                const stage = stages.find((s) => s.id === e.target.value);
                onChange({
                  ...config,
                  value: e.target.value,
                  _stageName: stage?.name || "",
                });
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
            >
              <option value="">Selecionar etapa...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {stageName && (
            <p className="text-[11px] text-purple-600 mt-1 font-medium">
              Negociacao na etapa: {stageName}
            </p>
          )}
        </div>
      )}

      {/* Regular text/number value input (non-stage fields) */}
      {field && !isStage && !noValueRequired && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Valor
          </label>
          <input
            type={isNumber ? "number" : "text"}
            value={value}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder={isNumber ? "Digite um numero..." : "Digite o valor..."}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      )}

      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="text-xs text-gray-500">Sim</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-xs text-gray-500">Nao</span>
        </div>
      </div>
    </div>
  );
}
