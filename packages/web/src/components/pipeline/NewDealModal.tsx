"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { api } from "@/lib/api";
import type { Deal } from "./DealCard";

// ─── API response shapes ──────────────────────────────────────────────────────

interface ApiListItem {
  id: string;
  name: string;
}

interface ApiListResponse {
  data: ApiListItem[];
}

interface ApiStage {
  id: string;
  name: string;
  order: number;
  color?: string;
}

interface ApiStagesResponse {
  data: ApiStage[];
}

interface ApiDealResponse {
  data: Deal;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NewDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  defaultStageId: string;
  onDealCreated: (deal: Deal) => void;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  value: string;
  contactId: string;
  organizationId: string;
  userId: string;
  sourceId: string;
  stageId: string;
}

const emptyForm = (defaultStageId: string): FormState => ({
  title: "",
  value: "",
  contactId: "",
  organizationId: "",
  userId: "",
  sourceId: "",
  stageId: defaultStageId,
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewDealModal({
  isOpen,
  onClose,
  pipelineId,
  defaultStageId,
  onDealCreated,
}: NewDealModalProps) {
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultStageId));
  const [titleError, setTitleError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [contacts, setContacts] = useState<ApiListItem[]>([]);
  const [organizations, setOrganizations] = useState<ApiListItem[]>([]);
  const [users, setUsers] = useState<ApiListItem[]>([]);
  const [sources, setSources] = useState<ApiListItem[]>([]);
  const [stages, setStages] = useState<ApiStage[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Organization search state
  const [orgSearch, setOrgSearch] = useState("");
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const orgSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(emptyForm(defaultStageId));
      setTitleError("");
      setSubmitError("");
      setOrgSearch("");
    }
  }, [isOpen, defaultStageId]);

  // Load select options when modal opens
  const loadOptions = useCallback(async () => {
    if (!isOpen || loadingOptions) return;
    setLoadingOptions(true);
    try {
      const [contactsRes, orgsRes, usersRes, sourcesRes, stagesRes] =
        await Promise.all([
          api.get<ApiListResponse>("/contacts?limit=200"),
          api.get<ApiListResponse>("/organizations?limit=20"),
          api.get<ApiListResponse>("/users?limit=200"),
          api.get<ApiListResponse>("/sources?limit=200"),
          api.get<ApiStagesResponse>(
            `/pipeline-stages?pipelineId=${pipelineId}`
          ),
        ]);

      setContacts(contactsRes.data ?? []);
      setOrganizations(orgsRes.data ?? []);
      setUsers(usersRes.data ?? []);
      setSources(sourcesRes.data ?? []);
      setStages(
        (stagesRes.data ?? []).slice().sort((a, b) => a.order - b.order)
      );
    } catch {
      // Non-fatal — selects will be empty
    } finally {
      setLoadingOptions(false);
    }
  }, [isOpen, pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) loadOptions();
  }, [isOpen, loadOptions]);

  // Debounced organization search
  const searchOrganizations = useCallback(
    (query: string) => {
      if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
      orgSearchTimer.current = setTimeout(async () => {
        setLoadingOrgs(true);
        try {
          const params = query.trim()
            ? `/organizations?search=${encodeURIComponent(query.trim())}&limit=20`
            : "/organizations?limit=20";
          const res = await api.get<ApiListResponse>(params);
          setOrganizations(res.data ?? []);
        } catch {
          // keep current list on error
        } finally {
          setLoadingOrgs(false);
        }
      }, 300);
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (orgSearchTimer.current) clearTimeout(orgSearchTimer.current);
    };
  }, []);

  function handleOrgSearchChange(value: string) {
    setOrgSearch(value);
    searchOrganizations(value);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "title") setTitleError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.title.trim()) {
      setTitleError("Título é obrigatório");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        pipelineId,
        stageId: form.stageId || defaultStageId,
      };

      if (form.value) body.value = parseFloat(form.value.replace(",", "."));
      if (form.contactId) body.contactId = form.contactId;
      if (form.organizationId) body.organizationId = form.organizationId;
      if (form.userId) body.userId = form.userId;
      if (form.sourceId) body.sourceId = form.sourceId;

      const res = await api.post<ApiDealResponse>("/deals", body);
      onDealCreated(res.data);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao criar negociação";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const toOptions = (items: ApiListItem[]) =>
    items.map((i) => ({ value: i.id, label: i.name }));

  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nova Negociação" size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Título */}
        <Input
          label="Título"
          placeholder="Ex: Contrato Anual — Empresa XYZ"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          error={titleError}
          autoFocus
        />

        {/* Valor */}
        <Input
          label="Valor (R$)"
          placeholder="0,00"
          type="text"
          inputMode="decimal"
          value={form.value}
          onChange={(e) => setField("value", e.target.value)}
        />

        {/* Etapa */}
        <Select
          label="Etapa"
          options={stageOptions}
          placeholder={loadingOptions ? "Carregando…" : "Selecionar etapa"}
          value={form.stageId}
          onChange={(e) => setField("stageId", e.target.value)}
          disabled={loadingOptions || stageOptions.length === 0}
        />

        {/* Contato */}
        <Select
          label="Contato"
          options={toOptions(contacts)}
          placeholder={loadingOptions ? "Carregando…" : "Selecionar contato"}
          value={form.contactId}
          onChange={(e) => setField("contactId", e.target.value)}
          disabled={loadingOptions || contacts.length === 0}
        />

        {/* Empresa */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Empresa</label>
          <input
            type="text"
            placeholder="Buscar empresa…"
            value={orgSearch}
            onChange={(e) => handleOrgSearchChange(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
          />
          <select
            value={form.organizationId}
            onChange={(e) => setField("organizationId", e.target.value)}
            disabled={loadingOptions || (organizations.length === 0 && !loadingOrgs)}
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="" disabled>
              {loadingOptions || loadingOrgs ? "Carregando…" : "Selecionar empresa"}
            </option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {/* Responsável */}
        <Select
          label="Responsável"
          options={toOptions(users)}
          placeholder={loadingOptions ? "Carregando…" : "Selecionar responsável"}
          value={form.userId}
          onChange={(e) => setField("userId", e.target.value)}
          disabled={loadingOptions || users.length === 0}
        />

        {/* Fonte */}
        <Select
          label="Fonte"
          options={toOptions(sources)}
          placeholder={loadingOptions ? "Carregando…" : "Selecionar fonte"}
          value={form.sourceId}
          onChange={(e) => setField("sourceId", e.target.value)}
          disabled={loadingOptions || sources.length === 0}
        />

        {/* Submit error */}
        {submitError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            Criar Negociação
          </Button>
        </div>
      </form>
    </Modal>
  );
}
