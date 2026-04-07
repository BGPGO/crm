"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Users,
  Filter,
  BookOpen,
  Plus,
  X,
  Loader2,
  Check,
  Save,
} from "lucide-react";
import { api } from "@/lib/api";
import SegmentFilterBuilder, {
  type SegmentFilter,
} from "@/components/marketing/SegmentFilterBuilder";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FilterGroup {
  filters: SegmentFilter[];
}

export type AudienceMode = "all" | "filter" | "segment";

export interface AudienceState {
  mode: AudienceMode;
  filterGroups: FilterGroup[];
  selectedSegmentId: string | null;
  previewCount: number | null;
}

interface Segment {
  id: string;
  name: string;
  contactCount: number;
}

interface AudienceBuilderStepProps {
  value: AudienceState;
  onChange: (state: AudienceState) => void;
}

// ── Smart filter shortcuts ───────────────────────────────────────────────────

interface Shortcut {
  label: string;
  filter: SegmentFilter;
}

const SHORTCUTS: Shortcut[] = [
  { label: "Em andamento", filter: { field: "dealStatus", operator: "EQUALS", value: "OPEN" } },
  { label: "Perdidos", filter: { field: "dealStatus", operator: "EQUALS", value: "LOST" } },
  { label: "Ganhos", filter: { field: "dealStatus", operator: "EQUALS", value: "WON" } },
  { label: "Contato feito", filter: { field: "dealStageName", operator: "EQUALS", value: "Contato feito" } },
  { label: "Reuniao marcada", filter: { field: "dealStageName", operator: "EQUALS", value: "Reuniao marcada" } },
  { label: "Proposta enviada", filter: { field: "dealStageName", operator: "EQUALS", value: "Proposta enviada" } },
  { label: "Com email", filter: { field: "email", operator: "NOT_EQUALS", value: "" } },
  { label: "Engajados", filter: { field: "engagementLevel", operator: "EQUALS", value: "ENGAGED" } },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AudienceBuilderStep({
  value,
  onChange,
}: AudienceBuilderStepProps) {
  const { mode, filterGroups, selectedSegmentId, previewCount } = value;

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [totalContacts, setTotalContacts] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);

  // Save as segment modal
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveSegmentName, setSaveSegmentName] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch segments and total count on mount ──────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoadingSegments(true);
      try {
        const [segResult, contactResult] = await Promise.all([
          api.get<{ data: Segment[] }>("/segments"),
          api.get<{ meta: { total: number } }>("/contacts?limit=1"),
        ]);
        setSegments(segResult.data);
        setTotalContacts(contactResult.meta.total);
      } catch (err) {
        console.error("Erro ao buscar segmentos:", err);
      } finally {
        setLoadingSegments(false);
      }
    }
    fetchData();
  }, []);

  // ── Dynamic count via debounced API call ─────────────────────────────────
  const fetchPreviewCount = useCallback(
    async (groups: FilterGroup[]) => {
      const hasFilters = groups.some((g) => g.filters.length > 0);
      if (!hasFilters) {
        onChange({ ...value, filterGroups: groups, previewCount: null });
        return;
      }
      setCountLoading(true);
      try {
        const res = await api.post<{ count: number }>("/segments/preview-count", {
          filterGroups: groups,
        });
        onChange({ ...value, filterGroups: groups, previewCount: res.count });
      } catch {
        // silent — keep last count
      } finally {
        setCountLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value]
  );

  const scheduleCountFetch = useCallback(
    (groups: FilterGroup[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchPreviewCount(groups), 500);
    },
    [fetchPreviewCount]
  );

  // ── Mode switch helpers ──────────────────────────────────────────────────
  function setMode(m: AudienceMode) {
    onChange({ ...value, mode: m });
  }

  // ── Filter group operations ──────────────────────────────────────────────
  function updateGroup(groupIdx: number, filters: SegmentFilter[]) {
    const updated = filterGroups.map((g, i) =>
      i === groupIdx ? { ...g, filters } : g
    );
    scheduleCountFetch(updated);
    onChange({ ...value, filterGroups: updated, previewCount: value.previewCount });
  }

  function addGroup() {
    const updated = [...filterGroups, { filters: [] }];
    onChange({ ...value, filterGroups: updated });
    setActiveGroupIndex(updated.length - 1);
  }

  function removeGroup(groupIdx: number) {
    if (filterGroups.length === 1) return; // keep at least one group
    const updated = filterGroups.filter((_, i) => i !== groupIdx);
    scheduleCountFetch(updated);
    onChange({ ...value, filterGroups: updated, previewCount: value.previewCount });
    setActiveGroupIndex(Math.min(activeGroupIndex, updated.length - 1));
  }

  // ── Shortcut chip click — adds filter to active group ───────────────────
  function applyShortcut(shortcut: Shortcut) {
    const group = filterGroups[activeGroupIndex] ?? filterGroups[0];
    const groupIdx = filterGroups[activeGroupIndex] ? activeGroupIndex : 0;
    const alreadyExists = group.filters.some(
      (f) =>
        f.field === shortcut.filter.field &&
        f.operator === shortcut.filter.operator &&
        f.value === shortcut.filter.value
    );
    if (alreadyExists) return;
    const updatedFilters = [...group.filters, { ...shortcut.filter }];
    updateGroup(groupIdx, updatedFilters);
  }

  // ── Save as segment ──────────────────────────────────────────────────────
  async function handleSaveSegment() {
    if (!saveSegmentName.trim()) return;
    setSavingSegment(true);
    try {
      // Flatten groups for the API (flat filters format for backward compat)
      // Store as filterGroups JSON in the filters field
      await api.post("/segments", {
        name: saveSegmentName.trim(),
        filters: filterGroups.flatMap((g) => g.filters),
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveModalOpen(false);
        setSaveSegmentName("");
        setSaveSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Erro ao salvar segmento:", err);
    } finally {
      setSavingSegment(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const hasAnyFilter = filterGroups.some((g) => g.filters.length > 0);

  return (
    <div className="space-y-5">
      {/* Mode selector — pill tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setMode("all")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
            mode === "all"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
        >
          <Users size={14} />
          Todos os contatos
          {totalContacts !== null && mode === "all" && (
            <span className="ml-1 text-xs opacity-80">({totalContacts})</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode("filter")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
            mode === "filter"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
        >
          <Filter size={14} />
          Criar filtro
        </button>

        <button
          type="button"
          onClick={() => setMode("segment")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
            mode === "segment"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
          }`}
        >
          <BookOpen size={14} />
          Usar segmento salvo
        </button>
      </div>

      {/* ── All contacts ───────────────────────────────────────────────── */}
      {mode === "all" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">Todos os contatos</p>
              {totalContacts !== null ? (
                <p className="text-xs text-blue-600 mt-0.5">
                  {totalContacts.toLocaleString("pt-BR")} contatos receberao a campanha
                </p>
              ) : (
                <p className="text-xs text-blue-500 mt-0.5">Calculando contatos...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Filter builder ─────────────────────────────────────────────── */}
      {mode === "filter" && (
        <div className="space-y-4">
          {/* Shortcut chips */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
              Atalhos rapidos
            </p>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((shortcut) => {
                const activeGroup = filterGroups[activeGroupIndex] ?? filterGroups[0];
                const active = activeGroup?.filters.some(
                  (f) =>
                    f.field === shortcut.filter.field &&
                    f.operator === shortcut.filter.operator &&
                    f.value === shortcut.filter.value
                );
                return (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => applyShortcut(shortcut)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600"
                    }`}
                  >
                    {active && <Check size={10} />}
                    {shortcut.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* OR groups */}
          {filterGroups.map((group, groupIdx) => (
            <div key={groupIdx}>
              {/* OR separator */}
              {groupIdx > 0 && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="px-3 py-1 rounded-full text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200">
                    OU
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {/* Group card */}
              <div
                className={`relative rounded-xl border-2 p-4 transition-colors ${
                  activeGroupIndex === groupIdx
                    ? "border-blue-300 bg-blue-50/30"
                    : "border-gray-200 bg-white"
                }`}
                onClick={() => setActiveGroupIndex(groupIdx)}
              >
                {/* Group header */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Grupo {groupIdx + 1}
                    {filterGroups.length > 1 && (
                      <span className="ml-1 font-normal normal-case text-gray-400">
                        (filtros combinados com E)
                      </span>
                    )}
                  </span>
                  {filterGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeGroup(groupIdx);
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filter rows for this group */}
                <SegmentFilterBuilder
                  filters={group.filters}
                  onChange={(filters) => updateGroup(groupIdx, filters)}
                />
              </div>
            </div>
          ))}

          {/* Add OR group */}
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors w-full justify-center"
          >
            <Plus size={15} />
            Adicionar grupo OU
          </button>

          {/* Save as segment — small optional button */}
          {hasAnyFilter && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSaveSegmentName("");
                  setSaveSuccess(false);
                  setSaveModalOpen(true);
                }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Save size={12} />
                Salvar filtro como segmento
              </button>
            </div>
          )}

          {/* Dynamic count bar */}
          <div
            className={`rounded-xl border p-4 text-center transition-colors ${
              countLoading
                ? "border-gray-200 bg-gray-50"
                : hasAnyFilter
                ? "border-blue-200 bg-blue-50"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            {countLoading ? (
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Calculando contatos...</span>
              </div>
            ) : previewCount !== null ? (
              <div className="flex items-center justify-center gap-2">
                <Users size={16} className="text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">
                  {previewCount.toLocaleString("pt-BR")} contatos encontrados
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Adicione filtros para ver a contagem
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Saved segment selector ─────────────────────────────────────── */}
      {mode === "segment" && (
        <div className="space-y-2">
          {loadingSegments ? (
            <div className="flex items-center gap-2 py-6 text-gray-400 justify-center">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Carregando segmentos...</span>
            </div>
          ) : segments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
              <BookOpen size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-400">Nenhum segmento salvo ainda.</p>
              <button
                type="button"
                onClick={() => setMode("filter")}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Criar filtro personalizado
              </button>
            </div>
          ) : (
            <>
              {/* All contacts option within segment mode */}
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedSegmentId === null
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="segment"
                  checked={selectedSegmentId === null}
                  onChange={() =>
                    onChange({ ...value, selectedSegmentId: null })
                  }
                  className="text-blue-600 focus:ring-blue-500"
                />
                <Users size={15} className="text-gray-400 shrink-0" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">
                    Todos os contatos
                  </span>
                  {totalContacts !== null && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({totalContacts.toLocaleString("pt-BR")})
                    </span>
                  )}
                </div>
              </label>

              {segments.map((seg) => (
                <label
                  key={seg.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSegmentId === seg.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="segment"
                    checked={selectedSegmentId === seg.id}
                    onChange={() =>
                      onChange({ ...value, selectedSegmentId: seg.id })
                    }
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <BookOpen size={15} className="text-gray-400 shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">
                      {seg.name}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      ({seg.contactCount.toLocaleString("pt-BR")} contatos)
                    </span>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {/* TIME BGP notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <Users size={14} className="text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-blue-700">
            TIME BGP recebe copia automaticamente
          </p>
          <p className="text-[10px] text-blue-500 mt-0.5">
            Alem do publico escolhido, os membros internos recebem uma copia
            com [TIME] no assunto para acompanhamento.
          </p>
        </div>
      </div>

      {/* ── Save as segment modal ─────────────────────────────────────── */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                Salvar filtro como segmento
              </h3>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {saveSuccess ? (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <Check size={16} />
                  Segmento salvo com sucesso!
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do segmento
                    </label>
                    <input
                      type="text"
                      value={saveSegmentName}
                      onChange={(e) => setSaveSegmentName(e.target.value)}
                      placeholder="Ex: Leads em andamento etapa 2"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setSaveModalOpen(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSegment}
                      disabled={!saveSegmentName.trim() || savingSegment}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingSegment ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Save size={13} />
                      )}
                      Salvar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
