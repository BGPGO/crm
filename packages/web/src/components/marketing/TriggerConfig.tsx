"use client";

import { useState, useEffect } from "react";
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
          <select
            value={config?.tagId ?? ""}
            onChange={(e) => onChange({ ...config, tagId: e.target.value })}
            className={selectClass}
          >
            <option value="">Selecione uma tag...</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
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
