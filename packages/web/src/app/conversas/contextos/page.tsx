"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import {
  FileText,
  Save,
  Trash2,
  Check,
  AlertCircle,
  Plus,
  X,
  Tag,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface CampaignInfo {
  id: string;
  name: string;
  description?: string | null;
}

interface CampaignContextData {
  id: string;
  context: string;
  isDefault: boolean;
  triggers: string[];
  campaignId: string;
  campaign: { id: string; name: string; description?: string | null };
}

export default function ContextosPage() {
  const [contexts, setContexts] = useState<CampaignContextData[]>([]);
  const [campaignsWithoutContext, setCampaignsWithoutContext] = useState<CampaignInfo[]>([]);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);

  const [contextText, setContextText] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [newTrigger, setNewTrigger] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add context modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCampaignId, setAddCampaignId] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const listRes = await api.get<{
        data: {
          contexts: CampaignContextData[];
          campaignsWithoutContext: CampaignInfo[];
        };
      }>("/campaign-contexts");
      setContexts(listRes.data.contexts);
      setCampaignsWithoutContext(listRes.data.campaignsWithoutContext);
    } catch {
      // Silent fail on load
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedContext = contexts.find((c) => c.id === selectedContextId) ?? null;

  const selectContext = (ctx: CampaignContextData) => {
    setSelectedContextId(ctx.id);
    setContextText(ctx.context);
    setIsDefault(ctx.isDefault);
    setTriggers(Array.isArray(ctx.triggers) ? ctx.triggers : []);
    setError(null);
    setSaveSuccess(false);
  };

  const addTrigger = () => {
    const val = newTrigger.trim().toLowerCase();
    if (!val || triggers.includes(val)) return;
    setTriggers([...triggers, val]);
    setNewTrigger("");
  };

  const removeTrigger = (index: number) => {
    setTriggers(triggers.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!selectedContext || !contextText.trim()) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      await api.put(`/campaign-contexts/${selectedContext.campaignId}`, {
        context: contextText.trim(),
        isDefault,
        triggers,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchData();
    } catch {
      setError("Erro ao salvar contexto. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedContext) return;
    if (!confirm("Remover o contexto desta campanha?")) return;

    setDeleting(true);
    setError(null);

    try {
      await api.delete(`/campaign-contexts/${selectedContext.campaignId}`);
      setSelectedContextId(null);
      setContextText("");
      setTriggers([]);
      await fetchData();
    } catch {
      setError("Erro ao remover contexto.");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddContext = async () => {
    if (!addCampaignId) return;
    setSaving(true);
    setError(null);

    try {
      await api.put(`/campaign-contexts/${addCampaignId}`, {
        context: "Configure o contexto aqui...",
        isDefault: false,
        triggers: [],
      });
      setShowAddModal(false);
      setAddCampaignId("");
      await fetchData();

      // Select the newly created context
      const listRes = await api.get<{
        data: {
          contexts: CampaignContextData[];
          campaignsWithoutContext: CampaignInfo[];
        };
      }>("/campaign-contexts");
      const newCtx = listRes.data.contexts.find((c) => c.campaignId === addCampaignId);
      if (newCtx) {
        selectContext(newCtx);
      }
    } catch {
      setError("Erro ao criar contexto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Contextos" breadcrumb={["Conversas", "Contextos"]} />
      <ConversasNav />

      <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">
        {/* Left sidebar — only contexts that exist */}
        <div className="w-full sm:w-72 border-b sm:border-b-0 sm:border-r border-gray-200 bg-gray-50 flex flex-col overflow-y-auto max-h-48 sm:max-h-none">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Contextos Configurados
            </h3>
            <button
              onClick={() => {
                setShowAddModal(true);
                setAddCampaignId("");
              }}
              className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
              title="Adicionar contexto"
            >
              <Plus size={16} />
            </button>
          </div>

          {contexts.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              Nenhum contexto configurado.
              <br />
              Clique em + para adicionar.
            </div>
          )}

          {contexts.map((ctx) => (
            <button
              key={ctx.id}
              onClick={() => selectContext(ctx)}
              className={clsx(
                "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors",
                selectedContextId === ctx.id
                  ? "bg-blue-50 border-l-2 border-l-blue-600"
                  : "hover:bg-gray-100"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate mr-2">
                  {ctx.campaign.name}
                </span>
                {ctx.isDefault && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                    Padrao
                  </span>
                )}
              </div>
              {Array.isArray(ctx.triggers) && ctx.triggers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ctx.triggers.slice(0, 3).map((t, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-gray-100 text-gray-500"
                    >
                      {t}
                    </span>
                  ))}
                  {ctx.triggers.length > 3 && (
                    <span className="text-[10px] text-gray-400">
                      +{ctx.triggers.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {!selectedContext ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <FileText size={48} strokeWidth={1.5} />
              <p className="text-sm">Selecione um contexto para editar</p>
              <p className="text-xs text-gray-300">
                O contexto e usado pelo Agente SDR IA para personalizar a abordagem
              </p>
            </div>
          ) : (
            <div className="p-4 sm:p-6 max-w-3xl">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedContext.campaign.name}
                </h2>
              </div>
              <p className="text-sm text-gray-500 mb-6">
                Configure o contexto que o Agente SDR IA usara para leads desta campanha.
              </p>

              {/* Triggers section */}
              <div className="mb-6">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Tag size={14} />
                  Triggers
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Strings que sao matcheadas contra utm_campaign, utm_source, source name, campaign name ou landing page URL do lead. Se qualquer trigger corresponder, este contexto sera usado.
                </p>

                <div className="flex flex-wrap gap-2 mb-3">
                  {triggers.map((trigger, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-blue-50 text-blue-700 rounded-lg border border-blue-200"
                    >
                      {trigger}
                      <button
                        onClick={() => removeTrigger(index)}
                        className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {triggers.length === 0 && (
                    <span className="text-xs text-gray-400 italic">
                      Nenhum trigger configurado
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTrigger())}
                    placeholder="Novo trigger (ex: gobi, novo-gobi, lp.bertuzzi...)"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                  />
                  <button
                    onClick={addTrigger}
                    disabled={!newTrigger.trim()}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              {/* Context textarea */}
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contexto da Campanha
              </label>
              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                rows={15}
                placeholder="Descreva o produto, proposta, beneficios, publico-alvo, abordagem ideal..."
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
              />

              {/* Default checkbox */}
              <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Usar como contexto padrao (quando nenhum trigger corresponder)
              </label>

              {error && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-600">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              {saveSuccess && (
                <div className="flex items-center gap-2 mt-3 text-sm text-green-600">
                  <Check size={14} />
                  Contexto salvo com sucesso!
                </div>
              )}

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSave}
                  disabled={saving || !contextText.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      Salvar
                    </>
                  )}
                </button>

                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {deleting ? "Removendo..." : "Remover"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Context Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Adicionar Contexto</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Selecione uma campanha que ainda nao tem contexto configurado.
            </p>

            {campaignsWithoutContext.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center">
                Todas as campanhas ja tem contexto configurado.
              </p>
            ) : (
              <select
                value={addCampaignId}
                onChange={(e) => setAddCampaignId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              >
                <option value="">Selecione uma campanha...</option>
                {campaignsWithoutContext.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddContext}
                disabled={!addCampaignId || saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Criando..." : "Criar Contexto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
