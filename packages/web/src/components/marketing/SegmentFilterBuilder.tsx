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
// Field / Operator metadata — organized by category
// ---------------------------------------------------------------------------

interface FieldMeta {
  label: string;
  type: "text" | "id" | "date" | "enum" | "number" | "tags" | "boolean" | "relative_days";
  category: string;
  enumOptions?: { value: string; label: string }[];
}

const FIELDS: Record<string, FieldMeta> = {
  // ── Contato ──────────────────────────────────────────────────────
  name:                 { label: "Nome", type: "text", category: "Contato" },
  email:                { label: "Email", type: "text", category: "Contato" },
  phone:                { label: "Telefone", type: "text", category: "Contato" },
  position:             { label: "Cargo", type: "text", category: "Contato" },
  sector:               { label: "Setor", type: "text", category: "Contato" },
  instagram:            { label: "Instagram", type: "text", category: "Contato" },
  birthday:             { label: "Aniversário", type: "date", category: "Contato" },
  createdAt:            { label: "Data de criação", type: "date", category: "Contato" },
  createdDaysAgo:       { label: "Criado há X dias", type: "relative_days", category: "Contato" },
  tags:                 { label: "Tags", type: "tags", category: "Contato" },

  // ── Empresa ──────────────────────────────────────────────────────
  organizationId:       { label: "Empresa (ID)", type: "id", category: "Empresa" },
  organizationName:     { label: "Nome da empresa", type: "text", category: "Empresa" },
  organizationSegment:  { label: "Segmento da empresa", type: "text", category: "Empresa" },
  organizationCnpj:     { label: "CNPJ", type: "text", category: "Empresa" },

  // ── Funil de Vendas ──────────────────────────────────────────────
  hasDeal:              { label: "Tem negociação", type: "boolean", category: "Funil" },
  hasOpenDeal:          { label: "Tem negociação aberta", type: "boolean", category: "Funil" },
  hasWonDeal:           { label: "É cliente (ganhou)", type: "boolean", category: "Funil" },
  hasLostDeal:          { label: "Perdeu negociação", type: "boolean", category: "Funil" },
  dealStatus:           { label: "Status da negociação", type: "enum", category: "Funil",
                          enumOptions: [{ value: "OPEN", label: "Em andamento" }, { value: "WON", label: "Ganha" }, { value: "LOST", label: "Perdida" }] },
  dealStageName:        { label: "Etapa do funil", type: "enum", category: "Funil",
                          enumOptions: [
                            { value: "LEAD", label: "Lead" },
                            { value: "Contato feito", label: "Contato feito" },
                            { value: "Marcar reunião", label: "Marcar reunião" },
                            { value: "Reunião agendada", label: "Reunião agendada" },
                            { value: "Proposta enviada", label: "Proposta enviada" },
                            { value: "Aguardando dados", label: "Aguardando dados" },
                            { value: "Aguardando assinatura", label: "Aguardando assinatura" },
                            { value: "Ganho fechado", label: "Ganho fechado" },
                          ] },
  dealValue:            { label: "Valor da negociação", type: "number", category: "Funil" },
  dealProductName:      { label: "Produto contratado", type: "text", category: "Funil" },
  dealCreatedAt:        { label: "Negociação criada em", type: "date", category: "Funil" },
  dealClosedAt:         { label: "Negociação fechada em", type: "date", category: "Funil" },

  // ── Engajamento ──────────────────────────────────────────────────
  engagementLevel:      { label: "Nível de engajamento", type: "enum", category: "Engajamento",
                          enumOptions: [{ value: "ENGAGED", label: "Engajado" }, { value: "INTERMEDIATE", label: "Intermediário" }, { value: "DISENGAGED", label: "Desengajado" }] },
  score:                { label: "Score", type: "number", category: "Engajamento" },
  lastEmailOpenedAt:    { label: "Último email aberto em", type: "date", category: "Engajamento" },
  lastEmailClickedAt:   { label: "Último email clicado em", type: "date", category: "Engajamento" },
  lastActivityDaysAgo:  { label: "Sem atividade há X dias", type: "relative_days", category: "Engajamento" },

  // ── Email Marketing ──────────────────────────────────────────────
  emailOpened:          { label: "Já abriu email", type: "boolean", category: "Email" },
  emailClicked:         { label: "Já clicou em email", type: "boolean", category: "Email" },
  emailBounced:         { label: "Email bounced", type: "boolean", category: "Email" },
  emailUnsubscribed:    { label: "Descadastrado", type: "boolean", category: "Email" },

  // ── Origem / UTM ─────────────────────────────────────────────────
  utmSource:            { label: "UTM Source", type: "text", category: "Origem" },
  utmMedium:            { label: "UTM Medium", type: "text", category: "Origem" },
  utmCampaign:          { label: "UTM Campaign", type: "text", category: "Origem" },
  utmContent:           { label: "UTM Content", type: "text", category: "Origem" },
  landingPage:          { label: "Landing page", type: "text", category: "Origem" },
  referrer:             { label: "Referrer", type: "text", category: "Origem" },

  // ── WhatsApp ─────────────────────────────────────────────────────
  hasWhatsAppConversation: { label: "Tem conversa WhatsApp", type: "boolean", category: "WhatsApp" },
  whatsAppOptedOut:     { label: "Opt-out WhatsApp", type: "boolean", category: "WhatsApp" },
  whatsAppStatus:       { label: "Status conversa", type: "enum", category: "WhatsApp",
                          enumOptions: [{ value: "open", label: "Aberta" }, { value: "closed", label: "Fechada" }] },

  // ── Automação / Reunião ──────────────────────────────────────────
  inAutomation:         { label: "Em automação ativa", type: "boolean", category: "Automação" },
  hasMeeting:           { label: "Tem reunião agendada", type: "boolean", category: "Automação" },
};

const OPERATORS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "EQUALS", label: "Igual a" },
    { value: "NOT_EQUALS", label: "Diferente de" },
    { value: "CONTAINS", label: "Contém" },
    { value: "NOT_CONTAINS", label: "Não contém" },
    { value: "STARTS_WITH", label: "Começa com" },
  ],
  id: [
    { value: "EQUALS", label: "Igual a" },
    { value: "IN", label: "Em (lista)" },
  ],
  date: [
    { value: "GREATER_THAN", label: "Depois de" },
    { value: "LESS_THAN", label: "Antes de" },
    { value: "BETWEEN", label: "Entre" },
  ],
  enum: [
    { value: "EQUALS", label: "Igual a" },
    { value: "IN", label: "Em (lista)" },
  ],
  number: [
    { value: "EQUALS", label: "Igual a" },
    { value: "GREATER_THAN", label: "Maior que" },
    { value: "LESS_THAN", label: "Menor que" },
    { value: "BETWEEN", label: "Entre" },
  ],
  tags: [{ value: "IN", label: "Contém" }],
  boolean: [{ value: "EQUALS", label: "" }],
  relative_days: [
    { value: "LESS_THAN", label: "Menos de" },
    { value: "GREATER_THAN", label: "Mais de" },
  ],
};

// Group fields by category for the dropdown
const FIELD_CATEGORIES = [...new Set(Object.values(FIELDS).map(f => f.category))];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldMeta(field: string): FieldMeta {
  return FIELDS[field] ?? { label: field, type: "text", category: "Outro" };
}

function getOperators(field: string) {
  const type = getFieldMeta(field).type;
  return OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.text;
}

function defaultOperator(field: string): string {
  const ops = getOperators(field);
  return ops[0]?.value ?? "EQUALS";
}

function defaultValue(field: string, operator: string): any {
  const meta = getFieldMeta(field);
  if (operator === "BETWEEN") return ["", ""];
  if (meta.type === "boolean") return "true";
  return "";
}

// ---------------------------------------------------------------------------
// Value input
// ---------------------------------------------------------------------------

function ValueInput({
  field, operator, value, onValueChange,
}: {
  field: string; operator: string; value: any; onValueChange: (v: any) => void;
}) {
  const meta = getFieldMeta(field);
  const INPUT = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  // Boolean — simple toggle
  if (meta.type === "boolean") {
    return (
      <select value={value ?? "true"} onChange={(e) => onValueChange(e.target.value)} className={INPUT}>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  }

  // Relative days
  if (meta.type === "relative_days") {
    return (
      <div className="flex items-center gap-2">
        <input type="number" value={value ?? ""} onChange={(e) => onValueChange(e.target.value)}
          placeholder="Dias" min={0} className={INPUT} />
        <span className="text-sm text-gray-500 whitespace-nowrap">dias</span>
      </div>
    );
  }

  // BETWEEN — two inputs
  if (operator === "BETWEEN") {
    const pair: [string, string] = Array.isArray(value) ? [value[0] ?? "", value[1] ?? ""] : ["", ""];
    const inputType = meta.type === "date" ? "date" : meta.type === "number" ? "number" : "text";
    return (
      <div className="flex items-center gap-2">
        <input type={inputType} value={pair[0]} onChange={(e) => onValueChange([e.target.value, pair[1]])}
          placeholder="Min" className={INPUT} />
        <span className="text-sm text-gray-500">e</span>
        <input type={inputType} value={pair[1]} onChange={(e) => onValueChange([pair[0], e.target.value])}
          placeholder="Max" className={INPUT} />
      </div>
    );
  }

  // Enum — select with field-specific options
  if (meta.type === "enum" && meta.enumOptions) {
    return (
      <select value={value ?? ""} onChange={(e) => onValueChange(e.target.value)} className={INPUT}>
        <option value="">Selecione...</option>
        {meta.enumOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  // Date
  if (meta.type === "date") {
    return <input type="date" value={value ?? ""} onChange={(e) => onValueChange(e.target.value)} className={INPUT} />;
  }

  // Number
  if (meta.type === "number") {
    return <input type="number" value={value ?? ""} onChange={(e) => onValueChange(e.target.value)} placeholder="Valor" className={INPUT} />;
  }

  // Tags — comma-separated IDs
  if (meta.type === "tags") {
    return <input type="text" value={value ?? ""} onChange={(e) => onValueChange(e.target.value)}
      placeholder="IDs separados por vírgula" className={INPUT} />;
  }

  // Default — text / id
  return <input type="text" value={value ?? ""} onChange={(e) => onValueChange(e.target.value)} placeholder="Valor" className={INPUT} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SegmentFilterBuilder({ filters, onChange }: SegmentFilterBuilderProps) {
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
        if (patch.field && patch.field !== f.field) {
          updated.operator = defaultOperator(updated.field);
          updated.value = defaultValue(updated.field, updated.operator);
        }
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
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Filter className="h-4 w-4" />
        <span>Filtros do Segmento</span>
        <span className="text-xs text-gray-400 font-normal">({Object.keys(FIELDS).length} campos disponíveis)</span>
      </div>

      {filters.length === 0 && (
        <p className="text-sm text-gray-400">Nenhum filtro adicionado.</p>
      )}

      {filters.map((filter, index) => {
        const meta = getFieldMeta(filter.field);
        const operators = getOperators(filter.field);

        return (
          <div key={index} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            {/* Category + Field select */}
            <select
              value={filter.field}
              onChange={(e) => updateFilter(index, { field: e.target.value })}
              className="w-52 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {FIELD_CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {Object.entries(FIELDS)
                    .filter(([, m]) => m.category === cat)
                    .map(([key, m]) => (
                      <option key={key} value={key}>{m.label}</option>
                    ))}
                </optgroup>
              ))}
            </select>

            {/* Operator select (hidden for boolean) */}
            {meta.type !== "boolean" && (
              <select
                value={filter.operator}
                onChange={(e) => updateFilter(index, { operator: e.target.value })}
                className="w-36 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {operators.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            )}

            {/* Value input */}
            <div className="min-w-0 flex-1">
              <ValueInput field={filter.field} operator={filter.operator}
                value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })} />
            </div>

            {/* Remove */}
            <button type="button" onClick={() => removeFilter(index)}
              className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <button type="button" onClick={addFilter}
        className="inline-flex items-center gap-2 rounded-md border border-blue-500 bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-600 transition-colors">
        <Plus className="h-4 w-4" />
        Adicionar Filtro
      </button>
    </div>
  );
}
