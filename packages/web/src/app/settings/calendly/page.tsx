"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import { Save, Link2, Calendar, ArrowLeft, Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";

interface CalendlyConfig {
  id: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  organizationUri: string;
}

interface CalendlyEvent {
  id: string;
  calendlyEventId: string;
  eventType: string;
  inviteeEmail: string;
  inviteeName: string | null;
  hostEmail: string | null;
  hostName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  dealId: string | null;
  contact: { id: string; name: string; email: string | null } | null;
  createdAt: string;
}

const defaultConfig: CalendlyConfig = {
  id: "",
  apiKey: "",
  webhookSecret: "",
  isActive: true,
  organizationUri: "",
};

export default function CalendlySettingsPage() {
  const [config, setConfig] = useState<CalendlyConfig>(defaultConfig);
  const [events, setEvents] = useState<CalendlyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");

  // Editable fields (apiKey comes masked from API, so we track "real" input)
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [webhookSecretInput, setWebhookSecretInput] = useState("");
  const [organizationUriInput, setOrganizationUriInput] = useState("");
  const [isActiveInput, setIsActiveInput] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CalendlyConfig }>("/calendly/config");
      if (res.data) {
        setConfig(res.data);
        setApiKeyInput(""); // Don't prefill masked key
        setWebhookSecretInput(res.data.webhookSecret || "");
        setOrganizationUriInput(res.data.organizationUri || "");
        setIsActiveInput(res.data.isActive);
      }
    } catch {
      // Config might not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await api.get<{ data: CalendlyEvent[] }>("/calendly/config/events?limit=20");
      setEvents(res.data || []);
    } catch {
      // ignore
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchEvents();
  }, [fetchConfig, fetchEvents]);

  useEffect(() => {
    // Default callback URL based on current origin
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/api/calendly/webhook`);
    }
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        isActive: isActiveInput,
        organizationUri: organizationUriInput,
      };
      // Only send apiKey/secret if user typed a new one
      if (apiKeyInput) body.apiKey = apiKeyInput;
      if (webhookSecretInput) body.webhookSecret = webhookSecretInput;

      await api.put("/calendly/config", body);
      setSuccess("Configuração salva com sucesso!");
      setApiKeyInput("");
      fetchConfig();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSubscribe = async () => {
    setSubscribing(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/calendly/config/subscribe", { callbackUrl });
      setSuccess("Webhook registrado no Calendly com sucesso!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao registrar webhook");
    } finally {
      setSubscribing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString("pt-BR");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Integração Calendly" />

      <main className="flex-1 p-6 space-y-6 mx-auto max-w-5xl w-full">
        {/* Back link */}
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} />
          Voltar para Configurações
        </Link>

        {/* Status Banner */}
        <Card>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Calendar size={24} className="text-blue-600" />
              <div>
                <h3 className="font-semibold text-gray-900">Calendly</h3>
                <p className="text-sm text-gray-500">
                  Quando um lead agenda uma reunião, a negociação move automaticamente para &quot;Reunião Marcada&quot;
                </p>
              </div>
            </div>
            <Badge variant={isActiveInput ? "green" : "gray"}>
              {isActiveInput ? "Ativa" : "Inativa"}
            </Badge>
          </div>
        </Card>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <XCircle size={16} />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle size={16} />
            {success}
          </div>
        )}

        {/* Config Form */}
        <Card>
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Configuração</h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key do Calendly
                  </label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      placeholder={config.apiKey || "Cole sua API key aqui"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Obtenha em: Calendly &rarr; Integrations &rarr; API &amp; Webhooks
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret (opcional)
                  </label>
                  <div className="relative">
                    <Input
                      type={showSecret ? "text" : "password"}
                      placeholder="Signing key para validar webhooks"
                      value={webhookSecretInput}
                      onChange={(e) => setWebhookSecretInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organization URI
                  </label>
                  <Input
                    placeholder="https://api.calendly.com/organizations/..."
                    value={organizationUriInput}
                    onChange={(e) => setOrganizationUriInput(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Use a API do Calendly (GET /users/me) para encontrar sua organization URI
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="calendly-active"
                    checked={isActiveInput}
                    onChange={(e) => setIsActiveInput(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="calendly-active" className="text-sm text-gray-700">
                    Integração ativa
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Save size={16} className="mr-1" />}
                    Salvar Configuração
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Subscribe Webhook */}
        <Card>
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Registrar Webhook</h3>
            <p className="text-sm text-gray-500">
              Após salvar a API Key e Organization URI, registre o webhook para que o Calendly envie eventos automaticamente.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Callback URL
              </label>
              <Input
                placeholder="https://seu-dominio.com/api/calendly/webhook"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                URL pública que o Calendly vai chamar quando um evento for criado/cancelado
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSubscribe} disabled={subscribing} variant="secondary">
                {subscribing ? <Loader2 size={16} className="animate-spin mr-1" /> : <Link2 size={16} className="mr-1" />}
                Registrar Webhook no Calendly
              </Button>
            </div>
          </div>
        </Card>

        {/* Recent Events */}
        <Card>
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Eventos Recentes</h3>

            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">
                Nenhum evento recebido ainda. Configure o webhook acima e agende uma reunião no Calendly para testar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-4 font-medium">Data</th>
                      <th className="pb-2 pr-4 font-medium">Tipo</th>
                      <th className="pb-2 pr-4 font-medium">Invitado</th>
                      <th className="pb-2 pr-4 font-medium">Host</th>
                      <th className="pb-2 pr-4 font-medium">Contato CRM</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {formatDate(ev.startTime)}
                        </td>
                        <td className="py-2 pr-4">{ev.eventType}</td>
                        <td className="py-2 pr-4">
                          <div>{ev.inviteeName || "-"}</div>
                          <div className="text-xs text-gray-400">{ev.inviteeEmail}</div>
                        </td>
                        <td className="py-2 pr-4">
                          <div>{ev.hostName || "-"}</div>
                          <div className="text-xs text-gray-400">{ev.hostEmail || ""}</div>
                        </td>
                        <td className="py-2 pr-4">
                          {ev.contact ? (
                            <span className="text-blue-600">{ev.contact.name}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2">
                          <Badge
                            variant={ev.status === "active" ? "green" : "gray"}
                          >
                            {ev.status === "active" ? "Ativo" : "Cancelado"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
