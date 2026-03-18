"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import {
  QrCode,
  Link2,
  Unplug,
  Save,
  ExternalLink,
  Send,
  Trash2,
  Bot,
  AlertTriangle,
  UserPlus,
  ChevronDown,
  ChevronUp,
  FileText,
  Check,
  AlertCircle,
  Plus,
  X,
  Tag,
  Eye,
  EyeOff,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface InstanceStatus {
  instance: { instanceName: string; state: string };
}

interface BotConfig {
  zapiInstanceId: string;
  zapiToken: string;
  zapiClientToken: string;
  baseUrl: string;
  companyName: string;
  companyPhone: string;
  botPhoneNumber: string;
  meetingLink: string;
  openaiApiKey: string;
  welcomeMessage: string;
  botSystemPrompt: string;
  botEnabled: boolean;
  followUpEnabled: boolean;
  leadQualificationEnabled: boolean;
  sdrAutoMessageEnabled: boolean;
  meetingReminderEnabled: boolean;
}

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const defaultConfig: BotConfig = {
  zapiInstanceId: "",
  zapiToken: "",
  zapiClientToken: "",
  baseUrl: "",
  companyName: "",
  companyPhone: "",
  botPhoneNumber: "",
  meetingLink: "",
  openaiApiKey: "",
  welcomeMessage: "",
  botSystemPrompt: "",
  botEnabled: false,
  followUpEnabled: true,
  leadQualificationEnabled: true,
  sdrAutoMessageEnabled: true,
  meetingReminderEnabled: true,
};

const TABS = [
  { key: "conexao", label: "Conexão" },
  { key: "sdr", label: "SDR IA" },
  { key: "contextos", label: "Contextos" },
  { key: "testar", label: "Testar IA" },
  { key: "credenciais", label: "Credenciais" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

export default function ConversasConfiguracaoPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("conexao");

  // Shared config state
  const [status, setStatus] = useState<InstanceStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [config, setConfig] = useState<BotConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss success messages after 4 seconds
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<{ data: InstanceStatus }>("/whatsapp/instance/status");
      setStatus(res.data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const res = await api.get<{ data: BotConfig }>("/whatsapp/config");
      if (res.data) {
        setConfig({ ...defaultConfig, ...res.data });
      }
    } catch {
      // Config might not exist yet
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  const handleConnect = async () => {
    setError(null);
    setQrCode(null);
    try {
      const res = await api.get<{ data: { base64?: string; qrcode?: { base64?: string } } }>("/whatsapp/instance/connect");
      const qr = res.data?.base64 || res.data?.qrcode?.base64 || null;
      setQrCode(qr);
    } catch {
      setError("Erro ao gerar QR Code.");
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await api.delete("/whatsapp/instance/logout");
      setSuccessMsg("Desconectado com sucesso.");
      setQrCode(null);
      await fetchStatus();
    } catch {
      setError("Erro ao desconectar.");
    }
  };

  const handleConfigureWebhook = async () => {
    setError(null);
    try {
      await api.post("/whatsapp/instance/webhook/setup", {});
      setSuccessMsg("Webhook configurado com sucesso.");
    } catch {
      setError("Erro ao configurar webhook.");
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.put("/whatsapp/config", config);
      setSuccessMsg("Configurações salvas com sucesso.");
    } catch {
      setError("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BotConfig, value: string | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const statusColor =
    status?.instance?.state === "open"
      ? "bg-green-500"
      : status?.instance?.state === "connecting"
      ? "bg-yellow-500"
      : "bg-red-500";

  const statusLabel =
    status?.instance?.state === "open"
      ? "Conectado"
      : status?.instance?.state === "connecting"
      ? "Conectando..."
      : "Desconectado";

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Configuração" breadcrumb={["Conversas", "Configuração"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-sm text-red-600 font-medium hover:underline">
            Fechar
          </button>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-green-700">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-sm text-green-600 font-medium hover:underline">
            Fechar
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px",
                activeTab === tab.key
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-4 sm:p-6">
        {activeTab === "conexao" && (
          <TabConexao
            loading={loading}
            statusColor={statusColor}
            statusLabel={statusLabel}
            qrCode={qrCode}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onConfigureWebhook={handleConfigureWebhook}
          />
        )}

        {activeTab === "sdr" && (
          <TabSdrIa
            config={config}
            configLoading={configLoading}
            saving={saving}
            updateField={updateField}
            saveConfig={saveConfig}
          />
        )}

        {activeTab === "contextos" && <TabContextos />}

        {activeTab === "testar" && <TabTestarIA />}

        {activeTab === "credenciais" && (
          <TabCredenciais
            config={config}
            configLoading={configLoading}
            saving={saving}
            updateField={updateField}
            saveConfig={saveConfig}
          />
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Conexão
// ─────────────────────────────────────────────

function TabConexao({
  loading,
  statusColor,
  statusLabel,
  qrCode,
  onConnect,
  onDisconnect,
  onConfigureWebhook,
}: {
  loading: boolean;
  statusColor: string;
  statusLabel: string;
  qrCode: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigureWebhook: () => void;
}) {
  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Conexão WhatsApp</h2>

      <div className="flex items-center gap-3 mb-6">
        {loading ? (
          <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
        ) : (
          <>
            <div className={clsx("w-3 h-3 rounded-full", statusColor)} />
            <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <a
          href="https://app.z-api.io"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <ExternalLink size={16} />
          Painel Z-API
        </a>
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <QrCode size={16} />
          Conectar (QR Code)
        </button>
        <button
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Unplug size={16} />
          Desconectar
        </button>
        <button
          onClick={onConfigureWebhook}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Link2 size={16} />
          Configurar Webhook
        </button>
      </div>

      {qrCode && (
        <div className="bg-gray-50 rounded-lg p-6 flex flex-col items-center">
          <p className="text-sm text-gray-600 mb-4">Escaneie o QR Code com o WhatsApp:</p>
          <img
            src={qrCode}
            alt="QR Code WhatsApp"
            className="w-48 h-48 sm:w-64 sm:h-64 border border-gray-200 rounded-lg"
          />
          <p className="text-xs text-gray-400 mt-3">
            O QR Code expira em alguns segundos. Clique em &quot;Conectar&quot; novamente se necessário.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────
// Tab: SDR IA
// ─────────────────────────────────────────────

function TabSdrIa({
  config,
  configLoading,
  saving,
  updateField,
  saveConfig,
}: {
  config: BotConfig;
  configLoading: boolean;
  saving: boolean;
  updateField: (field: keyof BotConfig, value: string | boolean) => void;
  saveConfig: () => void;
}) {
  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">SDR IA — Comportamento do Bot</h2>
      <p className="text-xs text-gray-500 mb-6">
        Configure a personalidade e as regras da Bia (SDR IA) sem precisar mexer no código.
      </p>

      {configLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prompt do Sistema (personalidade e regras do bot)
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Este prompt define como a Bia (SDR IA) se comporta. Edite aqui para mudar tom, regras, produtos,
              objeções, etc.
            </p>
            <textarea
              value={config.botSystemPrompt}
              onChange={(e) => updateField("botSystemPrompt", e.target.value)}
              placeholder="Você é um assistente de vendas da BGPGO..."
              rows={22}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link de Reunião</label>
            <input
              type="text"
              value={config.meetingLink}
              onChange={(e) => updateField("meetingLink", e.target.value)}
              placeholder="https://calendly.com/xxx ou https://meet.google.com/xxx"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de Boas-vindas</label>
            <p className="text-xs text-gray-400 mb-2">
              Primeira mensagem enviada quando um novo lead entra pelo WhatsApp.
            </p>
            <textarea
              value={config.welcomeMessage}
              onChange={(e) => updateField("welcomeMessage", e.target.value)}
              placeholder="Olá! Bem-vindo à BGPGO..."
              rows={5}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar SDR IA"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────
// Tab: Contextos
// ─────────────────────────────────────────────

function TabContextos() {
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
    <div className="flex flex-col sm:flex-row gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white min-h-[500px]">
      {/* Left sidebar */}
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
                  <span className="text-[10px] text-gray-400">+{ctx.triggers.length - 3}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {!selectedContext ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-8">
            <FileText size={48} strokeWidth={1.5} />
            <p className="text-sm">Selecione um contexto para editar</p>
            <p className="text-xs text-gray-300">
              O contexto e usado pelo Agente SDR IA para personalizar a abordagem
            </p>
          </div>
        ) : (
          <div className="p-4 sm:p-6 max-w-3xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{selectedContext.campaign.name}</h2>
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
                Strings que sao matcheadas contra utm_campaign, utm_source, source name, campaign name ou landing
                page URL do lead. Se qualquer trigger corresponder, este contexto sera usado.
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
                  <span className="text-xs text-gray-400 italic">Nenhum trigger configurado</span>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Contexto da Campanha</label>
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

// ─────────────────────────────────────────────
// Tab: Follow-up
// ─────────────────────────────────────────────

interface FollowUpStep {
  order: number;
  delayMinutes: number;
  tone: string;
}

const TONE_OPTIONS = [
  { value: "CASUAL", label: "Casual", desc: "Leve, checando se viu a mensagem" },
  { value: "REFORCO", label: "Reforço", desc: "Reforça valor, propõe demo" },
  { value: "ENCERRAMENTO", label: "Encerramento", desc: "Agradece e encerra" },
];

function TabFollowup({
  config,
  configLoading,
  saving,
  updateField,
  saveConfig,
}: {
  config: BotConfig;
  configLoading: boolean;
  saving: boolean;
  updateField: (field: keyof BotConfig, value: string | boolean) => void;
  saveConfig: () => void;
}) {
  const [steps, setSteps] = useState<FollowUpStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(true);
  const [stepsSaving, setStepsSaving] = useState(false);
  const [stepsMsg, setStepsMsg] = useState("");

  useEffect(() => {
    api.get<{ data: FollowUpStep[] }>("/whatsapp-config/follow-up-steps")
      .then((res) => {
        const loaded = (res as { data: FollowUpStep[] }).data || [];
        setSteps(loaded.length > 0 ? loaded : [
          { order: 1, delayMinutes: 30, tone: "CASUAL" },
          { order: 2, delayMinutes: 60, tone: "REFORCO" },
          { order: 3, delayMinutes: 120, tone: "ENCERRAMENTO" },
        ]);
      })
      .catch(() => {
        setSteps([
          { order: 1, delayMinutes: 30, tone: "CASUAL" },
          { order: 2, delayMinutes: 60, tone: "REFORCO" },
          { order: 3, delayMinutes: 120, tone: "ENCERRAMENTO" },
        ]);
      })
      .finally(() => setStepsLoading(false));
  }, []);

  const updateStep = (index: number, field: keyof FollowUpStep, value: string | number) => {
    setSteps((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addStep = () => {
    const nextOrder = steps.length + 1;
    setSteps((prev) => [...prev, { order: nextOrder, delayMinutes: 60, tone: "CASUAL" }]);
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const saveSteps = async () => {
    setStepsSaving(true);
    setStepsMsg("");
    try {
      await api.put("/whatsapp-config/follow-up-steps", { steps });
      setStepsMsg("Steps salvos!");
      setTimeout(() => setStepsMsg(""), 3000);
    } catch {
      setStepsMsg("Erro ao salvar steps");
    } finally {
      setStepsSaving(false);
    }
  };

  const toggles: Array<{ field: keyof BotConfig; label: string; description: string }> = [
    { field: "botEnabled", label: "Bot SDR IA", description: "Ativa/desativa o bot que responde mensagens no WhatsApp" },
    { field: "followUpEnabled", label: "Follow-up Automático", description: "Envia follow-ups automáticos para leads que não responderam" },
    { field: "leadQualificationEnabled", label: "Qualificação de Leads", description: "Verifica Calendly e ativa SDR IA quando lead entra pela LP" },
    { field: "sdrAutoMessageEnabled", label: "Mensagem Automática SDR", description: "Envia primeira mensagem automática via WhatsApp para novos leads" },
    { field: "meetingReminderEnabled", label: "Lembretes de Reunião", description: "Envia lembretes automáticos via WhatsApp antes das reuniões" },
  ];

  return (
    <div className="space-y-6">
      {/* Toggles */}
      <Card padding="lg">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Funcionalidades</h2>
        {configLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {toggles.map(({ field, label, description }) => (
              <div key={field} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-b-0">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
                <button
                  onClick={() => updateField(field, !config[field])}
                  className={clsx(
                    "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
                    config[field] ? "bg-blue-600" : "bg-gray-300"
                  )}
                >
                  <span className={clsx("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", config[field] ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>
            ))}
            <button onClick={saveConfig} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar Toggles"}
            </button>
          </div>
        )}
      </Card>

      {/* Follow-up Steps */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Etapas de Follow-up</h2>
            <p className="text-xs text-gray-500 mt-0.5">Quando o lead não responde, o bot envia follow-ups automáticos nesta sequência</p>
          </div>
          <button onClick={addStep} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
            <Plus size={12} />
            Adicionar
          </button>
        </div>

        {stepsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : steps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma etapa configurada. O follow-up automático não será enviado.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                  {step.order}
                </span>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Delay (minutos)</label>
                    <input
                      type="number"
                      min={1}
                      value={step.delayMinutes}
                      onChange={(e) => updateStep(idx, "delayMinutes", parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Tom</label>
                    <select
                      value={step.tone}
                      onChange={(e) => updateStep(idx, "tone", e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {TONE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button onClick={() => removeStep(idx)} className="flex-shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button onClick={saveSteps} disabled={stepsSaving} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Save size={16} />
            {stepsSaving ? "Salvando..." : "Salvar Steps"}
          </button>
          {stepsMsg && <span className={clsx("text-xs font-medium", stepsMsg.includes("Erro") ? "text-red-600" : "text-green-600")}>{stepsMsg}</span>}
        </div>

        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs text-amber-700">
            <strong>Como funciona:</strong> Se o lead não responder após a última mensagem do bot, o sistema espera o delay configurado e envia o follow-up com o tom escolhido. O ciclo para se o lead responder em qualquer momento.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Testar IA
// ─────────────────────────────────────────────

function TabTestarIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simContext, setSimContext] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [sourceName, setSourceName] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post<{ data: { reply: string } }>("/whatsapp/test-chat", {
        message: text,
        history: messages,
      });

      const botMessage: ChatMessage = {
        role: "assistant",
        content: res.data.reply,
      };
      setMessages([...updatedMessages, botMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Erro ao se comunicar com a IA. Verifique se a API Key da OpenAI esta configurada.",
        isError: true,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setSimContext(null);
    inputRef.current?.focus();
  };

  const simulateLead = async () => {
    if (!contactName.trim() || simLoading) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await api.post<{ data: { aiReply: string; context?: string } }>(
        "/whatsapp/test-chat/simulate-lead",
        {
          contactName: contactName.trim(),
          campaignName: campaignName.trim() || undefined,
          sourceName: sourceName.trim() || undefined,
        }
      );
      const botMessage: ChatMessage = {
        role: "assistant",
        content: res.data.aiReply,
      };
      setMessages([botMessage]);
      if (res.data.context) {
        setSimContext(res.data.context);
      }
      setSimPanelOpen(false);
    } catch {
      setSimError("Erro ao simular lead. Verifique se a API esta acessivel.");
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ minHeight: 560 }}>
      {/* Simulate Lead Panel */}
      <div className="bg-indigo-50 border-b border-indigo-200 overflow-hidden">
        <button
          onClick={() => setSimPanelOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <UserPlus size={16} />
            Simular Entrada de Lead
          </span>
          {simPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {simPanelOpen && (
          <div className="px-4 pb-4 pt-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">
                  Nome do Lead <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ex: João Silva"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">Campanha</label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: GoBI Maio 2026"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">Fonte</label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Ex: Google Ads"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            {simError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {simError}
              </p>
            )}

            <button
              onClick={simulateLead}
              disabled={!contactName.trim() || simLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {simLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Simulando...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Simular
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6" style={{ minHeight: 300 }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-12">
            <Bot size={48} strokeWidth={1.5} />
            <p className="text-sm">Envie uma mensagem para testar o Agente SDR IA</p>
            <p className="text-xs text-gray-300">O historico e mantido apenas nesta sessao</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {simContext && (
              <div className="flex items-start gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                <UserPlus size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  <span className="font-medium">Contexto usado:</span> {simContext}
                </span>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={clsx(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : msg.isError
                      ? "bg-red-50 border border-red-200 text-red-700 rounded-bl-md"
                      : "bg-gray-100 text-gray-900 rounded-bl-md"
                  )}
                >
                  {msg.isError ? (
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    </div>
                  ) : msg.role === "user" ? (
                    <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                  ) : (
                    <span
                      className="whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.content) }}
                    />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Limpar conversa"
            >
              <Trash2 size={18} />
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Credenciais
// ─────────────────────────────────────────────

function TabCredenciais({
  config,
  configLoading,
  saving,
  updateField,
  saveConfig,
}: {
  config: BotConfig;
  configLoading: boolean;
  saving: boolean;
  updateField: (field: keyof BotConfig, value: string | boolean) => void;
  saveConfig: () => void;
}) {
  const [showTokens, setShowTokens] = useState(false);

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-900">Credenciais e Configurações Técnicas</h2>
        <button
          onClick={() => setShowTokens((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {showTokens ? <EyeOff size={14} /> : <Eye size={14} />}
          {showTokens ? "Ocultar" : "Revelar"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Credenciais sensíveis. Mantenha ocultas e só edite quando necessário.
      </p>

      {configLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Z-API */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Z-API</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instance ID</label>
                <input
                  type={showTokens ? "text" : "password"}
                  value={config.zapiInstanceId}
                  onChange={(e) => updateField("zapiInstanceId", e.target.value)}
                  placeholder="ID da instância Z-API"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token</label>
                <input
                  type={showTokens ? "text" : "password"}
                  value={config.zapiToken}
                  onChange={(e) => updateField("zapiToken", e.target.value)}
                  placeholder="Token da instância"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Token</label>
                <input
                  type={showTokens ? "text" : "password"}
                  value={config.zapiClientToken}
                  onChange={(e) => updateField("zapiClientToken", e.target.value)}
                  placeholder="Token de segurança (opcional)"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* OpenAI */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">OpenAI</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type={showTokens ? "text" : "password"}
                value={config.openaiApiKey}
                onChange={(e) => updateField("openaiApiKey", e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Company / Bot */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Empresa e Bot</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={(e) => updateField("companyName", e.target.value)}
                  placeholder="BGPGO"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone da Empresa</label>
                <input
                  type="text"
                  value={config.companyPhone}
                  onChange={(e) => updateField("companyPhone", e.target.value)}
                  placeholder="5511999999999"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número do Bot (WhatsApp)</label>
                <input
                  type="text"
                  value={config.botPhoneNumber}
                  onChange={(e) => updateField("botPhoneNumber", e.target.value)}
                  placeholder="5511999999999"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Base da API</label>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => updateField("baseUrl", e.target.value)}
                  placeholder="https://api.bgpgo.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar Credenciais"}
          </button>
        </div>
      )}
    </Card>
  );
}
