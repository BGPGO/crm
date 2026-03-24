"use client";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

const fieldOptions = [
  { value: "lead_responded", label: "Lead respondeu", type: "boolean" },
  { value: "meeting_scheduled", label: "Reunião marcada", type: "boolean" },
  { value: "has_tag", label: "Tem tag", type: "text" },
  { value: "sector", label: "Setor do contato", type: "text" },
  { value: "deal_stage", label: "Etapa da negociação", type: "text" },
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

  const selectedField = fieldOptions.find((f) => f.value === field);
  const fieldType = selectedField?.type ?? "text";
  const isBoolean = fieldType === "boolean";
  const isNumber = fieldType === "number";
  const noValueRequired = isBoolean || operator === "is_empty" || operator === "is_not_empty";

  const operators =
    isBoolean ? booleanOperators :
    isNumber   ? numberOperators  :
                 textOperators;

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

      {field && !noValueRequired && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Valor
          </label>
          <input
            type={isNumber ? "number" : "text"}
            value={value}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder={isNumber ? "Digite um número..." : "Digite o valor..."}
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
