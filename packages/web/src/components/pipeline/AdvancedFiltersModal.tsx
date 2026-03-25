"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { X, ChevronDown, Check } from "lucide-react";

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
  campaignIds?: string;
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
  hasOverdueTask?: string;
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

// ── Campaign Multi-Select ────────────────────────────────────────────────────

function CampaignMultiSelect({
  campaigns,
  value,
  onChange,
}: {
  campaigns: Option[];
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = value ? value.split(",").filter(Boolean) : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    onChange(next.join(","));
  };

  const label =
    selected.length === 0
      ? "Todas as campanhas"
      : selected.length === 1
        ? campaigns.find((c) => c.id === selected[0])?.name ?? "1 campanha"
        : `${selected.length} campanhas`;

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">Campanhas</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={SEL + " flex items-center justify-between text-left"}
      >
        <span className={selected.length === 0 ? "text-gray-500" : "text-gray-900 truncate"}>
          {label}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {campaigns.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400">Nenhuma campanha</div>
          )}
          {campaigns.map((c) => {
            const isSelected = selected.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left"
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300"
                  }`}
                >
                  {isSelected && <Check size={12} />}
                </span>
                <span className="truncate">{c.name}</span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="w-full px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 text-left"
            >
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  );
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <CampaignMultiSelect
            campaigns={campaigns}
            value={draft.campaignIds ?? ""}
            onChange={(val) => setDraft((prev) => ({ ...prev, campaignIds: val || undefined }))}
          />
        </div>

        {/* Row 2: Organization + Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Row 4b: Overdue task filter */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hasOverdueTask"
            checked={draft.hasOverdueTask === "true"}
            onChange={(e) => set("hasOverdueTask", e.target.checked ? "true" : "")}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="hasOverdueTask" className="text-sm text-gray-700 select-none">
            Com tarefa atrasada
          </label>
        </div>

        {/* Row 5: Created date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data de Criação</label>
          <p className="text-[10px] text-gray-400 mb-1.5">Inclua horário para filtros precisos (ex: sexta 18:00 a segunda 08:00)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-gray-400">De</span>
              <input
                type="datetime-local"
                value={draft.createdAtFrom ?? ""}
                onChange={(e) => set("createdAtFrom", e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400">Até</span>
              <input
                type="datetime-local"
                value={draft.createdAtTo ?? ""}
                onChange={(e) => set("createdAtTo", e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
        </div>

        {/* Row 6: Updated date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Última Alteração</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-gray-400">De</span>
              <input
                type="datetime-local"
                value={draft.updatedAtFrom ?? ""}
                onChange={(e) => set("updatedAtFrom", e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400">Até</span>
              <input
                type="datetime-local"
                value={draft.updatedAtTo ?? ""}
                onChange={(e) => set("updatedAtTo", e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
        </div>

        {/* Row 7: Closed date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data de Fechamento</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-gray-400">De</span>
              <input
                type="datetime-local"
                value={draft.closedAtFrom ?? ""}
                onChange={(e) => set("closedAtFrom", e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400">Até</span>
              <input
                type="datetime-local"
                value={draft.closedAtTo ?? ""}
                onChange={(e) => set("closedAtTo", e.target.value)}
                className={INPUT}
              />
            </div>
          </div>
        </div>

        {/* Row 8: Expected close date range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Previsão de Fechamento</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-gray-400">De</span>
              <input
                type="datetime-local"
                value={draft.expectedCloseDateFrom ?? ""}
                onChange={(e) => set("expectedCloseDateFrom", e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <span className="text-[10px] text-gray-400">Até</span>
              <input
                type="datetime-local"
                value={draft.expectedCloseDateTo ?? ""}
                onChange={(e) => set("expectedCloseDateTo", e.target.value)}
                className={INPUT}
              />
            </div>
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
