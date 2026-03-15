"use client";

import { Plus, X, Filter } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentFilter {
  field: string;
  operator: string;
  value: any;
}

export interface SegmentFilterBuilderProps {
  filters: SegmentFilter[];
  onChange: (filters: SegmentFilter[]) => void;
}

// ---------------------------------------------------------------------------
// Field / Operator metadata
// ---------------------------------------------------------------------------

interface FieldMeta {
  label: string;
  type: "text" | "id" | "date" | "enum" | "number" | "tags";
}

const FIELDS: Record<string, FieldMeta> = {
  name: { label: "Nome", type: "text" },
  email: { label: "Email", type: "text" },
  phone: { label: "Telefone", type: "text" },
  position: { label: "Cargo", type: "text" },
  organizationId: { label: "Empresa", type: "id" },
  createdAt: { label: "Data de Criação", type: "date" },
  tags: { label: "Tags", type: "tags" },
  engagementLevel: { label: "Nível de Engajamento", type: "enum" },
  score: { label: "Score", type: "number" },
};

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "EQUALS", label: "Igual a" },
    { value: "CONTAINS", label: "Contém" },
  ],
  id: [
    { value: "EQUALS", label: "Igual a" },
    { value: "IN", label: "Em" },
  ],
  date: [
    { value: "GREATER_THAN", label: "Depois de" },
    { value: "LESS_THAN", label: "Antes de" },
    { value: "BETWEEN", label: "Entre" },
  ],
  enum: [
    { value: "EQUALS", label: "Igual a" },
    { value: "IN", label: "Em" },
  ],
  number: [
    { value: "EQUALS", label: "Igual a" },
    { value: "GREATER_THAN", label: "Maior que" },
    { value: "LESS_THAN", label: "Menor que" },
    { value: "BETWEEN", label: "Entre" },
  ],
  tags: [{ value: "IN", label: "Em" }],
};

const ENGAGEMENT_OPTIONS = [
  { value: "ENGAGED", label: "Engajado" },
  { value: "INTERMEDIATE", label: "Intermediário" },
  { value: "DISENGAGED", label: "Desengajado" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldType(field: string): FieldMeta["type"] {
  return FIELDS[field]?.type ?? "text";
}

function getOperators(field: string) {
  const type = getFieldType(field);
  return OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.text;
}

function defaultOperator(field: string): string {
  const ops = getOperators(field);
  return ops[0]?.value ?? "EQUALS";
}

function defaultValue(field: string, operator: string): any {
  if (operator === "BETWEEN") return ["", ""];
  return "";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ValueInput({
  field,
  operator,
  value,
  onValueChange,
}: {
  field: string;
  operator: string;
  value: any;
  onValueChange: (v: any) => void;
}) {
  const type = getFieldType(field);

  // BETWEEN — two inputs
  if (operator === "BETWEEN") {
    const pair: [string, string] = Array.isArray(value)
      ? [value[0] ?? "", value[1] ?? ""]
      : ["", ""];

    const inputType = type === "date" ? "date" : type === "number" ? "number" : "text";

    return (
      <div className="flex items-center gap-2">
        <input
          type={inputType}
          value={pair[0]}
          onChange={(e) => onValueChange([e.target.value, pair[1]])}
          placeholder="Min"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500">e</span>
        <input
          type={inputType}
          value={pair[1]}
          onChange={(e) => onValueChange([pair[0], e.target.value])}
          placeholder="Max"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  }

  // Enum — select
  if (type === "enum") {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Selecione...</option>
        {ENGAGEMENT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  // Date
  if (type === "date") {
    return (
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  // Number
  if (type === "number") {
    return (
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="Valor"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  // Tags — comma-separated
  if (type === "tags") {
    return (
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="IDs separados por vírgula"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  // Default — text / id
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder="Valor"
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SegmentFilterBuilder({
  filters,
  onChange,
}: SegmentFilterBuilderProps) {
  const addFilter = () => {
    const field = "name";
    const operator = defaultOperator(field);
    onChange([...filters, { field, operator, value: defaultValue(field, operator) }]);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const updateFilter = (index: number, patch: Partial<SegmentFilter>) => {
    onChange(
      filters.map((f, i) => {
        if (i !== index) return f;

        const updated = { ...f, ...patch };

        // When the field changes, reset operator and value to valid defaults
        if (patch.field && patch.field !== f.field) {
          updated.operator = defaultOperator(updated.field);
          updated.value = defaultValue(updated.field, updated.operator);
        }

        // When the operator changes, reset value if switching to/from BETWEEN
        if (patch.operator && patch.operator !== f.operator) {
          const wasBetween = f.operator === "BETWEEN";
          const isBetween = updated.operator === "BETWEEN";
          if (wasBetween !== isBetween) {
            updated.value = defaultValue(updated.field, updated.operator);
          }
        }

        return updated;
      }),
    );
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Filter className="h-4 w-4" />
        <span>Filtros do Segmento</span>
      </div>

      {/* Filter rows */}
      {filters.length === 0 && (
        <p className="text-sm text-gray-400">Nenhum filtro adicionado.</p>
      )}

      {filters.map((filter, index) => {
        const operators = getOperators(filter.field);

        return (
          <div
            key={index}
            className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            {/* Field select */}
            <select
              value={filter.field}
              onChange={(e) => updateFilter(index, { field: e.target.value })}
              className="w-44 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(FIELDS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>

            {/* Operator select */}
            <select
              value={filter.operator}
              onChange={(e) => updateFilter(index, { operator: e.target.value })}
              className="w-36 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value input */}
            <div className="min-w-0 flex-1">
              <ValueInput
                field={filter.field}
                operator={filter.operator}
                value={filter.value}
                onValueChange={(v) => updateFilter(index, { value: v })}
              />
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => removeFilter(index)}
              className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              aria-label="Remover filtro"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      {/* Add filter button */}
      <button
        type="button"
        onClick={addFilter}
        className="inline-flex items-center gap-2 rounded-md border border-blue-500 bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Adicionar Filtro
      </button>
    </div>
  );
}
