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
