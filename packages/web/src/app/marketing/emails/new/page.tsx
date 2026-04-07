"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import AudienceSelector from "@/components/marketing/AudienceSelector";
import EmailPreview from "@/components/marketing/EmailPreview";
import EmailDesignPanel, {
  DEFAULT_DESIGN,
  type EmailDesign,
} from "@/components/marketing/EmailDesignPanel";
import EmailContentPanel from "@/components/marketing/EmailContentPanel";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Clock,
  FolderOpen,
  Save,
  X,
  Sparkles,
  Loader2,
  Paintbrush,
  PenLine,
} from "lucide-react";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = "ai" | "design" | "content";

const EDITOR_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "ai", label: "IA", icon: Sparkles },
  { id: "design", label: "Design", icon: Paintbrush },
  { id: "content", label: "Conteúdo", icon: PenLine },
];

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  jsonContent?: string;
}

interface TemplatesResponse {
  data: EmailTemplate[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractImages(html: string): { src: string; index: number }[] {
  const imgs: { src: string; index: number }[] = [];
  const regex = /<img[^>]+src=["']([^"']*)["']/gi;
  let match;
  let i = 0;
  while ((match = regex.exec(html))) {
    imgs.push({ src: match[1], index: i++ });
  }
  return imgs;
}

function replaceImageSrc(html: string, oldSrc: string, newSrc: string): string {
  return html.replace(
    new RegExp(
      `(src=["'])${oldSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`,
      "g"
    ),
    `$1${newSrc}$2`
  );
}

function removeImageFromHtml(html: string, src: string): string {
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let result = html.replace(
    new RegExp(
      `<div[^>]*>\\s*<img[^>]*src=["']${escaped}["'][^>]*/?>\\s*</div>`,
      "gi"
    ),
    ""
  );
  result = result.replace(
    new RegExp(`<img[^>]*src=["']${escaped}["'][^>]*/?>`, "gi"),
    ""
  );
  return result;
}

function extractButtons(html: string): { text: string; href: string; index: number }[] {
  const buttons: { text: string; href: string; index: number }[] = [];
  const regex = /<a\s[^>]*href=["']([^"']*)["'][^>]*(?:data-cta|padding[^"]*background)[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let i = 0;
  while ((match = regex.exec(html))) {
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    buttons.push({ href: match[1], text, index: i++ });
  }
  return buttons;
}

function replaceButtonHref(html: string, oldHref: string, newHref: string): string {
  return html.replace(
    new RegExp(`(href=["'])${oldHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`, "g"),
    `$1${newHref}$2`
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "basico", label: "Básico" },
  { key: "template", label: "Template" },
  { key: "audiencia", label: "Audiência" },
  { key: "revisar", label: "Revisar" },
] as const;

// ── Main component ─────────────────────────────────────────────────────────────

function NewCampaignPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedTemplateId = searchParams.get("templateId");
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Step 1 — Basic info
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("Vítor Bertuzzi");
  const [fromEmail, setFromEmail] = useState("vitor@bertuzzipatrimonial.app.br");

  // Step 2 — AI Email Editor (same pattern as templates/[id]/page.tsx)
  const [htmlContent, setHtmlContent] = useState("");
  const [design, setDesign] = useState<EmailDesign>(DEFAULT_DESIGN);
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const previewRef = useRef<HTMLDivElement>(null);
  // editorInitialised: false = next htmlContent change will push to DOM; true = user is editing, don't reset
  const editorInitialised = useRef(false);

  // AI state
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("profissional");
  const [aiAudience, setAiAudience] = useState("clientes e leads do CRM");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Button editing (content tab)
  const [editingBtnIdx, setEditingBtnIdx] = useState<number | null>(null);
  const [editBtnHref, setEditBtnHref] = useState("");

  // Derived
  const hasContent = htmlContent.trim().length > 20;
  const buttons = useMemo(() => extractButtons(htmlContent), [htmlContent]);
  const images = useMemo(() => extractImages(htmlContent), [htmlContent]);

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

  // Step 3 — Audience
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Step 4 — Review/Send
  const [sendTeamCopy, setSendTeamCopy] = useState(true);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduleInput, setShowScheduleInput] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Quick-improve chips (same as template editor)
  const quickChips = [
    "Use cores da marca BGP",
    "Adicione CTA",
    "Torne mais persuasivo",
    "Adicione rodape BGP",
    "Melhore o design",
    "Tom mais consultivo",
  ];

  // ── Initialise editor DOM when htmlContent changes externally (AI / template load) ──
  // Only pushes innerHTML when editorInitialised is false — never while user is typing.
  useEffect(() => {
    if (!editorInitialised.current && previewRef.current && htmlContent) {
      previewRef.current.innerHTML = htmlContent;
      editorInitialised.current = true;
    }
  }, [htmlContent]);

  // ── Sync preview to state on blur (never on input — avoids cursor reset) ──
  const syncPreviewToState = useCallback(() => {
    if (previewRef.current) {
      setHtmlContent(previewRef.current.innerHTML);
    }
  }, []);

  // ── Compile full email HTML (same template wrapping as template editor) ──
  function compileFullHtml(): string {
    const bodyHtml = previewRef.current?.innerHTML ?? htmlContent;
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${design.bodyBg};font-family:${design.fontFamily};font-size:${design.fontSize}px;color:${design.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${design.bodyBg};">
<tr><td align="center" style="padding:${design.paddingY}px 0;">
<table role="presentation" width="${design.contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${design.contentBg};border-radius:8px;">
<tr><td style="padding:${design.paddingY}px ${design.paddingX}px;">
${bodyHtml}
</td></tr></table>
</td></tr></table>
</body></html>`;
  }

  // ── Returns HTML for sending — always reads live DOM first ──
  const getHtmlContent = (): string => {
    return compileFullHtml();
  };

  // ── Format (content tab toolbar) ──
  function handleFormat(command: string, value?: string) {
    previewRef.current?.focus();
    document.execCommand(command, false, value);
    // Don't sync here — blur handler captures it
  }

  // ── Insert image ──
  function handleInsertImage(src: string) {
    const img = `<div style="text-align:center;margin:16px 0;"><img src="${src}" alt="Imagem" style="max-width:100%;width:100%;height:auto;display:block;margin:0 auto;" /></div><p><br></p>`;
    if (previewRef.current) {
      previewRef.current.focus();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !previewRef.current.contains(sel.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(previewRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      document.execCommand("insertHTML", false, img);
    } else {
      editorInitialised.current = false;
      setHtmlContent((prev) => prev + img);
    }
  }

  // ── Insert button ──
  function handleInsertButton(text: string, url: string, color: string) {
    const btn = `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">${text}</a></div>`;
    if (previewRef.current) {
      previewRef.current.focus();
      document.execCommand("insertHTML", false, btn);
    } else {
      editorInitialised.current = false;
      setHtmlContent((prev) => prev + btn);
    }
  }

  // ── Image management ──
  function handleRemoveImage(src: string) {
    const current = previewRef.current?.innerHTML ?? htmlContent;
    const updated = removeImageFromHtml(current, src);
    editorInitialised.current = false;
    setHtmlContent(updated);
  }

  function handleChangeImageSrc(oldSrc: string, newSrc: string) {
    const current = previewRef.current?.innerHTML ?? htmlContent;
    const updated = replaceImageSrc(current, oldSrc, newSrc);
    editorInitialised.current = false;
    setHtmlContent(updated);
  }

  // ── AI Generate ──
  async function handleAiGenerate() {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await api.post<{ data: { subject: string; htmlContent: string } }>(
        "/ai/generate-email",
        {
          topic: aiTopic.trim(),
          tone: aiTone,
          audience: aiAudience.trim() || "clientes e leads do CRM",
        }
      );
      editorInitialised.current = false;
      setHtmlContent(res.data.htmlContent);
      if (!subject) setSubject(res.data.subject);
      setAiTopic("");
    } catch (err) {
      setAiError(
        "Erro ao gerar: " + (err instanceof Error ? err.message : "Erro desconhecido")
      );
    } finally {
      setAiLoading(false);
    }
  }

  // ── AI Improve ──
  async function handleAiImprove(text?: string) {
    const instruction = (text || aiInstruction).trim();
    const currentHtml = previewRef.current?.innerHTML ?? htmlContent;
    if (!instruction || !currentHtml.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiInstruction("");
    try {
      const res = await api.post<{ data: { htmlContent: string } }>(
        "/ai/improve-email",
        { htmlContent: currentHtml, instruction }
      );
      editorInitialised.current = false;
      setHtmlContent(res.data.htmlContent);
    } catch (err) {
      setAiError(
        "Erro: " + (err instanceof Error ? err.message : "Erro desconhecido")
      );
      setAiInstruction(instruction);
    } finally {
      setAiLoading(false);
    }
  }

  // ── Load templates modal ──
  const openLoadTemplateModal = useCallback(async () => {
    setLoadTemplateModalOpen(true);
    if (templates.length > 0) return;
    setLoadingTemplates(true);
    setLoadTemplateError(null);
    try {
      const result = await api.get<TemplatesResponse>("/email-templates");
      setTemplates(result.data);
    } catch {
      setLoadTemplateError("Falha ao carregar templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [templates.length]);

  function loadTemplateIntoEditor(tpl: EmailTemplate) {
    // If template has jsonContent with bodyHtml, use that; otherwise use raw htmlContent
    if (tpl.jsonContent) {
      try {
        const parsed = JSON.parse(tpl.jsonContent);
        if (parsed.design) setDesign(parsed.design);
        if (parsed.bodyHtml) {
          editorInitialised.current = false;
          setHtmlContent(parsed.bodyHtml);
          if (!subject) setSubject(tpl.subject);
          if (!name) setName(`Campanha - ${tpl.name}`);
          setLoadTemplateModalOpen(false);
          return;
        }
      } catch {
        // fall through
      }
    }
    editorInitialised.current = false;
    setHtmlContent(tpl.htmlContent || "");
    if (!subject) setSubject(tpl.subject);
    if (!name) setName(`Campanha - ${tpl.name}`);
    setLoadTemplateModalOpen(false);
  }

  // ── Preselected template from URL param ──
  useEffect(() => {
    if (!preselectedTemplateId) return;
    (async () => {
      try {
        const result = await api.get<TemplatesResponse>("/email-templates");
        setTemplates(result.data);
        const found = result.data.find((t: EmailTemplate) => t.id === preselectedTemplateId);
        if (found) {
          loadTemplateIntoEditor(found);
        }
      } catch {
        // silent
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Save as template ──
  async function handleSaveAsTemplate() {
    if (!saveTemplateName.trim() || !htmlContent.trim()) return;
    setSavingTemplate(true);
    try {
      const fullHtml = compileFullHtml();
      const bodyHtml = previewRef.current?.innerHTML ?? htmlContent;
      await api.post("/email-templates", {
        name: saveTemplateName.trim(),
        subject: subject.trim() || saveTemplateName.trim(),
        htmlContent: fullHtml,
        jsonContent: JSON.stringify({ design, bodyHtml }),
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

  // ── canProceed ──
  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!(name.trim() && subject.trim() && fromName.trim() && fromEmail.trim());
      case 1:
        return hasContent;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  // ── Send / Schedule ──
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

  // ── Render ────────────────────────────────────────────────────────────────────

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

        {/* Step 1: Basic */}
        {step === 0 && (
          <Card padding="lg">
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
          </Card>
        )}

        {/* Step 2: AI Email Editor */}
        {step === 1 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
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
                  disabled={!hasContent}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={13} />
                  Salvar como template
                </button>
              </div>
            </div>

            {/* Editor area: sidebar + preview */}
            <div className="flex overflow-hidden" style={{ height: "calc(100vh - 310px)", minHeight: 540 }}>
              {/* ── Left sidebar: tabs ──────────────────────────────────── */}
              <div className="w-[380px] shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
                {/* Tab pills */}
                <div className="shrink-0 px-4 py-3 border-b border-gray-200">
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                    {EDITOR_TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all ${
                            isActive
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                          }`}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tab content (scrollable) */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* ── Tab: IA ──────────────────────────────────────────── */}
                  {activeTab === "ai" && (
                    <div>
                      {!hasContent ? (
                        /* Generate mode */
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
                              <Sparkles size={14} className="text-white" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">
                                Gerar email com IA
                              </h3>
                              <p className="text-xs text-gray-500">
                                Descreva o assunto e escolha o tom
                              </p>
                            </div>
                          </div>

                          <textarea
                            value={aiTopic}
                            onChange={(e) => setAiTopic(e.target.value)}
                            placeholder="Sobre o que é o email? Ex: Promoção de consultoria patrimonial..."
                            rows={3}
                            disabled={aiLoading}
                            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 disabled:opacity-50"
                          />

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Tom de voz
                            </label>
                            <select
                              value={aiTone}
                              onChange={(e) => setAiTone(e.target.value)}
                              disabled={aiLoading}
                              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 disabled:opacity-50"
                            >
                              <option value="profissional">Profissional</option>
                              <option value="casual">Casual</option>
                              <option value="urgente">Urgente</option>
                              <option value="amigavel">Amigável</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">
                              Público-alvo
                            </label>
                            <input
                              type="text"
                              value={aiAudience}
                              onChange={(e) => setAiAudience(e.target.value)}
                              placeholder="Ex: clientes e leads do CRM"
                              disabled={aiLoading}
                              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 disabled:opacity-50 placeholder:text-gray-400"
                            />
                          </div>

                          <button
                            onClick={handleAiGenerate}
                            disabled={!aiTopic.trim() || aiLoading}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                          >
                            {aiLoading ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Sparkles size={14} />
                            )}
                            {aiLoading ? "Gerando..." : "Gerar email"}
                          </button>

                          {aiError && (
                            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                              {aiError}
                            </p>
                          )}
                        </div>
                      ) : (
                        /* Improve mode */
                        <div className="space-y-4">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
                              <Sparkles size={14} className="text-white" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">
                                Melhorar com IA
                              </h3>
                              <p className="text-xs text-gray-500">
                                Escolha uma sugestão ou escreva o que quer mudar
                              </p>
                            </div>
                          </div>

                          {/* Quick chips */}
                          <div className="flex flex-wrap gap-1.5">
                            {quickChips.map((chip) => (
                              <button
                                key={chip}
                                onClick={() => handleAiImprove(chip)}
                                disabled={aiLoading}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>

                          {/* Custom instruction */}
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300 transition-all">
                            <Sparkles size={14} className="text-blue-500 shrink-0" />
                            <input
                              type="text"
                              value={aiInstruction}
                              onChange={(e) => setAiInstruction(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleAiImprove();
                                }
                              }}
                              placeholder={aiLoading ? "Aplicando..." : "Diga o que quer mudar..."}
                              disabled={aiLoading}
                              className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400 disabled:opacity-50"
                            />
                            <button
                              onClick={() => handleAiImprove()}
                              disabled={!aiInstruction.trim() || aiLoading}
                              className="flex items-center justify-center w-7 h-7 rounded-md text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              {aiLoading ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Send size={12} />
                              )}
                            </button>
                          </div>

                          {/* Generate from scratch (reset) */}
                          <button
                            onClick={() => {
                              editorInitialised.current = false;
                              setHtmlContent("");
                              setAiTopic("");
                              setAiError("");
                            }}
                            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                          >
                            Gerar email do zero
                          </button>

                          {aiError && (
                            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                              {aiError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Tab: Design ────────────────────────────────────── */}
                  {activeTab === "design" && (
                    <EmailDesignPanel design={design} onChange={setDesign} />
                  )}

                  {/* ── Tab: Conteúdo ──────────────────────────────────── */}
                  {activeTab === "content" && (
                    <div className="space-y-4">
                      <EmailContentPanel
                        onFormat={handleFormat}
                        onInsertImage={handleInsertImage}
                        onInsertButton={handleInsertButton}
                        images={images}
                        onRemoveImage={(src) => handleRemoveImage(src)}
                        onChangeImageSrc={(oldSrc, newSrc) =>
                          handleChangeImageSrc(oldSrc, newSrc)
                        }
                      />

                      {/* Detected CTA buttons — edit links */}
                      {buttons.length > 0 && (
                        <div className="px-1 pb-2">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            Botões detectados
                          </p>
                          <div className="space-y-2">
                            {buttons.map((btn) => (
                              <div
                                key={btn.index}
                                className="border border-gray-200 rounded-lg p-2.5 bg-gray-50"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-700 truncate">
                                    {btn.text || "Botão"}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (editingBtnIdx === btn.index) {
                                        setEditingBtnIdx(null);
                                      } else {
                                        setEditingBtnIdx(btn.index);
                                        setEditBtnHref(btn.href);
                                      }
                                    }}
                                    className="text-[10px] text-blue-600 hover:underline"
                                  >
                                    {editingBtnIdx === btn.index ? "Fechar" : "Editar link"}
                                  </button>
                                </div>
                                <p className="text-[10px] text-gray-400 truncate">{btn.href}</p>
                                {editingBtnIdx === btn.index && (
                                  <div className="mt-2 flex gap-1.5">
                                    <input
                                      type="url"
                                      value={editBtnHref}
                                      onChange={(e) => setEditBtnHref(e.target.value)}
                                      placeholder="https://..."
                                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <button
                                      onClick={() => {
                                        const current =
                                          previewRef.current?.innerHTML ?? htmlContent;
                                        const updated = replaceButtonHref(
                                          current,
                                          btn.href,
                                          editBtnHref
                                        );
                                        editorInitialised.current = false;
                                        setHtmlContent(updated);
                                        setEditingBtnIdx(null);
                                      }}
                                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700"
                                    >
                                      Salvar
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right: live editable preview ─────────────────────────── */}
              <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
                {/* Preview header */}
                <div className="shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Preview — clique no texto para editar
                  </span>
                </div>

                {/* Preview area — BGP email template style */}
                <div
                  className="flex-1 overflow-auto"
                  style={{ backgroundColor: "#f4f4f4", padding: "20px 8px" }}
                >
                  {/* Logo header */}
                  <div
                    style={{
                      maxWidth: 605,
                      margin: "0 auto",
                      paddingTop: 48,
                      paddingBottom: 24,
                      textAlign: "center",
                    }}
                  >
                    <img
                      src="https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20(2).png"
                      alt="BGP"
                      style={{
                        maxWidth: 206,
                        width: "100%",
                        height: "auto",
                        display: "inline-block",
                      }}
                    />
                  </div>

                  {/* White card body */}
                  <div
                    style={{
                      maxWidth: 605,
                      margin: "0 auto",
                      backgroundColor: "#fff",
                      borderRadius: "16px 16px 0 0",
                      padding: "48px 60px 32px",
                      fontFamily: "Montserrat, 'Trebuchet MS', sans-serif",
                      fontSize: 16,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      color: "#000",
                    }}
                  >
                    {htmlContent ? (
                      <div
                        ref={previewRef}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={syncPreviewToState}
                        style={{ outline: "none", minHeight: 200, wordBreak: "break-word" }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Sparkles size={32} className="mb-3 text-gray-300" />
                        <p className="text-sm font-medium text-gray-500">Nenhum conteúdo ainda</p>
                        <p className="text-xs mt-1 text-gray-400">
                          Use a aba IA ao lado para gerar seu email
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Spacer */}
                  <div
                    style={{
                      maxWidth: 605,
                      margin: "0 auto",
                      backgroundColor: "#fff",
                      height: 16,
                    }}
                  />

                  {/* Social icons */}
                  <div
                    style={{
                      maxWidth: 605,
                      margin: "0 auto",
                      padding: "10px 0",
                      textAlign: "center",
                    }}
                  >
                    <a
                      href="https://www.instagram.com/bertuzzigp/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", margin: "0 10px" }}
                    >
                      <img
                        src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/instagram@2x.png"
                        width={32}
                        alt="Instagram"
                        style={{ display: "block", border: 0 }}
                      />
                    </a>
                    <a
                      href="https://www.youtube.com/@bertuzzigp"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", margin: "0 10px" }}
                    >
                      <img
                        src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/youtube@2x.png"
                        width={32}
                        alt="YouTube"
                        style={{ display: "block", border: 0 }}
                      />
                    </a>
                    <a
                      href="https://wa.me/5551992091726"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", margin: "0 10px" }}
                    >
                      <img
                        src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/whatsapp@2x.png"
                        width={32}
                        alt="WhatsApp"
                        style={{ display: "block", border: 0 }}
                      />
                    </a>
                  </div>

                  {/* Footer */}
                  <div
                    style={{
                      maxWidth: 605,
                      margin: "0 auto",
                      paddingBottom: 24,
                      textAlign: "center",
                    }}
                  >
                    <p
                      style={{
                        fontFamily: "Montserrat, sans-serif",
                        fontSize: 10,
                        color: "#8c8c8c",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      Enviado por www.bertuzzipatrimonial.com.br
                      <br />
                      Av. Carlos Gomes, 75 - Sala 603 - Auxiliadora, Porto Alegre - RS, 90480-000
                      <br />
                      Caso não queira mais receber estes e-mails,{" "}
                      <span style={{ textDecoration: "underline" }}>cancele sua inscrição</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Audience */}
        {step === 2 && (
          <Card padding="lg">
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
          </Card>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <Card padding="lg">
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
                        {hasContent ? "Conteúdo pronto" : "\u2014"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Audiência
                      </p>
                      <p className="text-sm text-gray-900 mt-0.5">
                        {selectedSegmentId ? "Segmento selecionado" : "Todos os contatos"}
                      </p>
                    </div>
                  </div>

                  {/* Team copy toggle */}
                  <div className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Enviar cópia para o time</p>
                      <p className="text-xs text-gray-500">
                        TIME BGP recebe uma cópia com [TIME] no assunto
                      </p>
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

                  {/* Error */}
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
                    html={
                      getHtmlContent() ||
                      "<p style='color:#999;text-align:center;padding:40px;'>Sem conteúdo</p>"
                    }
                    className="h-[450px]"
                    branded
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

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

      {/* ── Modals ───────────────────────────────────────────────────────────── */}

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
                <p className="text-sm text-gray-400 text-center py-10">
                  Nenhum template salvo ainda.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => loadTemplateIntoEditor(tpl)}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSaveTemplateModalOpen(false)}
                    >
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
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-gray-400">
          Carregando...
        </div>
      }
    >
      <NewCampaignPageInner />
    </Suspense>
  );
}
