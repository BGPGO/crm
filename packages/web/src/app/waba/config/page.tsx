"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  Loader2,
  Save,
  Phone,
  Shield,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  MessageSquare,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WabaConfig {
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  verifyToken: string | null;
  webhookUrl: string | null;
  displayPhone: string | null;
  dailyMessageLimit: number;
  isActive: boolean;
}

interface WabaStatus {
  configured: boolean;
  isActive: boolean;
  phone: {
    displayPhone: string | null;
    qualityRating: string | null;
    status: string | null;
    messagingTier: string | null;
  } | null;
  today: {
    messagesSent: number;
    dailyLimit: number;
    remaining: number;
  };
  templates: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={clsx("animate-spin text-gray-400", className)} />;
}

function mask(value: string | null): string {
  if (!value) return "---";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function qualityColor(rating: string | null): "green" | "yellow" | "red" | "gray" {
  switch (rating?.toUpperCase()) {
    case "GREEN": return "green";
    case "YELLOW": return "yellow";
    case "RED": return "red";
    default: return "gray";
  }
}

function connectionVariant(status: string | null, configured: boolean): { label: string; variant: "green" | "yellow" | "red" | "gray" } {
  if (!configured) return { label: "Nao configurado", variant: "gray" };
  switch (status?.toUpperCase()) {
    case "CONNECTED": return { label: "Conectado", variant: "green" };
    case "PENDING_SETUP": return { label: "Pendente", variant: "yellow" };
    case "OFFLINE": return { label: "Offline", variant: "red" };
    default: return { label: status || "Desconhecido", variant: "yellow" };
  }
}

// ---------------------------------------------------------------------------
// Status Card
// ---------------------------------------------------------------------------

function StatusCard({
  status,
  loading,
  onRefresh,
}: {
  status: WabaStatus | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading || !status) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-6">
          <Spinner />
        </div>
      </Card>
    );
  }

  const conn = connectionVariant(status.phone?.status ?? null, status.configured);
  const quality = status.phone?.qualityRating ?? null;
  const tier = status.phone?.messagingTier ?? "---";
  const { messagesSent, dailyLimit, remaining } = status.today;
  const usagePct = dailyLimit > 0 ? Math.min((messagesSent / dailyLimit) * 100, 100) : 0;

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Status do Canal</h2>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw size={14} />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Phone */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Phone size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Telefone</p>
            <p className="text-sm font-medium text-gray-900">
              {status.phone?.displayPhone || "Nao configurado"}
            </p>
          </div>
        </div>

        {/* Connection */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            conn.variant === "green" ? "bg-green-50 text-green-600" :
            conn.variant === "yellow" ? "bg-yellow-50 text-yellow-600" :
            conn.variant === "red" ? "bg-red-50 text-red-600" :
            "bg-gray-50 text-gray-400"
          )}>
            {conn.variant === "green" ? <Wifi size={18} /> : <WifiOff size={18} />}
          </div>
          <div>
            <p className="text-xs text-gray-500">Conexao</p>
            <Badge variant={conn.variant}>{conn.label}</Badge>
          </div>
        </div>

        {/* Quality */}
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            qualityColor(quality) === "green" ? "bg-green-50 text-green-600" :
            qualityColor(quality) === "yellow" ? "bg-yellow-50 text-yellow-600" :
            qualityColor(quality) === "red" ? "bg-red-50 text-red-600" :
            "bg-gray-50 text-gray-400"
          )}>
            <Shield size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Qualidade</p>
            <Badge variant={qualityColor(quality)}>
              {quality || "---"}
            </Badge>
          </div>
        </div>

        {/* Tier */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Zap size={18} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Tier</p>
            <p className="text-sm font-medium text-gray-900">{tier}</p>
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">Uso hoje</p>
          <p className="text-xs text-gray-500">
            {messagesSent}/{dailyLimit} enviados &middot; {remaining} restantes
          </p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className={clsx(
              "h-2.5 rounded-full transition-all duration-300",
              usagePct > 90 ? "bg-red-500" : usagePct > 70 ? "bg-yellow-500" : "bg-blue-500"
            )}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Credentials Form
// ---------------------------------------------------------------------------

function CredentialsForm({
  config,
  onSaved,
}: {
  config: WabaConfig | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    accessToken: "",
    appSecret: "",
    verifyToken: "",
    displayPhone: "",
    dailyMessageLimit: 250,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        accessToken: config.accessToken || "",
        appSecret: config.appSecret || "",
        verifyToken: config.verifyToken || "",
        displayPhone: config.displayPhone || "",
        dailyMessageLimit: config.dailyMessageLimit || 250,
      });
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.put("/whatsapp/cloud/config", form);
      setFeedback({ type: "success", text: "Configuracao salva com sucesso!" });
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Credenciais</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Read-only fields */}
        <Input
          label="Phone Number ID"
          value={mask(config?.phoneNumberId ?? null)}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />
        <Input
          label="WABA ID"
          value={mask(config?.wabaId ?? null)}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />

        {/* Access Token */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Access Token</label>
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              value={form.accessToken}
              onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-10"
              placeholder="EAA..."
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* App Secret */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">App Secret</label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              value={form.appSecret}
              onChange={(e) => setForm((f) => ({ ...f, appSecret: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white pr-10"
              placeholder="****"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Verify Token */}
        <Input
          label="Verify Token"
          value={form.verifyToken}
          onChange={(e) => setForm((f) => ({ ...f, verifyToken: e.target.value }))}
          placeholder="Token de verificacao do webhook"
        />

        {/* Webhook URL */}
        <Input
          label="Webhook URL"
          value={config?.webhookUrl || "Nao configurado"}
          readOnly
          className="bg-gray-50 cursor-not-allowed"
        />

        {/* Display Phone */}
        <Input
          label="Telefone de Exibicao"
          value={form.displayPhone}
          onChange={(e) => setForm((f) => ({ ...f, displayPhone: e.target.value }))}
          placeholder="+55 11 99999-9999"
        />

        {/* Daily Limit */}
        <Input
          label="Limite Diario de Mensagens"
          type="number"
          value={String(form.dailyMessageLimit)}
          onChange={(e) =>
            setForm((f) => ({ ...f, dailyMessageLimit: parseInt(e.target.value) || 0 }))
          }
          placeholder="250"
        />
      </div>

      <div className="flex items-center justify-between mt-5">
        {feedback && (
          <span
            className={clsx(
              "text-xs",
              feedback.type === "success" ? "text-green-600" : "text-red-600"
            )}
          >
            {feedback.text}
          </span>
        )}
        <div className="ml-auto">
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} />
            Salvar
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active Channel Toggle
// ---------------------------------------------------------------------------

function ChannelToggle({
  isActive,
  onToggle,
}: {
  isActive: boolean;
  onToggle: (active: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    const next = !isActive;
    if (
      next &&
      !confirm(
        "Ativar a Cloud API direcionara todas as novas mensagens pela API oficial da Meta. Deseja continuar?"
      )
    ) {
      return;
    }
    setToggling(true);
    try {
      await api.put("/whatsapp/cloud/config", { isActive: next });
      onToggle(next);
    } finally {
      setToggling(false);
    }
  };

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isActive ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"
            )}
          >
            <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Canal ativo: {isActive ? "Cloud API" : "Z-API"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
              {isActive
                ? "Todas as mensagens estao sendo enviadas pela API oficial da Meta."
                : "Ative para direcionar novas mensagens pela Cloud API oficial."}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={toggling}
          className={clsx(
            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50",
            isActive ? "bg-green-500" : "bg-gray-300"
          )}
        >
          <span
            className={clsx(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              isActive ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {!isActive && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
          <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">
            A Cloud API nao esta ativa. As mensagens continuam sendo enviadas pela Z-API.
            Ative para migrar para a API oficial da Meta.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WabaConfigPage() {
  const [config, setConfig] = useState<WabaConfig | null>(null);
  const [status, setStatus] = useState<WabaStatus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const res = await api.get<{ data: WabaConfig }>("/whatsapp/cloud/config");
      setConfig(res.data);
    } catch {
      setError("Erro ao carregar configuracao.");
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await api.get<{ data: WabaStatus }>("/whatsapp/cloud/config/status");
      setStatus(res.data);
    } catch {
      // Status might not be available if not configured — not critical
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchStatus();
  }, [fetchConfig, fetchStatus]);

  const handleSaved = () => {
    fetchConfig();
    fetchStatus();
  };

  const handleToggle = (active: boolean) => {
    setConfig((c) => (c ? { ...c, isActive: active } : c));
    setStatus((s) => (s ? { ...s, isActive: active } : s));
  };

  if (loadingConfig && loadingStatus) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="p-6">
        <Card padding="lg">
          <div className="text-center py-8">
            <AlertTriangle size={40} className="mx-auto text-red-300 mb-3" />
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={fetchConfig}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto flex-1">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuracao Cloud API</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gerencie credenciais e status do canal WhatsApp Business API
        </p>
      </div>

      <StatusCard
        status={status}
        loading={loadingStatus}
        onRefresh={fetchStatus}
      />

      <ChannelToggle
        isActive={config?.isActive ?? false}
        onToggle={handleToggle}
      />

      <CredentialsForm config={config} onSaved={handleSaved} />
    </div>
  );
}
