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

interface TriggerConfigProps {
  triggerType: string;
  config: any;
  onChange: (config: any) => void;
}

const selectClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

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

export default function TriggerConfig({
  triggerType,
  config,
  onChange,
}: TriggerConfigProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);

  useEffect(() => {
    if (triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED") {
      setLoadingTags(true);
      api
        .get<{ data: Tag[] }>("/tags")
        .then((res) => setTags(Array.isArray(res) ? res : res.data ?? []))
        .catch(() => {})
        .finally(() => setLoadingTags(false));
    }
  }, [triggerType]);

  useEffect(() => {
    if (triggerType === "STAGE_CHANGED") {
      setLoadingStages(true);
      api
        .get<{ data: PipelineStage[] }>("/pipeline-stages")
        .then((res) => setStages(Array.isArray(res) ? res : res.data ?? []))
        .catch(() => {})
        .finally(() => setLoadingStages(false));
    }
  }, [triggerType]);

  if (triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Tag</label>
        {loadingTags ? (
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        ) : (
          <TagDropdown
            tags={tags}
            value={config?.tagId ?? ""}
            onChange={(tagId) => onChange({ ...config, tagId })}
            onTagCreated={(tag) => setTags((prev) => [...prev, tag])}
          />
        )}
      </div>
    );
  }

  if (triggerType === "STAGE_CHANGED") {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Etapa do Pipeline
        </label>
        {loadingStages ? (
          <div className="h-10 bg-gray-100 rounded animate-pulse" />
        ) : (
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
        )}
      </div>
    );
  }

  if (triggerType === "CONTACT_CREATED") {
    return (
      <p className="text-sm text-gray-500 italic">
        Nenhuma configuração necessária. A automação será disparada quando um
        novo contato for criado.
      </p>
    );
  }

  if (triggerType === "FIELD_UPDATED") {
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
            placeholder="Ex: email, phone, position"
            className={inputClass}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Valor (opcional)
          </label>
          <input
            type="text"
            value={config?.fieldValue ?? ""}
            onChange={(e) =>
              onChange({ ...config, fieldValue: e.target.value })
            }
            placeholder="Valor esperado"
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  if (triggerType === "DATE_BASED") {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Campo de Data
          </label>
          <select
            value={config?.dateField ?? ""}
            onChange={(e) =>
              onChange({ ...config, dateField: e.target.value })
            }
            className={selectClass}
          >
            <option value="">Selecione...</option>
            <option value="createdAt">Data de Criação</option>
            <option value="updatedAt">Última Atualização</option>
            <option value="lastActivityAt">Última Atividade</option>
            <option value="custom">Campo Personalizado</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Offset (dias)
          </label>
          <input
            type="number"
            value={config?.offsetDays ?? 0}
            onChange={(e) =>
              onChange({ ...config, offsetDays: parseInt(e.target.value) || 0 })
            }
            placeholder="0"
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-400">
      Selecione um tipo de gatilho para configurar.
    </p>
  );
}
