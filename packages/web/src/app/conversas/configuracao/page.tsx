"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { Wifi, WifiOff, QrCode, Trash2, Link2, Unplug, Save } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface InstanceStatus {
  state: "open" | "connecting" | "close" | string;
}

interface BotConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
  baseUrl: string;
  companyName: string;
  companyPhone: string;
  meetingLink: string;
  openaiApiKey: string;
  welcomeMessage: string;
  botSystemPrompt: string;
  botEnabled: boolean;
}

const defaultConfig: BotConfig = {
  evolutionApiUrl: "",
  evolutionApiKey: "",
  instanceName: "",
  baseUrl: "",
  companyName: "",
  companyPhone: "",
  meetingLink: "",
  openaiApiKey: "",
  welcomeMessage: "",
  botSystemPrompt: "",
  botEnabled: false,
};

export default function ConversasConfiguracaoPage() {
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

  const handleCreateInstance = async () => {
    setError(null);
    try {
      await api.post("/whatsapp/instance/create", {});
      setSuccessMsg("Instância criada com sucesso.");
      await fetchStatus();
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        setSuccessMsg("Instância já existe. Use Conectar (QR Code).");
      } else {
        setError("Erro ao criar instância.");
      }
    }
  };

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

  const handleDelete = async () => {
    setError(null);
    try {
      await api.delete("/whatsapp/instance/delete");
      setSuccessMsg("Instância deletada.");
      setQrCode(null);
      await fetchStatus();
    } catch {
      setError("Erro ao deletar instância.");
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

  const statusColor = status?.state === "open"
    ? "bg-green-500"
    : status?.state === "connecting"
    ? "bg-yellow-500"
    : "bg-red-500";

  const statusLabel = status?.state === "open"
    ? "Conectado"
    : status?.state === "connecting"
    ? "Conectando..."
    : "Desconectado";

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Configuração" breadcrumb={["Conversas", "Configuração"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-sm text-red-600 font-medium hover:underline">Fechar</button>
        </div>
      )}

      {successMsg && (
        <div className="mx-4 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-green-700">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-sm text-green-600 font-medium hover:underline">Fechar</button>
        </div>
      )}

      <main className="flex-1 p-6 space-y-6">
        {/* Section 1: WhatsApp Connection */}
        <Card padding="lg">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Conexão WhatsApp</h2>

          {/* Status indicator */}
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

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={handleCreateInstance}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Wifi size={16} />
              Criar Instância
            </button>
            <button
              onClick={handleConnect}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <QrCode size={16} />
              Conectar (QR Code)
            </button>
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Unplug size={16} />
              Desconectar
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={16} />
              Deletar Instância
            </button>
            <button
              onClick={handleConfigureWebhook}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Link2 size={16} />
              Configurar Webhook
            </button>
          </div>

          {/* QR Code display */}
          {qrCode && (
            <div className="bg-gray-50 rounded-lg p-6 flex flex-col items-center">
              <p className="text-sm text-gray-600 mb-4">Escaneie o QR Code com o WhatsApp:</p>
              <img
                src={qrCode}
                alt="QR Code WhatsApp"
                className="w-64 h-64 border border-gray-200 rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-3">
                O QR Code expira em alguns segundos. Clique em &quot;Conectar&quot; novamente se necessário.
              </p>
            </div>
          )}
        </Card>

        {/* Section 2: Bot Configuration */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Configurações do Bot</h2>
            {configLoading ? (
              <div className="h-6 w-20 bg-gray-100 rounded animate-pulse" />
            ) : (
              <button
                onClick={() => updateField("botEnabled", !config.botEnabled)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  config.botEnabled ? "bg-blue-600" : "bg-gray-300"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    config.botEnabled ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            )}
          </div>

          {configLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Evolution API URL</label>
                  <input
                    type="text"
                    value={config.evolutionApiUrl}
                    onChange={(e) => updateField("evolutionApiUrl", e.target.value)}
                    placeholder="https://evolution.example.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Evolution API Key</label>
                  <input
                    type="password"
                    value={config.evolutionApiKey}
                    onChange={(e) => updateField("evolutionApiKey", e.target.value)}
                    placeholder="Sua API key"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Instância</label>
                  <input
                    type="text"
                    value={config.instanceName}
                    onChange={(e) => updateField("instanceName", e.target.value)}
                    placeholder="bgpgo-whatsapp"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL Base</label>
                  <input
                    type="text"
                    value={config.baseUrl}
                    onChange={(e) => updateField("baseUrl", e.target.value)}
                    placeholder="https://api.bgpgo.com"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link de Reunião</label>
                  <input
                    type="text"
                    value={config.meetingLink}
                    onChange={(e) => updateField("meetingLink", e.target.value)}
                    placeholder="https://meet.google.com/xxx"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                  <input
                    type="password"
                    value={config.openaiApiKey}
                    onChange={(e) => updateField("openaiApiKey", e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de Boas-vindas</label>
                <textarea
                  value={config.welcomeMessage}
                  onChange={(e) => updateField("welcomeMessage", e.target.value)}
                  placeholder="Olá! Bem-vindo à BGPGO..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prompt do Sistema</label>
                <textarea
                  value={config.botSystemPrompt}
                  onChange={(e) => updateField("botSystemPrompt", e.target.value)}
                  placeholder="Você é um assistente de vendas da BGPGO..."
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
                {saving ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
