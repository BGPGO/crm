"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import AudienceSelector from "@/components/marketing/AudienceSelector";
import EmailPreview from "@/components/marketing/EmailPreview";
import AIEmailGenerator from "@/components/marketing/AIEmailGenerator";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
}

interface TemplatesResponse {
  data: EmailTemplate[];
}

const STEPS = [
  { key: "basico", label: "Básico" },
  { key: "template", label: "Template" },
  { key: "audiencia", label: "Audiência" },
  { key: "revisar", label: "Revisar" },
] as const;

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Step 1 - Basic
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");

  // Error states
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Step 2 - Template
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [useCustomHtml, setUseCustomHtml] = useState(false);
  const [customHtml, setCustomHtml] = useState("");

  // Step 3 - Audience
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null
  );

  // Schedule
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduleInput, setShowScheduleInput] = useState(false);

  useEffect(() => {
    async function fetchTemplates() {
      setLoadingTemplates(true);
      setTemplateError(null);
      try {
        const result = await api.get<TemplatesResponse>("/email-templates");
        setTemplates(result.data);
      } catch (err) {
        console.error("Erro ao buscar templates:", err);
        setTemplateError("Falha ao carregar templates. Verifique sua conexão e tente novamente.");
      } finally {
        setLoadingTemplates(false);
      }
    }
    fetchTemplates();
  }, []);

  const getHtmlContent = (): string => {
    if (useCustomHtml) return customHtml;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    return tpl?.htmlContent || "";
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!(name.trim() && subject.trim() && fromName.trim() && fromEmail.trim());
      case 1:
        return useCustomHtml ? !!customHtml.trim() : !!selectedTemplateId;
      case 2:
        return true; // null means "all contacts" which is valid
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleSendNow = async () => {
    setSaving(true);
    setSendError(null);
    try {
      const campaign = await api.post<{ data: { id: string } }>("/email-campaigns", {
        name: name.trim(),
        subject: subject.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        htmlContent: getHtmlContent(),
        templateId: useCustomHtml ? undefined : selectedTemplateId,
        segmentId: selectedSegmentId,
      });
      await api.post(`/email-campaigns/${campaign.data.id}/send`, {});
      router.push(`/marketing/emails/${campaign.data.id}`);
    } catch (err) {
      console.error("Erro ao enviar campanha:", err);
      setSendError("Falha ao enviar campanha. Verifique os dados e tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate) return;
    setScheduling(true);
    setSendError(null);
    try {
      const campaign = await api.post<{ data: { id: string } }>("/email-campaigns", {
        name: name.trim(),
        subject: subject.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        htmlContent: getHtmlContent(),
        templateId: useCustomHtml ? undefined : selectedTemplateId,
        segmentId: selectedSegmentId,
      });
      await api.post(`/email-campaigns/${campaign.data.id}/schedule`, {
        scheduledAt: new Date(scheduleDate).toISOString(),
      });
      router.push(`/marketing/emails/${campaign.data.id}`);
    } catch (err) {
      console.error("Erro ao agendar campanha:", err);
      setSendError("Falha ao agendar campanha. Verifique os dados e tente novamente.");
    } finally {
      setScheduling(false);
    }
  };

  const handleAIGenerate = (result: {
    subject: string;
    htmlContent: string;
  }) => {
    setSubject(result.subject);
    setUseCustomHtml(true);
    setCustomHtml(result.htmlContent);
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Nova Campanha de Email"
        breadcrumb={["Marketing", "Emails", "Nova Campanha"]}
      />
      <MarketingNav />

      <main className="flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step
                    ? "bg-blue-600 text-white"
                    : i < step
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? (
                  <Check size={12} />
                ) : (
                  <span>{i + 1}</span>
                )}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px bg-gray-200" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card padding="lg">
          {/* Step 1: Basic */}
          {step === 0 && (
            <div className="space-y-4 max-w-lg">
              <h2 className="text-base font-semibold text-gray-900">
                Informações Básicas
              </h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da campanha
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Newsletter Março 2026"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assunto do email
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Novidades incríveis para você"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do remetente
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Ex: BGPGO"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email do remetente
                  </label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="Ex: contato@bgpgo.com"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Template */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Conteúdo do Email
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAiModalOpen(true)}
                >
                  <Sparkles size={14} />
                  Gerar com IA
                </Button>
              </div>

              {/* Toggle */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setUseCustomHtml(false)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    !useCustomHtml
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Usar Template
                </button>
                <button
                  onClick={() => setUseCustomHtml(true)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    useCustomHtml
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  HTML Personalizado
                </button>
              </div>

              {templateError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {templateError}
                </div>
              )}

              {!useCustomHtml ? (
                <div>
                  {loadingTemplates ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-32 bg-gray-100 rounded-lg animate-pulse"
                        />
                      ))}
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      Nenhum template encontrado. Crie um template ou use HTML
                      personalizado.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`text-left p-4 rounded-lg border-2 transition-colors ${
                            selectedTemplateId === tpl.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="h-16 bg-gray-100 rounded mb-3 flex items-center justify-center text-gray-300 text-xs overflow-hidden">
                            {tpl.htmlContent ? (
                              <iframe
                                srcDoc={tpl.htmlContent}
                                sandbox=""
                                className="w-full h-full pointer-events-none"
                                title={tpl.name}
                                tabIndex={-1}
                              />
                            ) : (
                              "Sem preview"
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {tpl.name}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {tpl.subject}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      HTML do email
                    </label>
                    <textarea
                      value={customHtml}
                      onChange={(e) => setCustomHtml(e.target.value)}
                      placeholder="<html>...</html>"
                      rows={16}
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preview
                    </label>
                    <EmailPreview
                      html={customHtml || "<p style='color:#999;text-align:center;padding:40px;'>Digite o HTML para ver o preview</p>"}
                      className="h-[400px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Audience */}
          {step === 2 && (
            <div className="space-y-4 max-w-lg">
              <h2 className="text-base font-semibold text-gray-900">
                Selecionar Audiência
              </h2>
              <p className="text-sm text-gray-500">
                Escolha para quem a campanha será enviada.
              </p>
              <AudienceSelector
                selectedSegmentId={selectedSegmentId}
                onChange={setSelectedSegmentId}
              />
            </div>
          )}

          {/* Step 4: Review */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-gray-900">
                Revisar Campanha
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Summary */}
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Nome da Campanha
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">{name}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Assunto
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">{subject}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Remetente
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {fromName} &lt;{fromEmail}&gt;
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Template
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {useCustomHtml
                          ? "HTML Personalizado"
                          : templates.find((t) => t.id === selectedTemplateId)
                              ?.name || "\u2014"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Audiência
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {selectedSegmentId
                          ? "Segmento selecionado"
                          : "Todos os contatos"}
                      </p>
                    </div>
                  </div>

                  {/* Send/Schedule Error */}
                  {sendError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                      {sendError}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    {!showScheduleInput ? (
                      <div className="flex items-center gap-3">
                        <Button
                          variant="primary"
                          size="md"
                          loading={saving}
                          onClick={handleSendNow}
                        >
                          <Send size={14} />
                          Enviar Agora
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => setShowScheduleInput(true)}
                        >
                          <Clock size={14} />
                          Agendar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Data e hora do envio
                          </label>
                          <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="primary"
                            size="md"
                            loading={scheduling}
                            disabled={!scheduleDate}
                            onClick={handleSchedule}
                          >
                            <Clock size={14} />
                            Confirmar Agendamento
                          </Button>
                          <Button
                            variant="ghost"
                            size="md"
                            onClick={() => setShowScheduleInput(false)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                    Preview
                  </p>
                  <EmailPreview
                    html={getHtmlContent() || "<p style='color:#999;text-align:center;padding:40px;'>Sem conteúdo</p>"}
                    className="h-[450px]"
                  />
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Navigation */}
        {step < 3 && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
            >
              <ArrowLeft size={14} />
              Voltar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              Próximo
              <ArrowRight size={14} />
            </Button>
          </div>
        )}

        {step === 3 && (
          <div className="flex items-center justify-start">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={14} />
              Voltar
            </Button>
          </div>
        )}
      </main>

      {/* AI Modal */}
      <AIEmailGenerator
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerate={handleAIGenerate}
      />
    </div>
  );
}
