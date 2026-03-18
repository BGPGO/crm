"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import { api } from "@/lib/api";

interface AutomationCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (automation: any) => void;
}

const triggerOptions = [
  { value: "STAGE_CHANGED", label: "Mudança de etapa" },
  { value: "TAG_ADDED", label: "Tag adicionada" },
  { value: "TAG_REMOVED", label: "Tag removida" },
  { value: "CONTACT_CREATED", label: "Contato criado" },
  { value: "FIELD_UPDATED", label: "Campo atualizado" },
  { value: "DATE_BASED", label: "Baseado em data" },
];

interface Stage {
  id: string;
  name: string;
}

interface TagItem {
  id: string;
  name: string;
}

export default function AutomationCreateModal({ isOpen, onClose, onCreated }: AutomationCreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("STAGE_CHANGED");
  const [fromStageId, setFromStageId] = useState("");
  const [toStageId, setToStageId] = useState("");
  const [tagId, setTagId] = useState("");
  const [triggerConfigJson, setTriggerConfigJson] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stages, setStages] = useState<Stage[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const fetchStages = useCallback(async () => {
    try {
      const res = await api.get<{ data: Stage[] }>("/pipeline-stages");
      setStages(res.data || []);
    } catch {
      // stages might not be available
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await api.get<{ data: TagItem[] }>("/tags");
      setTags(res.data || []);
    } catch {
      // tags might not be available
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Reset form
    setName("");
    setDescription("");
    setTriggerType("STAGE_CHANGED");
    setFromStageId("");
    setToStageId("");
    setTagId("");
    setTriggerConfigJson("{}");
    setError(null);

    fetchStages();
    fetchTags();
  }, [isOpen, fetchStages, fetchTags]);

  const buildTriggerConfig = () => {
    switch (triggerType) {
      case "STAGE_CHANGED":
        return { fromStageId: fromStageId || undefined, toStageId: toStageId || undefined };
      case "TAG_ADDED":
      case "TAG_REMOVED":
        return { tagId: tagId || undefined };
      default:
        try {
          return JSON.parse(triggerConfigJson);
        } catch {
          return {};
        }
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        triggerConfig: buildTriggerConfig(),
      };
      const res = await api.post<{ data: any }>("/automations", body);
      onCreated(res.data || res);
    } catch (err: any) {
      setError(err?.message || "Erro ao criar automação.");
    } finally {
      setSaving(false);
    }
  };

  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));
  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  const needsStages = triggerType === "STAGE_CHANGED";
  const needsTag = triggerType === "TAG_ADDED" || triggerType === "TAG_REMOVED";
  const needsJson = !needsStages && !needsTag && triggerType !== "CONTACT_CREATED";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova Automação" size="lg">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <Input
          label="Nome"
          placeholder="Ex: Follow-up após mudança de etapa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Textarea
          label="Descrição (opcional)"
          placeholder="Descreva o objetivo desta automação..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <Select
          label="Tipo de gatilho"
          options={triggerOptions}
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value)}
        />

        {/* Trigger config: stages */}
        {needsStages && (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="De etapa"
              options={stageOptions}
              value={fromStageId}
              onChange={(e) => setFromStageId(e.target.value)}
              placeholder="Qualquer etapa"
            />
            <Select
              label="Para etapa"
              options={stageOptions}
              value={toStageId}
              onChange={(e) => setToStageId(e.target.value)}
              placeholder="Qualquer etapa"
            />
          </div>
        )}

        {/* Trigger config: tag */}
        {needsTag && (
          <Select
            label="Tag"
            options={tagOptions}
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            placeholder="Selecione uma tag"
          />
        )}

        {/* Trigger config: JSON fallback */}
        {needsJson && (
          <Textarea
            label="Configuração do gatilho (JSON)"
            value={triggerConfigJson}
            onChange={(e) => setTriggerConfigJson(e.target.value)}
            rows={3}
            hint="Formato JSON com parâmetros adicionais do gatilho"
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleCreate} loading={saving}>
            Criar Automação
          </Button>
        </div>
      </div>
    </Modal>
  );
}
