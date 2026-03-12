"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { X } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Option {
  id: string;
  name: string;
}

interface ListResponse<T = Option> {
  data: T[];
}

export interface AdvancedFilters {
  sourceId?: string;
  campaignId?: string;
  lostReasonId?: string;
  organizationId?: string;
  contactId?: string;
  classification?: string;
  valueMin?: string;
  valueMax?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  updatedAtFrom?: string;
  updatedAtTo?: string;
  closedAtFrom?: string;
  closedAtTo?: string;
  expectedCloseDateFrom?: string;
  expectedCloseDateTo?: string;
}

const EMPTY: AdvancedFilters = {};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  current: AdvancedFilters;
  onApply: (filters: AdvancedFilters) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEL =
  "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

function countActive(f: AdvancedFilters): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdvancedFiltersModal({ isOpen, onClose, current, onApply }: Props) {
  const [draft, setDraft] = useState<AdvancedFilters>(current);

  // Option lists
  const [sources, setSources] = useState<Option[]>([]);
  const [campaigns, setCampaigns] = useState<Option[]>([]);
  const [lostReasons, setLostReasons] = useState<Option[]>([]);
  const [organizations, setOrganizations] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Sync draft when modal opens with new current
  useEffect(() => {
    if (isOpen) setDraft(current);
  }, [isOpen, current]);

  // Load options once on first open
  const loadOptions = useCallback(async () => {
    if (loaded) return;
    try {
      const [srcRes, campRes, lrRes, orgRes, ctRes] = await Promise.all([
        api.get<ListResponse>("/sources?limit=100"),
        api.get<ListResponse>("/campaigns?limit=100"),
        api.get<ListResponse>("/lost-reasons?limit=100"),
        api.get<ListResponse>("/organizations?limit=200"),
        api.get<ListResponse>("/contacts?limit=200"),
      ]);
      setSources(srcRes.data ?? []);
      setCampaigns(campRes.data ?? []);
      setLostReasons(lrRes.data ?? []);
      setOrganizations(orgRes.data ?? []);
      setContacts(ctRes.data ?? []);
      setLoaded(true);
    } catch {
      // silent
    }
  }, [loaded]);

  useEffect(() => {
    if (isOpen) loadOptions();
  }, [isOpen, loadOptions]);

  const set = (key: keyof AdvancedFilters, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const handleApply = () => {
    // Strip empty values
    const clean: AdvancedFilters = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v !== undefined && v !== "") {
        (clean as Record<string, string>)[k] = v;
      }
    }
    onApply(clean);
    onClose();
  };

  const handleClear = () => {
    setDraft(EMPTY);
    onApply(EMPTY);
    onClose();
  };

  const activeCount = countActive(draft);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filtros Avançados" size="lg">
      <div className="space-y-5">
        {/* Row 1: Source + Campaign */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fonte</label>
            <select
              value={draft.sourceId ?? ""}
              onChange={(e) => set("sourceId", e.target.value)}
              className={SEL}
            >
              <option value="">Todas as fontes</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Campanha</label>
            <select
              value={draft.campaignId ?? ""}
              onChange={(e) => set("campaignId", e.target.value)}
              className={SEL}
            >
              <option value="">Todas as campanhas</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Organization + Contact */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
            <select
              value={draft.organizationId ?? ""}
              onChange={(e) => set("organizationId", e.target.value)}
              className={SEL}
            >
              <option value="">Todas as empresas</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contato</label>
            <select
              value={draft.contactId ?? ""}
              onChange={(e) => set("contactId", e.target.value)}
              className={SEL}
            >
              <option value="">Todos os contatos</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Lost reason + Classification */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de Perda</label>
            <select
              value={draft.lostReasonId ?? ""}
              onChange={(e) => set("lostReasonId", e.target.value)}
              className={SEL}
            >
              <option value="">Todos os motivos</option>
              {lostReasons.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Classificação</label>
            <input
              type="text"
              value={draft.classification ?? ""}
              onChange={(e) => set("classification", e.target.value)}
              placeholder="Ex: A, B, Premium..."
              className={INPUT}
            />
          </div>
        </div>

        {/* Row 4: Value range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Valor da Negociação</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="number"
              value={draft.valueMin ?? ""}
              onChange={(e) => set("valueMin", e.target.value)}
              placeholder="Mínimo"
              min={0}
              className={INPUT}
            />
            <input
              type="number"
              value={draft.valueMax ?? ""}
              onChange={(e) => set("valueMax", e.target.value)}
              placeholder="Máximo"
              min={0}
              className={INPUT}
            />
          </div>
        </div>

        {/* Row 5: Created date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data de Criação</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={draft.createdAtFrom ?? ""}
              onChange={(e) => set("createdAtFrom", e.target.value)}
              placeholder="De"
              className={INPUT}
            />
            <input
              type="date"
              value={draft.createdAtTo ?? ""}
              onChange={(e) => set("createdAtTo", e.target.value)}
              placeholder="Até"
              className={INPUT}
            />
          </div>
        </div>

        {/* Row 6: Updated date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Última Alteração</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={draft.updatedAtFrom ?? ""}
              onChange={(e) => set("updatedAtFrom", e.target.value)}
              placeholder="De"
              className={INPUT}
            />
            <input
              type="date"
              value={draft.updatedAtTo ?? ""}
              onChange={(e) => set("updatedAtTo", e.target.value)}
              placeholder="Até"
              className={INPUT}
            />
          </div>
        </div>

        {/* Row 7: Closed date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data de Fechamento</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={draft.closedAtFrom ?? ""}
              onChange={(e) => set("closedAtFrom", e.target.value)}
              placeholder="De"
              className={INPUT}
            />
            <input
              type="date"
              value={draft.closedAtTo ?? ""}
              onChange={(e) => set("closedAtTo", e.target.value)}
              placeholder="Até"
              className={INPUT}
            />
          </div>
        </div>

        {/* Row 8: Expected close date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Previsão de Fechamento</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={draft.expectedCloseDateFrom ?? ""}
              onChange={(e) => set("expectedCloseDateFrom", e.target.value)}
              placeholder="De"
              className={INPUT}
            />
            <input
              type="date"
              value={draft.expectedCloseDateTo ?? ""}
              onChange={(e) => set("expectedCloseDateTo", e.target.value)}
              placeholder="Até"
              className={INPUT}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
            Limpar filtros
            {activeCount > 0 && (
              <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                {activeCount}
              </span>
            )}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              Aplicar Filtros
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { countActive as countAdvancedFilters };
