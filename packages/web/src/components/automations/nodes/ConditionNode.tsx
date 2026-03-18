"use client";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

const fieldOptions = [
  { value: "lead_responded", label: "Lead respondeu", type: "boolean" },
  { value: "meeting_scheduled", label: "Reunião marcada", type: "boolean" },
  { value: "has_tag", label: "Tem tag", type: "text" },
];

const booleanOperators = [
  { value: "is_true", label: "é verdadeiro" },
  { value: "is_false", label: "é falso" },
];

const textOperators = [
  { value: "equals", label: "igual a" },
  { value: "contains", label: "contém" },
];

export default function ConditionNode({ config, onChange }: NodeConfigProps) {
  const field = config.field || "";
  const operator = config.operator || "";
  const value = config.value || "";

  const selectedField = fieldOptions.find((f) => f.value === field);
  const isBoolean = selectedField?.type === "boolean";
  const operators = isBoolean ? booleanOperators : textOperators;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Campo
        </label>
        <select
          value={field}
          onChange={(e) =>
            onChange({ ...config, field: e.target.value, operator: "", value: "" })
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

      {field && !isBoolean && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Valor
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder="Digite o valor..."
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
          <span className="text-xs text-gray-500">Não</span>
        </div>
      </div>
    </div>
  );
}
