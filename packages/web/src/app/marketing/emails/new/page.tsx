"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import AudienceSelector from "@/components/marketing/AudienceSelector";
import EmailPreview from "@/components/marketing/EmailPreview";
import EmailBuilderCanvas from "@/components/marketing/email-builder/EmailBuilderCanvas";
import PropertiesPanel from "@/components/marketing/email-builder/PropertiesPanel";
import SectionPalette from "@/components/marketing/email-builder/SectionPalette";
import { useEmailBuilder } from "@/components/marketing/email-builder/hooks/useEmailBuilder";
import { renderEmailHtml } from "@/components/marketing/email-builder/renderer/emailHtmlRenderer";
import type { SectionType, EmailSection, EmailDocument } from "@/types/email-builder";
import { createDefaultSection } from "@/components/marketing/email-builder/AddSectionButton";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Clock,
  FolderOpen,
  Save,
  X,
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

function NewCampaignPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplateId = searchParams.get("templateId");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  // Step 2 - Email Builder (modular)
  const builder = useEmailBuilder();
  const {
    sections,
    globalStyle,
    selectedSection,
    compiledHtml,
    addSection,
    removeSection,
    moveSection,
    duplicateSection,
    updateSection,
    selectSection,
    updateGlobalStyle,
    setDocument,
  } = builder;

  // Step 1 - Basic
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("Vítor Bertuzzi");
  const [fromEmail, setFromEmail] = useState("vitor@bertuzzipatrimonial.app.br");

  // Error states
  const [sendError, setSendError] = useState<string | null>(null);

  // "Carregar template salvo" modal
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadTemplateModalOpen, setLoadTemplateModalOpen] = useState(false);
  const [loadTemplateError, setLoadTemplateError] = useState<string | null>(null);

  // "Salvar como template" modal
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateSuccess, setSaveTemplateSuccess] = useState(false);

  // Step 3 - Audience
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Team copy
  const [sendTeamCopy, setSendTeamCopy] = useState(true);

  // Schedule
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduleInput, setShowScheduleInput] = useState(false);

  // Handle section add from palette
  const handleAddSection = useCallback(
    (type: SectionType, atIndex?: number) => {
      const defaultSection = createDefaultSection(type);
      addSection(defaultSection, atIndex);
    },
    [addSection]
  );

  const handleAddPrebuilt = useCallback(
    (prebuiltSections: EmailSection[]) => {
      for (const s of prebuiltSections) {
        addSection(s);
      }
    },
    [addSection]
  );

  // Load templates lazily — only when modal opens
  const openLoadTemplateModal = useCallback(async () => {
    setLoadTemplateModalOpen(true);
    if (templates.length > 0) return;
    setLoadingTemplates(true);
    setLoadTemplateError(null);
    try {
      const result = await api.get<TemplatesResponse>("/email-templates");
      setTemplates(result.data);
    } catch (err) {
      console.error("Erro ao buscar templates:", err);
      setLoadTemplateError("Falha ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [templates.length]);

  // Handle preselected template from URL param on mount
  useEffect(() => {
    if (!preselectedTemplateId) return;
    (async () => {
      try {
        const result = await api.get<TemplatesResponse>("/email-templates");
        setTemplates(result.data);
        const found = result.data.find((t: EmailTemplate) => t.id === preselectedTemplateId);
        if (found) {
          loadTemplateIntoBuilder(found);
          if (!subject) setSubject(found.subject);
          if (!name) setName(`Campanha - ${found.name}`);
        }
      } catch {
        // silent
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadTemplateIntoBuilder(tpl: EmailTemplate) {
    const withJson = tpl as unknown as { jsonContent?: string } & EmailTemplate;
    if (withJson.jsonContent) {
      try {
        const doc: EmailDocument = JSON.parse(withJson.jsonContent);
        if (doc.sections && doc.globalStyle) {
          setDocument(doc);
          setLoadTemplateModalOpen(false);
          return;
        }
      } catch {
        // fall through
      }
    }
    // No structured JSON — wrap raw HTML in a single text section
    setDocument({
      sections: [
        {
          id: crypto.randomUUID(),
          type: "text",
          style: {},
          data: { type: "text", html: tpl.htmlContent },
        },
      ],
      globalStyle: { ...builder.globalStyle },
    });
    setLoadTemplateModalOpen(false);
  }

  async function handleSaveAsTemplate() {
    if (!saveTemplateName.trim() || sections.length === 0) return;
    setSavingTemplate(true);
    try {
      const html = renderEmailHtml({ sections, globalStyle });
      await api.post("/email-templates", {
        name: saveTemplateName.trim(),
        subject: subject.trim() || saveTemplateName.trim(),
        htmlContent: html,
        jsonContent: JSON.stringify({ sections, globalStyle }),
      });
      setSaveTemplateSuccess(true);
      setTimeout(() => {
        setSaveTemplateModalOpen(false);
        setSaveTemplateName("");
        setSaveTemplateSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    } finally {
      setSavingTemplate(false);
    }
  }

  const getHtmlContent = (): string => compiledHtml;

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!(name.trim() && subject.trim() && fromName.trim() && fromEmail.trim());
      case 1:
        return sections.length > 0;
      case 2:
        return true;
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
        segmentId: selectedSegmentId,
      });
      await api.post(`/email-campaigns/${campaign.data.id}/send`, { sendTeamCopy });
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
                onClick={() => { if (i < step) setStep(i); }}
                disabled={i > step}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step
                    ? "bg-blue-600 text-white"
                    : i < step
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? <Check size={12} /> : <span>{i + 1}</span>}
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

          {/* Step 2: Email Builder */}
          {step === 1 && (
            <div className="space-y-0 -mx-6 -mt-6 -mb-6">
              {/* Toolbar */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-900">Conteúdo do Email</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openLoadTemplateModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <FolderOpen size={13} />
                    Carregar template salvo
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSaveTemplateName(""); setSaveTemplateSuccess(false); setSaveTemplateModalOpen(true); }}
                    disabled={sections.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Save size={13} />
                    Salvar como template
                  </button>
                </div>
              </div>

              {/* Editor — palette | canvas | properties */}
              <div className="flex overflow-hidden" style={{ height: "calc(100vh - 320px)", minHeight: 520 }}>
                {/* Left: section palette */}
                <SectionPalette
                  onAddSection={(type) => handleAddSection(type)}
                  onAddPrebuilt={handleAddPrebuilt}
                />

                {/* Center: canvas */}
                <EmailBuilderCanvas
                  sections={sections}
                  selectedSectionId={builder.selectedSectionId}
                  globalStyle={globalStyle}
                  onSelectSection={selectSection}
                  onUpdateSection={updateSection}
                  onRemoveSection={removeSection}
                  onDuplicateSection={duplicateSection}
                  onMoveSection={moveSection}
                  onAddSection={handleAddSection}
                />

                {/* Right: properties */}
                <div className="w-[300px] shrink-0 overflow-y-auto">
                  <PropertiesPanel
                    section={selectedSection}
                    globalStyle={globalStyle}
                    onUpdateSection={(data, style) =>
                      selectedSection
                        ? updateSection(selectedSection.id, data, style)
                        : undefined
                    }
                    onUpdateGlobalStyle={updateGlobalStyle}
                  />
                </div>
              </div>
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
                        Email
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {sections.length > 0
                          ? `${sections.length} ${sections.length === 1 ? "seção" : "seções"}`
                          : "\u2014"}
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

                  {/* Team copy toggle */}
                  <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Enviar cópia para o time</p>
                      <p className="text-xs text-gray-500">TIME BGP recebe uma cópia com [TIME] no assunto</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sendTeamCopy}
                      onClick={() => setSendTeamCopy(!sendTeamCopy)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        sendTeamCopy ? "bg-blue-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          sendTeamCopy ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
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
                    branded
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

      {/* Modals — rendered at the end of the tree */}

      {/* Load saved template modal */}
      {loadTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Carregar template salvo</h3>
              <button
                type="button"
                onClick={() => setLoadTemplateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadTemplateError && (
                <p className="text-sm text-red-600 mb-3">{loadTemplateError}</p>
              )}
              {loadingTemplates ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Nenhum template salvo ainda.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => loadTemplateIntoBuilder(tpl)}
                      className="text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <div className="h-16 bg-gray-100 rounded mb-2 overflow-hidden">
                        {tpl.htmlContent ? (
                          <iframe
                            srcDoc={tpl.htmlContent}
                            sandbox=""
                            className="w-full h-full pointer-events-none"
                            title={tpl.name}
                            tabIndex={-1}
                          />
                        ) : null}
                      </div>
                      <p className="text-xs font-medium text-gray-800 truncate">{tpl.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{tpl.subject}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save as template modal */}
      {saveTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Salvar como template</h3>
              <button
                type="button"
                onClick={() => setSaveTemplateModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {saveTemplateSuccess ? (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <Check size={16} />
                  Template salvo com sucesso!
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do template
                    </label>
                    <input
                      type="text"
                      value={saveTemplateName}
                      onChange={(e) => setSaveTemplateName(e.target.value)}
                      placeholder="Ex: Newsletter BGP Março"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setSaveTemplateModalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={savingTemplate}
                      disabled={!saveTemplateName.trim()}
                      onClick={handleSaveAsTemplate}
                    >
                      <Save size={13} />
                      Salvar
                    </Button>
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

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Carregando...</div>}>
      <NewCampaignPageInner />
    </Suspense>
  );
}
