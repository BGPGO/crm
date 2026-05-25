"use client";

import { useEffect, useState } from "react";
import { Loader2, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api";

type MetaCapiConfig = {
  id: string;
  brand: "BGP" | "AIMO";
  pixelId: string;
  accessToken: string; // mascarado
  hasAccessToken: boolean;
  testEventCode: string;
  eventName: string;
  isActive: boolean;
};

type Feedback = { type: "success" | "error"; text: string } | null;

const EVENT_OPTIONS = [
  { value: "Purchase", label: "Purchase (compra/venda fechada)" },
  { value: "Lead", label: "Lead" },
  { value: "Lead_Qualificado", label: "Lead_Qualificado" },
  { value: "CompleteRegistration", label: "CompleteRegistration" },
  { value: "Subscribe", label: "Subscribe" },
  { value: "custom", label: "Custom (digitar)" },
];

export default function MetaCapiPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenMasked, setAccessTokenMasked] = useState("");
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");
  const [eventNameSelect, setEventNameSelect] = useState("Purchase");
  const [eventNameCustom, setEventNameCustom] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Test event card
  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testValue, setTestValue] = useState("100");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; payload: unknown } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ data: MetaCapiConfig }>("/meta-capi/config");
      const c = res.data;
      setPixelId(c.pixelId);
      setAccessToken("");
      setAccessTokenMasked(c.accessToken);
      setHasAccessToken(c.hasAccessToken);
      setTestEventCode(c.testEventCode);
      setIsActive(c.isActive);
      // se eventName não está nas opções, vira "custom"
      const known = EVENT_OPTIONS.some((o) => o.value === c.eventName);
      if (known && c.eventName !== "custom") {
        setEventNameSelect(c.eventName);
        setEventNameCustom("");
      } else {
        setEventNameSelect("custom");
        setEventNameCustom(c.eventName);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao carregar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setLoading(false);
    }
  }

  function resolveEventName(): string {
    if (eventNameSelect === "custom") return eventNameCustom.trim() || "Purchase";
    return eventNameSelect;
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {
        pixelId: pixelId.trim(),
        testEventCode: testEventCode.trim(),
        eventName: resolveEventName(),
        isActive,
      };
      // só envia accessToken se o usuário digitou algo novo
      if (accessToken.trim()) {
        body.accessToken = accessToken.trim();
      }
      await api.put("/meta-capi/config", body);
      setAccessToken("");
      setFeedback({ type: "success", text: "Configuração salva." });
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<{ data: unknown }>("/meta-capi/test-event", {
        email: testEmail.trim() || undefined,
        phone: testPhone.trim() || undefined,
        value: testValue.trim() ? Number(testValue) : undefined,
        eventName: resolveEventName(),
      });
      setTestResult({ ok: true, payload: res.data });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Erro ao disparar teste.";
      setTestResult({ ok: false, payload: { error: msg } });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Meta Conversions API" breadcrumb={["Configurações", "Meta CAPI"]} />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Activity size={22} className="text-blue-600" />
            Meta Conversions API
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Envia eventos server-side ao Meta Pixel quando uma negociação é marcada como ganha.
            Permite atribuição correta mesmo com bloqueio de cookies/iOS.
          </p>
        </div>

        {loading ? (
          <Card padding="lg">
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          </Card>
        ) : (
          <>
            <Card padding="lg">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Credenciais da Meta</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Pixel ID"
                  placeholder="123456789012345"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                />
                <div>
                  <Input
                    label={hasAccessToken ? `Access Token (atual: ${accessTokenMasked})` : "Access Token"}
                    type="password"
                    placeholder={hasAccessToken ? "Deixe em branco para manter o atual" : "EAAB..."}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Gere em Events Manager → Configurações → Conversions API → Generate Access Token.
                  </p>
                </div>
                <Input
                  label="Test Event Code (opcional)"
                  placeholder="TEST12345"
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                />
                <Select
                  label="Evento enviado"
                  options={EVENT_OPTIONS}
                  value={eventNameSelect}
                  onChange={(e) => setEventNameSelect(e.target.value)}
                />
                {eventNameSelect === "custom" && (
                  <Input
                    label="Nome do evento customizado"
                    placeholder="MeuEventoCustom"
                    value={eventNameCustom}
                    onChange={(e) => setEventNameCustom(e.target.value)}
                  />
                )}
                <div className="flex items-center gap-2 pt-6">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Ativo (enviar eventos automaticamente)</span>
                  </label>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-3">
                {feedback && (
                  <span className={feedback.type === "success" ? "text-xs text-green-600" : "text-xs text-red-600"}>
                    {feedback.text}
                  </span>
                )}
                <Button variant="primary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Salvar
                </Button>
              </div>
            </Card>

            <Card padding="lg">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Enviar evento de teste</h2>
              <p className="text-xs text-gray-500 mb-4">
                Dispara um evento manual usando as credenciais salvas. Use o Test Event Code para ver
                o resultado em tempo real no Events Manager (aba “Testar eventos”).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="E-mail"
                  type="email"
                  placeholder="cliente@exemplo.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <Input
                  label="Telefone (com DDI)"
                  placeholder="5511999999999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <Input
                  label="Valor (BRL)"
                  type="number"
                  step="0.01"
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button variant="primary" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Disparar teste
                </Button>
              </div>

              {testResult && (
                <div
                  className={`mt-4 rounded-md border p-3 text-xs ${
                    testResult.ok
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium mb-1">
                    {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {testResult.ok ? "Evento enviado" : "Falha no envio"}
                  </div>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(testResult.payload, null, 2)}
                  </pre>
                </div>
              )}
            </Card>

            <Card padding="lg">
              <h2 className="text-sm font-semibold text-gray-900 mb-2">Como funciona</h2>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                <li>Quando um Deal vira <strong>Ganho</strong>, o CRM dispara o evento configurado para o Meta Pixel.</li>
                <li>Dados do contato (email, telefone, nome, id) vão hasheados com SHA-256.</li>
                <li>IP, User-Agent, <code>_fbp</code> e <code>_fbc</code> são lidos do <em>LeadTracking</em> do contato (capturados na LP via webhook).</li>
                <li>Para evitar dupla contagem com o pixel do navegador, use o mesmo <code>event_id</code> (gerado como <code>deal_&lt;id&gt;_&lt;timestamp&gt;</code>).</li>
                <li>O envio é fire-and-forget: falha do CAPI não bloqueia a marcação do deal.</li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
