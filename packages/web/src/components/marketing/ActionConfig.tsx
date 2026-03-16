"use client";

import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";

interface Tag {
  id: string;
  name: string;
}

interface PipelineStage {
  id: string;
  name: string;
}

interface EmailTemplate {
  id: string;
  name: string;
}

interface ActionConfigProps {
  actionType: string;
  config: any;
  onChange: (config: any) => void;
}

const selectClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const WAIT_UNITS = [
  { value: "minutes", label: "Minutos" },
  { value: "hours", label: "Horas" },
  { value: "days", label: "Dias" },
];

const CONDITION_OPERATORS = [
  { value: "EQUALS", label: "Igual a" },
  { value: "NOT_EQUALS", label: "Diferente de" },
  { value: "CONTAINS", label: "Contém" },
  { value: "GREATER_THAN", label: "Maior que" },
  { value: "LESS_THAN", label: "Menor que" },
  { value: "IS_EMPTY", label: "Está vazio" },
  { value: "IS_NOT_EMPTY", label: "Não está vazio" },
];

// Inline tag selector with create support
interface TagDropdownProps {
  tags: Tag[];
  value: string;
  onChange: (tagId: string) => void;
  onTagCreated: (tag: Tag) => void;
}

function TagDropdown({ tags, value, onChange, onTagCreated }: TagDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const showCreate =
    search.trim().length > 0 &&
    !tags.some((t) => t.name.toLowerCase() === search.trim().toLowerCase());

  const selectedTag = tags.find((t) => t.id === value);

  const handleCreate = async () => {
    const name = search.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const newTag = await api.post<Tag>("/tags", { name });
      onTagCreated(newTag);
      onChange(newTag.id);
      setSearch("");
      setOpen(false);
    } catch (err) {
      console.error("Erro ao criar tag:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${selectClass} text-left flex items-center justify-between`}
      >
        <span className={selectedTag ? "text-gray-900" : "text-gray-400"}>
          {selectedTag ? selectedTag.name : "Selecione uma tag..."}
        </span>
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Buscar ou criar tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-40 p-1">
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 rounded-md hover:bg-blue-50 transition-colors text-left font-medium"
              >
                <Plus size={14} className="flex-shrink-0" />
                {creating ? "Criando..." : `Criar: "${search.trim()}"`}
              </button>
            )}
            {filtered.length === 0 && !showCreate ? (
              <div className="px-3 py-2 text-sm text-gray-400 text-center">
                Nenhuma tag encontrada
              </div>
            ) : (
              filtered.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    onChange(tag.id);
                    setSearch("");
                    setOpen(false);
                  }}
                  className={`w-full flex items-center px-3 py-1.5 text-sm rounded-md hover:bg-gray-50 transition-colors text-left ${
                    tag.id === value ? "text-blue-600 font-medium" : "text-gray-700"
                  }`}
                >
                  {tag.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActionConfig({
  actionType,
  config,
  onChange,
}: ActionConfigProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  useEffect(() => {
    if (actionType === "ADD_TAG" || actionType === "REMOVE_TAG") {
      api
        .get<{ data: Tag[] }>("/tags")
        .then((res) => setTags(Array.isArray(res) ? res : res.data ?? []))
        .catch(() => {});
    }
  }, [actionType]);

  useEffect(() => {
    if (actionType === "SEND_EMAIL") {
      api
        .get<{ data: EmailTemplate[] }>("/email-templates")
        .then((res) =>
          setTemplates(Array.isArray(res) ? res : res.data ?? [])
        )
        .catch(() => {});
    }
  }, [actionType]);

  useEffect(() => {
    if (actionType === "MOVE_PIPELINE_STAGE") {
      api
        .get<{ data: PipelineStage[] }>("/pipeline-stages")
        .then((res) => setStages(Array.isArray(res) ? res : res.data ?? []))
        .catch(() => {});
    }
  }, [actionType]);

  if (actionType === "ADD_TAG" || actionType === "REMOVE_TAG") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Tag</label>
        <TagDropdown
          tags={tags}
          value={config?.tagId ?? ""}
          onChange={(tagId) => onChange({ ...config, tagId })}
          onTagCreated={(tag) => setTags((prev) => [...prev, tag])}
        />
      </div>
    );
  }

  if (actionType === "SEND_EMAIL") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Template de Email
        </label>
        <select
          value={config?.templateId ?? ""}
          onChange={(e) => onChange({ ...config, templateId: e.target.value })}
          className={selectClass}
        >
          <option value="">Selecione um template...</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (actionType === "WAIT") {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Duração
          </label>
          <input
            type="number"
            min={1}
            value={config?.duration ?? 1}
            onChange={(e) =>
              onChange({
                ...config,
                duration: parseInt(e.target.value) || 1,
              })
            }
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Unidade
          </label>
          <select
            value={config?.unit ?? "hours"}
            onChange={(e) => onChange({ ...config, unit: e.target.value })}
            className={selectClass}
          >
            {WAIT_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (actionType === "UPDATE_FIELD") {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Nome do Campo
          </label>
          <input
            type="text"
            value={config?.fieldName ?? ""}
            onChange={(e) =>
              onChange({ ...config, fieldName: e.target.value })
            }
            placeholder="Ex: position, phone"
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Valor
          </label>
          <input
            type="text"
            value={config?.fieldValue ?? ""}
            onChange={(e) =>
              onChange({ ...config, fieldValue: e.target.value })
            }
            placeholder="Novo valor"
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  if (actionType === "MOVE_PIPELINE_STAGE") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Etapa do Pipeline
        </label>
        <select
          value={config?.stageId ?? ""}
          onChange={(e) => onChange({ ...config, stageId: e.target.value })}
          className={selectClass}
        >
          <option value="">Selecione uma etapa...</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (actionType === "CONDITION") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Campo
            </label>
            <input
              type="text"
              value={config?.field ?? ""}
              onChange={(e) =>
                onChange({ ...config, field: e.target.value })
              }
              placeholder="Ex: tags, score, email"
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Operador
            </label>
            <select
              value={config?.operator ?? "EQUALS"}
              onChange={(e) =>
                onChange({ ...config, operator: e.target.value })
              }
              className={selectClass}
            >
              {CONDITION_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Valor
            </label>
            <input
              type="text"
              value={config?.value ?? ""}
              onChange={(e) =>
                onChange({ ...config, value: e.target.value })
              }
              placeholder="Valor"
              className={inputClass}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Se a condição for verdadeira, segue para o passo &quot;Sim&quot;. Caso
          contrário, segue para o passo &quot;Não&quot;.
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-400">
      Selecione um tipo de ação para configurar.
    </p>
  );
}
