"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import MarketingNav from "@/components/marketing/MarketingNav";
import EmailDesignPanel, {
  DEFAULT_DESIGN,
  EmailDesign,
} from "@/components/marketing/EmailDesignPanel";
import EmailContentPanel from "@/components/marketing/EmailContentPanel";
import {
  ArrowLeft,
  Save,
  Loader2,
  Sparkles,
  Send,
  Check,
  Paintbrush,
  PenLine,
} from "lucide-react";
import { api } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function replaceImageSrc(
  html: string,
  oldSrc: string,
  newSrc: string
): string {
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

// ── Types ────────────────────────────────────────────────────────────────────

type TabId = "ai" | "design" | "content";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "ai", label: "IA", icon: Sparkles },
  { id: "design", label: "Design", icon: Paintbrush },
  { id: "content", label: "Conteúdo", icon: PenLine },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  // Core state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [design, setDesign] = useState<EmailDesign>(DEFAULT_DESIGN);
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const [previewKey, setPreviewKey] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // AI state
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("profissional");
  const [aiAudience, setAiAudience] = useState("clientes e leads do CRM");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Derived
  const hasContent = htmlContent.trim().length > 20;
  const images = useMemo(() => extractImages(htmlContent), [htmlContent]);

  // ── Load template ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api
      .get<{
        data: {
          id: string;
          name: string;
          subject: string;
          htmlContent: string;
          jsonContent?: string;
        };
      }>(`/email-templates/${id}`)
      .then((res) => {
        setName(res.data.name);
        setSubject(res.data.subject);

        // Try to parse jsonContent for design + bodyHtml
        if (res.data.jsonContent) {
          try {
            const parsed = JSON.parse(res.data.jsonContent);
            if (parsed.design) setDesign(parsed.design);
            if (parsed.bodyHtml) {
              setHtmlContent(parsed.bodyHtml);
              setPreviewKey((k) => k + 1);
              return;
            }
          } catch {
            // fallback to raw htmlContent
          }
        }

        setHtmlContent(res.data.htmlContent || "");
        setPreviewKey((k) => k + 1);
      })
      .catch(() => showToast("Erro ao carregar template"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── Sync preview to state ────────────────────────────────────────────────

  const syncPreviewToState = useCallback(() => {
    if (previewRef.current) {
      setHtmlContent(previewRef.current.innerHTML);
    }
  }, []);

  // ── Format handler (for content tab) ─────────────────────────────────────

  function handleFormat(command: string, value?: string) {
    previewRef.current?.focus();
    document.execCommand(command, false, value);
    syncPreviewToState();
  }

  // ── Insert image ─────────────────────────────────────────────────────────

  function handleInsertImage(src: string) {
    const img = `<div style="text-align:center;margin:16px 0;"><img src="${src}" alt="Imagem" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></div>`;
    if (previewRef.current) {
      previewRef.current.focus();
      document.execCommand("insertHTML", false, img);
      syncPreviewToState();
    } else {
      setHtmlContent((prev) => prev + img);
      setPreviewKey((k) => k + 1);
    }
  }

  // ── Insert button ────────────────────────────────────────────────────────

  function handleInsertButton(text: string, url: string, color: string) {
    const btn = `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">${text}</a></div>`;
    if (previewRef.current) {
      previewRef.current.focus();
      document.execCommand("insertHTML", false, btn);
      syncPreviewToState();
    } else {
      setHtmlContent((prev) => prev + btn);
      setPreviewKey((k) => k + 1);
    }
  }

  // ── Image management ─────────────────────────────────────────────────────

  function handleRemoveImage(src: string) {
    const updated = removeImageFromHtml(htmlContent, src);
    setHtmlContent(updated);
    setPreviewKey((k) => k + 1);
  }

  function handleChangeImageSrc(oldSrc: string, newSrc: string) {
    const updated = replaceImageSrc(htmlContent, oldSrc, newSrc);
    setHtmlContent(updated);
    setPreviewKey((k) => k + 1);
  }

  // ── Compile full HTML for saving ─────────────────────────────────────────

  function compileFullHtml(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${design.bodyBg};font-family:${design.fontFamily};font-size:${design.fontSize}px;color:${design.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${design.bodyBg};">
<tr><td align="center" style="padding:${design.paddingY}px 0;">
<table role="presentation" width="${design.contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${design.contentBg};border-radius:8px;">
<tr><td style="padding:${design.paddingY}px ${design.paddingX}px;">
${htmlContent}
</td></tr></table>
</td></tr></table>
</body></html>`;
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim() || !subject.trim()) {
      showToast("Preencha nome e assunto");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        htmlContent: compileFullHtml(),
        jsonContent: JSON.stringify({ design, bodyHtml: htmlContent }),
      };

      if (isNew) {
        const res = await api.post<{ data: { id: string } }>(
          "/email-templates",
          payload
        );
        router.push(`/marketing/emails/templates/${res.data.id}`);
        showToast("Template criado!");
      } else {
        await api.put(`/email-templates/${id}`, payload);
        showToast("Template salvo!");
      }
    } catch {
      showToast("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ── AI Generate ──────────────────────────────────────────────────────────

  async function handleAiGenerate() {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    setAiError("");
    try {
      const res = await api.post<{
        data: { subject: string; htmlContent: string };
      }>("/ai/generate-email", {
        topic: aiTopic.trim(),
        tone: aiTone,
        audience: aiAudience.trim() || "clientes e leads do CRM",
      });
      setHtmlContent(res.data.htmlContent);
      setSubject(res.data.subject);
      setPreviewKey((k) => k + 1);
      setAiTopic("");
      showToast("Email gerado com IA!");
    } catch (err) {
      setAiError(
        "Erro ao gerar: " +
          (err instanceof Error ? err.message : "Erro desconhecido")
      );
    } finally {
      setAiLoading(false);
    }
  }

  // ── AI Improve ───────────────────────────────────────────────────────────

  async function handleAiImprove(text?: string) {
    const instruction = (text || aiInstruction).trim();
    if (!instruction || !htmlContent.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiInstruction("");
    try {
      const res = await api.post<{ data: { htmlContent: string } }>(
        "/ai/improve-email",
        { htmlContent, instruction }
      );
      setHtmlContent(res.data.htmlContent);
      setPreviewKey((k) => k + 1);
      showToast("Alteração aplicada!");
    } catch (err) {
      setAiError(
        "Erro: " + (err instanceof Error ? err.message : "Erro desconhecido")
      );
      setAiInstruction(instruction);
    } finally {
      setAiLoading(false);
    }
  }

  const quickChips = [
    "Use cores da marca BGP",
    "Adicione CTA",
    "Torne mais persuasivo",
    "Adicione rodape BGP",
    "Melhore o design",
    "Tom mais consultivo",
  ];

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header
          title="Template"
          breadcrumb={["Marketing", "Emails", "Templates", "..."]}
        />
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={isNew ? "Novo Template" : `Editar: ${name}`}
        breadcrumb={["Marketing", "Emails", "Templates", isNew ? "Novo" : name]}
      />
      <MarketingNav />

      {/* Top toolbar: back, name, subject, save */}
      <div className="shrink-0 border-b border-gray-200 bg-white">
        {/* Row 1: Back + Name + Save */}
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/marketing/emails/templates")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do template"
              className="text-sm font-medium text-gray-900 bg-transparent border-none outline-none w-64 placeholder:text-gray-400"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !subject.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Salvar
          </button>
        </div>

        {/* Row 2: Subject */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-t border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0">
            Assunto
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex: Novidades da semana"
            className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Main area: sidebar + preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left sidebar ────────────────────────────────────────────────── */}
        <div className="w-[400px] shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          {/* Tab pills */}
          <div className="shrink-0 px-4 py-3 border-b border-gray-200">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {TABS.map((tab) => {
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
            {/* ── Tab: IA ──────────────────────────────────────────────── */}
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
                        Publico-alvo
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
                      <Sparkles
                        size={14}
                        className="text-blue-500 shrink-0"
                      />
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
                        placeholder={
                          aiLoading
                            ? "Aplicando..."
                            : "Diga o que quer mudar..."
                        }
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

                    {aiError && (
                      <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                        {aiError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Design ──────────────────────────────────────────── */}
            {activeTab === "design" && (
              <EmailDesignPanel design={design} onChange={setDesign} />
            )}

            {/* ── Tab: Conteudo ────────────────────────────────────────── */}
            {activeTab === "content" && (
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
            )}
          </div>
        </div>

        {/* ── Right: Live editable preview ────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          {/* Preview header */}
          <div className="shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Preview — clique no texto para editar
            </span>
          </div>

          {/* Preview area with BGP brand template */}
          <div
            className="flex-1 overflow-auto"
            style={{
              backgroundColor: "#f4f4f4",
              padding: "20px 16px",
            }}
          >
            <div
              style={{
                maxWidth: 600,
                margin: "0 auto",
                backgroundColor: "#ffffff",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              {/* BGP Header */}
              <div style={{
                background: "linear-gradient(135deg, #244c5a 0%, #244c5add 50%, #abc7c988 100%)",
                padding: "24px 32px",
                textAlign: "right" as const,
              }}>
                <img src="/images/logo-bgp-email.png" alt="BGP" style={{ height: 40, display: "inline-block" }} />
              </div>

              {/* Editable body */}
              <div style={{
                padding: "32px",
                fontFamily: design.fontFamily,
                fontSize: design.fontSize,
                color: design.textColor,
              }}>
                {htmlContent ? (
                  <div
                    key={previewKey}
                    ref={previewRef}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={syncPreviewToState}
                    onInput={syncPreviewToState}
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    style={{
                      outline: "none",
                      minHeight: 200,
                      wordBreak: "break-word",
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <Sparkles size={32} className="mb-3 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">
                      Nenhum conteúdo ainda
                    </p>
                    <p className="text-xs mt-1 text-gray-400">
                      Use a aba IA ao lado para gerar seu email
                    </p>
                  </div>
                )}
              </div>

              {/* BGP Footer */}
              <div style={{
                backgroundColor: "#244c5a",
                padding: "24px 32px",
                textAlign: "center" as const,
              }}>
                <img src="/images/logo-bgp-email.png" alt="BGP" style={{ height: 28, display: "inline-block", opacity: 0.7, marginBottom: 12 }} />
                <p style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold", margin: "0 0 4px" }}>Bertuzzi Patrimonial</p>
                <p style={{ color: "#abc7c9", fontSize: 12, margin: "0 0 12px", lineHeight: 1.5 }}>
                  Gestão financeira inteligente para o seu negócio
                </p>
                <p style={{ color: "#abc7c9", fontSize: 11, margin: 0, borderTop: "1px solid #244c5a88", paddingTop: 12 }}>
                  Não quer mais receber? <span style={{ textDecoration: "underline" }}>Descadastrar</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check size={14} className="text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
