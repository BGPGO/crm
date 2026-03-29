"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import AudienceSelector from "@/components/marketing/AudienceSelector";
import EmailPreview from "@/components/marketing/EmailPreview";
import AIEmailGenerator from "@/components/marketing/AIEmailGenerator";
import EmailDesignPanel, { DEFAULT_DESIGN, EmailDesign } from "@/components/marketing/EmailDesignPanel";
import EmailContentPanel from "@/components/marketing/EmailContentPanel";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Send,
  Clock,
  Sparkles,
  Loader2,
  Plus,
  Paintbrush,
  PenLine,
  Save,
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
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Step 1 - Basic
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("Vítor Bertuzzi");
  const [fromEmail, setFromEmail] = useState("vitor@bertuzzipatrimonial.app.br");

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

  // Team copy
  const [sendTeamCopy, setSendTeamCopy] = useState(true);

  // Schedule
  const [scheduleDate, setScheduleDate] = useState("");
  const [showScheduleInput, setShowScheduleInput] = useState(false);

  // Inline template editor (full)
  const [showInlineEditor, setShowInlineEditor] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const [inlineSubject, setInlineSubject] = useState("");
  const [inlineHtml, setInlineHtml] = useState("");
  const [inlineDesign, setInlineDesign] = useState<EmailDesign>(DEFAULT_DESIGN);
  const [inlineTab, setInlineTab] = useState<"ai" | "design" | "content">("ai");
  const [inlinePreviewKey, setInlinePreviewKey] = useState(0);
  const inlinePreviewRef = useRef<HTMLDivElement>(null);
  const [inlineAiTopic, setInlineAiTopic] = useState("");
  const [inlineAiTone, setInlineAiTone] = useState("profissional");
  const [inlineAiAudience, setInlineAiAudience] = useState("clientes e leads do CRM");
  const [inlineAiInstruction, setInlineAiInstruction] = useState("");
  const [inlineAiLoading, setInlineAiLoading] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineEditBtnIdx, setInlineEditBtnIdx] = useState<number | null>(null);
  const [inlineEditBtnHref, setInlineEditBtnHref] = useState("");

  const inlineHasContent = inlineHtml.trim().length > 20;

  const inlineImages = useMemo(() => {
    const imgs: { src: string; index: number }[] = [];
    const regex = /<img[^>]+src=["']([^"']*)["']/gi;
    let match; let i = 0;
    while ((match = regex.exec(inlineHtml))) { imgs.push({ src: match[1], index: i++ }); }
    return imgs;
  }, [inlineHtml]);

  const inlineButtons = useMemo(() => {
    const buttons: { text: string; href: string; index: number }[] = [];
    const regex = /<a\s[^>]*href=["']([^"']*)["'][^>]*(?:data-cta|padding[^"]*background)[^>]*>([\s\S]*?)<\/a>/gi;
    let match; let i = 0;
    while ((match = regex.exec(inlineHtml))) {
      const text = match[2].replace(/<[^>]+>/g, "").trim();
      buttons.push({ href: match[1], text, index: i++ });
    }
    return buttons;
  }, [inlineHtml]);

  function inlineReplaceButtonHref(oldHref: string, newHref: string) {
    const updated = inlineHtml.replace(
      new RegExp(`(href=["'])${oldHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`, "g"),
      `$1${newHref}$2`
    );
    setInlineHtml(updated);
    setInlinePreviewKey(k => k + 1);
    setInlineEditBtnIdx(null);
  }

  const syncInlinePreview = useCallback(() => {
    if (inlinePreviewRef.current) setInlineHtml(inlinePreviewRef.current.innerHTML);
  }, []);

  function inlineHandleFormat(command: string, value?: string) {
    inlinePreviewRef.current?.focus();
    document.execCommand(command, false, value);
    syncInlinePreview();
  }

  function inlineInsertImage(src: string) {
    const img = `<div style="text-align:center;margin:16px 0;"><img src="${src}" alt="Imagem" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></div>`;
    if (inlinePreviewRef.current) {
      inlinePreviewRef.current.focus();
      document.execCommand("insertHTML", false, img);
      syncInlinePreview();
    } else {
      setInlineHtml(prev => prev + img);
      setInlinePreviewKey(k => k + 1);
    }
  }

  function inlineInsertButton(text: string, url: string, color: string) {
    const btn = `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">${text}</a></div>`;
    if (inlinePreviewRef.current) {
      inlinePreviewRef.current.focus();
      document.execCommand("insertHTML", false, btn);
      syncInlinePreview();
    } else {
      setInlineHtml(prev => prev + btn);
      setInlinePreviewKey(k => k + 1);
    }
  }

  function inlineRemoveImage(src: string) {
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let result = inlineHtml.replace(new RegExp(`<div[^>]*>\\s*<img[^>]*src=["']${escaped}["'][^>]*/?>\\s*</div>`, "gi"), "");
    result = result.replace(new RegExp(`<img[^>]*src=["']${escaped}["'][^>]*/?>`, "gi"), "");
    setInlineHtml(result);
    setInlinePreviewKey(k => k + 1);
  }

  function inlineChangeImageSrc(oldSrc: string, newSrc: string) {
    setInlineHtml(inlineHtml.replace(new RegExp(`(src=["'])${oldSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`, "g"), `$1${newSrc}$2`));
    setInlinePreviewKey(k => k + 1);
  }

  function compileInlineHtml(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${inlineDesign.bodyBg};font-family:${inlineDesign.fontFamily};font-size:${inlineDesign.fontSize}px;color:${inlineDesign.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${inlineDesign.bodyBg};">
<tr><td align="center" style="padding:${inlineDesign.paddingY}px 0;">
<table role="presentation" width="${inlineDesign.contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${inlineDesign.contentBg};border-radius:8px;">
<tr><td style="padding:${inlineDesign.paddingY}px ${inlineDesign.paddingX}px;">
${inlineHtml}
</td></tr></table>
</td></tr></table>
</body></html>`;
  }

  const inlineQuickChips = [
    "Use cores da marca BGP", "Adicione CTA", "Torne mais persuasivo",
    "Adicione rodape BGP", "Melhore o design", "Tom mais consultivo",
  ];

  useEffect(() => {
    async function fetchTemplates() {
      setLoadingTemplates(true);
      setTemplateError(null);
      try {
        const result = await api.get<TemplatesResponse>("/email-templates");
        setTemplates(result.data);
        if (preselectedTemplateId) {
          const found = result.data.find((t: EmailTemplate) => t.id === preselectedTemplateId);
          if (found) {
            setSelectedTemplateId(found.id);
            if (!subject) setSubject(found.subject);
            if (!name) setName(`Campanha - ${found.name}`);
          }
        }
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
        if (showInlineEditor) return false;
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

  const skipTemplateStep = !!preselectedTemplateId && !!selectedTemplateId;

  async function handleInlineAiGenerate() {
    if (!inlineAiTopic.trim()) return;
    setInlineAiLoading(true);
    try {
      const res = await api.post<{ data: { subject: string; htmlContent: string } }>("/ai/generate-email", {
        topic: inlineAiTopic.trim(),
        tone: inlineAiTone,
        audience: inlineAiAudience.trim() || "clientes e leads do CRM",
      });
      setInlineHtml(res.data.htmlContent);
      if (!inlineSubject) setInlineSubject(res.data.subject);
      setInlinePreviewKey(k => k + 1);
      setInlineAiTopic("");
    } catch (err) {
      console.error("Erro ao gerar email:", err);
    } finally {
      setInlineAiLoading(false);
    }
  }

  async function handleInlineAiImprove(text?: string) {
    const instruction = (text || inlineAiInstruction).trim();
    if (!instruction || !inlineHtml.trim()) return;
    setInlineAiLoading(true);
    setInlineAiInstruction("");
    try {
      const res = await api.post<{ data: { htmlContent: string } }>("/ai/improve-email", {
        htmlContent: inlineHtml,
        instruction,
      });
      setInlineHtml(res.data.htmlContent);
      setInlinePreviewKey(k => k + 1);
    } catch (err) {
      console.error("Erro ao melhorar email:", err);
      setInlineAiInstruction(instruction);
    } finally {
      setInlineAiLoading(false);
    }
  }

  async function handleInlineSaveAndContinue() {
    if (!inlineName.trim() || !inlineSubject.trim() || !inlineHtml.trim()) return;
    setInlineSaving(true);
    try {
      const compiled = compileInlineHtml();
      const res = await api.post<{ data: { id: string } }>("/email-templates", {
        name: inlineName.trim(),
        subject: inlineSubject.trim(),
        htmlContent: compiled,
        jsonContent: JSON.stringify({ design: inlineDesign, bodyHtml: inlineHtml }),
      });
      const newTpl: EmailTemplate = {
        id: res.data.id,
        name: inlineName.trim(),
        subject: inlineSubject.trim(),
        htmlContent: compiled,
      };
      setTemplates(prev => [newTpl, ...prev]);
      setSelectedTemplateId(res.data.id);
      setUseCustomHtml(false);
      setShowInlineEditor(false);
      if (!subject) setSubject(inlineSubject.trim());
      setStep(2);
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    } finally {
      setInlineSaving(false);
    }
  }

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
                onClick={() => {
                  if (i < step || (i === 1 && skipTemplateStep)) setStep(i);
                }}
                disabled={i > step && !(i === 1 && skipTemplateStep)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  i === step
                    ? "bg-blue-600 text-white"
                    : i < step || (i === 1 && skipTemplateStep)
                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step || (i === 1 && skipTemplateStep) ? (
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
                  onClick={() => { setUseCustomHtml(false); setShowInlineEditor(false); }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    !useCustomHtml && !showInlineEditor
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Usar Template
                </button>
                <button
                  onClick={() => { setUseCustomHtml(true); setShowInlineEditor(false); }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    useCustomHtml && !showInlineEditor
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  HTML Personalizado
                </button>
                <button
                  onClick={() => { setUseCustomHtml(false); setShowInlineEditor(true); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    showInlineEditor
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <Plus size={14} />
                  Criar Novo
                </button>
              </div>

              {templateError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {templateError}
                </div>
              )}

              {showInlineEditor && (
                <div className="space-y-4">
                  {/* Name & Subject */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do template</label>
                      <input type="text" value={inlineName} onChange={e => setInlineName(e.target.value)}
                        placeholder="Ex: Newsletter Março" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Assunto</label>
                      <input type="text" value={inlineSubject} onChange={e => setInlineSubject(e.target.value)}
                        placeholder="Ex: Novidades da semana" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>

                  {/* Editor: sidebar + preview */}
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden" style={{ minHeight: 520 }}>
                    {/* Left sidebar with tabs */}
                    <div className="w-[340px] shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
                      {/* Tab pills */}
                      <div className="shrink-0 px-3 py-2.5 border-b border-gray-200">
                        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                          {([
                            { id: "ai" as const, label: "IA", Icon: Sparkles },
                            { id: "design" as const, label: "Design", Icon: Paintbrush },
                            { id: "content" as const, label: "Conteudo", Icon: PenLine },
                          ]).map(({ id, label, Icon }) => (
                            <button key={id} onClick={() => setInlineTab(id)}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                inlineTab === id ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                              }`}>
                              <Icon size={14} />{label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Tab content */}
                      <div className="flex-1 overflow-y-auto p-4">
                        {/* AI tab */}
                        {inlineTab === "ai" && (
                          <div>
                            {!inlineHasContent ? (
                              <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
                                    <Sparkles size={14} className="text-white" />
                                  </div>
                                  <div>
                                    <h3 className="text-sm font-semibold text-gray-900">Gerar email com IA</h3>
                                    <p className="text-xs text-gray-500">Descreva o assunto e escolha o tom</p>
                                  </div>
                                </div>
                                <textarea value={inlineAiTopic} onChange={e => setInlineAiTopic(e.target.value)}
                                  placeholder="Sobre o que e o email? Ex: Promocao de consultoria patrimonial..."
                                  rows={3} disabled={inlineAiLoading}
                                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 disabled:opacity-50" />
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Tom de voz</label>
                                  <select value={inlineAiTone} onChange={e => setInlineAiTone(e.target.value)} disabled={inlineAiLoading}
                                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50">
                                    <option value="profissional">Profissional</option>
                                    <option value="casual">Casual</option>
                                    <option value="urgente">Urgente</option>
                                    <option value="amigavel">Amigavel</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Publico-alvo</label>
                                  <input type="text" value={inlineAiAudience} onChange={e => setInlineAiAudience(e.target.value)}
                                    placeholder="Ex: clientes e leads do CRM" disabled={inlineAiLoading}
                                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 placeholder:text-gray-400" />
                                </div>
                                <button onClick={handleInlineAiGenerate} disabled={!inlineAiTopic.trim() || inlineAiLoading}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all">
                                  {inlineAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                  {inlineAiLoading ? "Gerando..." : "Gerar email"}
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
                                    <Sparkles size={14} className="text-white" />
                                  </div>
                                  <div>
                                    <h3 className="text-sm font-semibold text-gray-900">Melhorar com IA</h3>
                                    <p className="text-xs text-gray-500">Escolha uma sugestao ou escreva o que quer mudar</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {inlineQuickChips.map(chip => (
                                    <button key={chip} onClick={() => handleInlineAiImprove(chip)} disabled={inlineAiLoading}
                                      className="px-2.5 py-1.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300 transition-all">
                                  <Sparkles size={14} className="text-blue-500 shrink-0" />
                                  <input type="text" value={inlineAiInstruction} onChange={e => setInlineAiInstruction(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleInlineAiImprove(); } }}
                                    placeholder={inlineAiLoading ? "Aplicando..." : "Diga o que quer mudar..."}
                                    disabled={inlineAiLoading}
                                    className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400 disabled:opacity-50" />
                                  <button onClick={() => handleInlineAiImprove()} disabled={!inlineAiInstruction.trim() || inlineAiLoading}
                                    className="flex items-center justify-center w-7 h-7 rounded-md text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                    {inlineAiLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Design tab */}
                        {inlineTab === "design" && (
                          <EmailDesignPanel design={inlineDesign} onChange={setInlineDesign} />
                        )}

                        {/* Content tab */}
                        {inlineTab === "content" && (
                          <div className="space-y-4">
                            <EmailContentPanel
                              onFormat={inlineHandleFormat}
                              onInsertImage={inlineInsertImage}
                              onInsertButton={inlineInsertButton}
                              images={inlineImages}
                              onRemoveImage={inlineRemoveImage}
                              onChangeImageSrc={inlineChangeImageSrc}
                            />

                            {/* Detected CTA buttons — edit links */}
                            {inlineButtons.length > 0 && (
                              <div className="px-4 pb-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Botoes detectados</p>
                                <div className="space-y-2">
                                  {inlineButtons.map((btn) => (
                                    <div key={btn.index} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-700 truncate">{btn.text || "Botao"}</span>
                                        <button
                                          onClick={() => {
                                            if (inlineEditBtnIdx === btn.index) {
                                              setInlineEditBtnIdx(null);
                                            } else {
                                              setInlineEditBtnIdx(btn.index);
                                              setInlineEditBtnHref(btn.href);
                                            }
                                          }}
                                          className="text-[10px] text-blue-600 hover:underline"
                                        >
                                          {inlineEditBtnIdx === btn.index ? "Fechar" : "Editar link"}
                                        </button>
                                      </div>
                                      <p className="text-[10px] text-gray-400 truncate">{btn.href}</p>
                                      {inlineEditBtnIdx === btn.index && (
                                        <div className="mt-2 flex gap-1.5">
                                          <input type="url" value={inlineEditBtnHref} onChange={e => setInlineEditBtnHref(e.target.value)}
                                            placeholder="https://..."
                                            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                          <button onClick={() => inlineReplaceButtonHref(btn.href, inlineEditBtnHref)}
                                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium hover:bg-blue-700">
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

                    {/* Right: live editable preview */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
                      <div className="shrink-0 px-4 py-2 bg-white border-b border-gray-200">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Preview — clique no texto para editar
                        </span>
                      </div>
                      <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f4f4f4", padding: "20px 8px" }}>
                        {/* Logo */}
                        <div style={{ maxWidth: 605, margin: "0 auto", paddingTop: 32, paddingBottom: 16, textAlign: "center" as const }}>
                          <img src="https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20(2).png" alt="BGP" style={{ maxWidth: 160, width: "100%", height: "auto", display: "inline-block" }} />
                        </div>
                        {/* White card body */}
                        <div style={{
                          maxWidth: 605, margin: "0 auto", backgroundColor: "#fff",
                          borderRadius: "16px 16px 0 0", padding: "32px 40px 24px",
                          fontFamily: "Montserrat, 'Trebuchet MS', sans-serif",
                          fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: "#000",
                        }}>
                          {inlineHtml ? (
                            <div key={inlinePreviewKey} ref={inlinePreviewRef} contentEditable suppressContentEditableWarning
                              onBlur={syncInlinePreview} onInput={syncInlinePreview}
                              dangerouslySetInnerHTML={{ __html: inlineHtml }}
                              style={{ outline: "none", minHeight: 150, wordBreak: "break-word" }} />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                              <Sparkles size={28} className="mb-2 text-gray-300" />
                              <p className="text-sm font-medium text-gray-500">Nenhum conteudo ainda</p>
                              <p className="text-xs mt-1 text-gray-400">Use a aba IA para gerar seu email</p>
                            </div>
                          )}
                        </div>
                        {/* Footer */}
                        <div style={{ maxWidth: 605, margin: "0 auto", backgroundColor: "#fff", height: 12 }} />
                        <div style={{ maxWidth: 605, margin: "0 auto", padding: "8px 0", textAlign: "center" as const }}>
                          <a href="https://www.instagram.com/bertuzzigp/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 8px" }}>
                            <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/instagram@2x.png" width={28} height="auto" alt="Instagram" style={{ display: "block", border: 0 }} />
                          </a>
                          <a href="https://www.youtube.com/@bertuzzigp" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 8px" }}>
                            <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/youtube@2x.png" width={28} height="auto" alt="YouTube" style={{ display: "block", border: 0 }} />
                          </a>
                          <a href="https://wa.me/5551992091726" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 8px" }}>
                            <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/whatsapp@2x.png" width={28} height="auto" alt="WhatsApp" style={{ display: "block", border: 0 }} />
                          </a>
                        </div>
                        <div style={{ maxWidth: 605, margin: "0 auto", paddingBottom: 16, textAlign: "center" as const }}>
                          <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 9, color: "#8c8c8c", lineHeight: 1.5, margin: 0 }}>
                            Enviado por www.bertuzzipatrimonial.com.br<br />
                            Av. Carlos Gomes, 75 - Sala 603 - Auxiliadora, Porto Alegre - RS
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Save and continue */}
                  <button onClick={handleInlineSaveAndContinue}
                    disabled={inlineSaving || !inlineName.trim() || !inlineSubject.trim() || !inlineHtml.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {inlineSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Salvar Template e Continuar
                  </button>
                </div>
              )}

              {!showInlineEditor && !useCustomHtml ? (
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
              ) : !showInlineEditor ? (
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
                      branded
                    />
                  </div>
                </div>
              ) : null}
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
              onClick={() => setStep((s) => (s === 2 && skipTemplateStep) ? 0 : s - 1)}
              disabled={step === 0}
            >
              <ArrowLeft size={14} />
              Voltar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setStep((s) => (s === 0 && skipTemplateStep) ? 2 : s + 1)}
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
              onClick={() => setStep((s) => {
                const prev = s - 1;
                return (prev === 1 && skipTemplateStep) ? 0 : prev;
              })}
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

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400">Carregando...</div>}>
      <NewCampaignPageInner />
    </Suspense>
  );
}
