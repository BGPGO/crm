"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import { FileText, Save, Sparkles, Trash2, Check, AlertCircle } from "lucide-react";
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
  campaignId: string;
  campaign: { id: string; name: string; description?: string | null };
}

type SelectedItem =
  | { type: "default" }
  | { type: "campaign"; campaign: CampaignInfo; hasContext: boolean };

export default function ContextosPage() {
  const [contexts, setContexts] = useState<CampaignContextData[]>([]);
  const [campaignsWithoutContext, setCampaignsWithoutContext] = useState<CampaignInfo[]>([]);
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const [contextText, setContextText] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default context state
  const [defaultContext, setDefaultContext] = useState<CampaignContextData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [listRes, defaultRes] = await Promise.all([
        api.get<{ data: { contexts: CampaignContextData[]; campaignsWithoutContext: CampaignInfo[] } }>("/campaign-contexts"),
        api.get<{ data: CampaignContextData | null }>("/campaign-contexts/default"),
      ]);
      setContexts(listRes.data.contexts);
      setCampaignsWithoutContext(listRes.data.campaignsWithoutContext);
      setDefaultContext(defaultRes.data);
    } catch {
      // Silent fail on load
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectDefault = () => {
    setSelected({ type: "default" });
    setIsDefault(true);
    setError(null);
    setSaveSuccess(false);
    if (defaultContext) {
      setContextText(defaultContext.context);
    } else {
      setContextText("");
    }
  };

  const selectCampaign = (campaign: CampaignInfo) => {
    const existing = contexts.find((c) => c.campaignId === campaign.id);
    const hasContext = !!existing;
    setSelected({ type: "campaign", campaign, hasContext });
    setIsDefault(false);
    setError(null);
    setSaveSuccess(false);

    if (existing) {
      setContextText(existing.context);
    } else {
      // Pre-fill suggestion
      const desc = campaign.description ? `${campaign.description}\n\n` : "";
      setContextText(
        `Lead da campanha: ${campaign.name}\n${desc}Use esse contexto para personalizar a abordagem inicial.\nDirecione para agendamento via Calendly.`
      );
    }
  };

  const fillSuggestion = () => {
    if (!selected) return;
    if (selected.type === "default") {
      setContextText(
        `Este e o contexto padrao usado quando a campanha do lead nao tem um contexto especifico.\n\nPersonalize a abordagem inicial com base nas informacoes disponiveis.\nObjetivo principal: agendar uma demonstracao.\nDirecione para agendamento via Calendly.`
      );
    } else {
      const campaign = selected.campaign;
      const desc = campaign.description ? `${campaign.description}\n\n` : "";
      setContextText(
        `Lead da campanha: ${campaign.name}\n${desc}Use esse contexto para personalizar a abordagem inicial.\nDirecione para agendamento via Calendly.`
      );
    }
  };

  const handleSave = async () => {
    if (!selected || !contextText.trim()) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      if (selected.type === "default") {
        // For default context, we need a "virtual" campaign or we use the first default context's campaign
        // The default context is stored as a CampaignContext with isDefault=true
        // If there's already a default, update it; otherwise we need a campaign to attach to
        if (defaultContext) {
          await api.put(`/campaign-contexts/${defaultContext.campaignId}`, {
            context: contextText.trim(),
            isDefault: true,
          });
        } else {
          // We need at least one campaign to store the default
          // Pick the first campaign without context, or the first campaign overall
          const allCampaigns = [...campaignsWithoutContext, ...contexts.map((c) => c.campaign)];
          if (allCampaigns.length === 0) {
            setError("Nenhuma campanha encontrada. Crie uma campanha primeiro.");
            setSaving(false);
            return;
          }
          // Prefer a campaign without context
          const target = campaignsWithoutContext[0] || allCampaigns[0];
          await api.put(`/campaign-contexts/${target.id}`, {
            context: contextText.trim(),
            isDefault: true,
          });
        }
      } else {
        await api.put(`/campaign-contexts/${selected.campaign.id}`, {
          context: contextText.trim(),
          isDefault: false,
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchData();

      // Update selected state
      if (selected.type === "campaign") {
        setSelected({ ...selected, hasContext: true });
      }
    } catch {
      setError("Erro ao salvar contexto. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.type === "default") return;
    if (!confirm("Remover o contexto desta campanha?")) return;

    setDeleting(true);
    setError(null);

    try {
      await api.delete(`/campaign-contexts/${selected.campaign.id}`);
      await fetchData();
      selectCampaign(selected.campaign);
    } catch {
      setError("Erro ao remover contexto.");
    } finally {
      setDeleting(false);
    }
  };

  // Determine campaign lists
  const campaignsConfigured = contexts
    .filter((c) => !c.isDefault)
    .map((c) => ({ ...c.campaign, contextId: c.id }));

  const getSelectedCampaignId = () => {
    if (!selected) return null;
    if (selected.type === "default") return "__default__";
    return selected.campaign.id;
  };

  const selectedId = getSelectedCampaignId();

  return (
    <div className="flex flex-col h-full">
      <Header title="Contextos" breadcrumb={["Conversas", "Contextos"]} />
      <ConversasNav />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-72 border-r border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Campanhas
            </h3>
          </div>

          {/* Default context item */}
          <button
            onClick={selectDefault}
            className={clsx(
              "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors",
              selectedId === "__default__"
                ? "bg-blue-50 border-l-2 border-l-blue-600"
                : "hover:bg-gray-100"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Contexto Padrao</span>
              {defaultContext ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700">
                  <Check size={10} />
                  Configurado
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500">
                  Sem contexto
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Usado quando nao ha contexto especifico</p>
          </button>

          {/* Separator */}
          {(campaignsConfigured.length > 0 || campaignsWithoutContext.length > 0) && (
            <div className="px-4 py-2 border-b border-gray-200">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Campanhas do CRM
              </span>
            </div>
          )}

          {/* Campaigns with context */}
          {campaignsConfigured.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => selectCampaign(campaign)}
              className={clsx(
                "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors",
                selectedId === campaign.id
                  ? "bg-blue-50 border-l-2 border-l-blue-600"
                  : "hover:bg-gray-100"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate mr-2">
                  {campaign.name}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700 flex-shrink-0">
                  <Check size={10} />
                  Configurado
                </span>
              </div>
            </button>
          ))}

          {/* Campaigns without context */}
          {campaignsWithoutContext.map((campaign) => (
            <button
              key={campaign.id}
              onClick={() => selectCampaign(campaign)}
              className={clsx(
                "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors",
                selectedId === campaign.id
                  ? "bg-blue-50 border-l-2 border-l-blue-600"
                  : "hover:bg-gray-100"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate mr-2">
                  {campaign.name}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                  Sem contexto
                </span>
              </div>
            </button>
          ))}

          {campaignsConfigured.length === 0 && campaignsWithoutContext.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-gray-400">
              Nenhuma campanha encontrada no CRM.
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <FileText size={48} strokeWidth={1.5} />
              <p className="text-sm">Selecione uma campanha para configurar o contexto</p>
              <p className="text-xs text-gray-300">
                O contexto e usado pelo Agente SDR IA para personalizar a abordagem
              </p>
            </div>
          ) : (
            <div className="p-6 max-w-3xl">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {selected.type === "default"
                  ? "Contexto Padrao"
                  : `Contexto para: ${selected.campaign.name}`}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {selected.type === "default"
                  ? "Este contexto sera usado quando a campanha do lead nao tiver um contexto especifico configurado."
                  : "Configure o contexto que o Agente SDR IA usara para leads desta campanha."}
              </p>

              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                rows={15}
                placeholder={`Este lead veio da campanha de GoBI.\nFoque em dashboards financeiros, indicadores em tempo real, integracao com ERPs.\nProduto principal: GoBI (a partir de R$397/mes).\nObjetivo: agendar uma demonstracao de 45 minutos.`}
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
              />

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
                  onClick={fillSuggestion}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Sparkles size={14} />
                  Preencher com sugestao
                </button>

                {selected.type === "campaign" && selected.hasContext && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {deleting ? "Removendo..." : "Remover"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
