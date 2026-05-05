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
  ArrowRight,
  Save,
  Loader2,
  Sparkles,
  Send,
  Check,
  Paintbrush,
  PenLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { useBrand } from "@/contexts/BrandContext";
import EmailPreview from "@/components/marketing/EmailPreview";

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

function extractButtons(html: string): { text: string; href: string; index: number }[] {
  const buttons: { text: string; href: string; index: number }[] = [];
  // Match <a> tags that look like buttons (have data-cta, or padding+background-color in style)
  const regex = /<a\s[^>]*href=["']([^"']*)["'][^>]*(?:data-cta|padding[^"]*background)[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let i = 0;
  while ((match = regex.exec(html))) {
    const text = match[2].replace(/<[^>]+>/g, '').trim();
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
  const [templateBrand, setTemplateBrand] = useState<"BGP" | "AIMO" | null>(null);
  const { brand: switcherBrand } = useBrand();
  // Brand efetiva: do template carregado da API; senao, do switcher global.
  const effectiveBrand: "BGP" | "AIMO" = templateBrand ?? switcherBrand;
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const previewRef = useRef<HTMLDivElement>(null);
  // Track whether the editor has been initialised so we never reapply
  // dangerouslySetInnerHTML after the first mount (which would destroy the cursor).
  const editorInitialised = useRef(false);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [showCampaignPrompt, setShowCampaignPrompt] = useState(false);

  // AI state
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("profissional");
  const [aiAudience, setAiAudience] = useState("clientes e leads do CRM");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Button editing
  const [editingBtnIdx, setEditingBtnIdx] = useState<number | null>(null);
  const [editBtnHref, setEditBtnHref] = useState("");

  // Derived
  const hasContent = htmlContent.trim().length > 20;
  const buttons = useMemo(() => extractButtons(htmlContent), [htmlContent]);
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
          brand?: "BGP" | "AIMO";
        };
      }>(`/email-templates/${id}`)
      .then((res) => {
        setName(res.data.name);
        setSubject(res.data.subject);
        if (res.data.brand) setTemplateBrand(res.data.brand);

        // Try to parse jsonContent for design + bodyHtml
        if (res.data.jsonContent) {
          try {
            const parsed = JSON.parse(res.data.jsonContent);
            if (parsed.design) setDesign(parsed.design);
            if (parsed.bodyHtml) {
              editorInitialised.current = false; // allow re-init with new content
              setHtmlContent(parsed.bodyHtml);
              return;
            }
          } catch {
            // fallback to raw htmlContent
          }
        }

        editorInitialised.current = false; // allow re-init with new content
        setHtmlContent(res.data.htmlContent || "");
      })
      .catch(() => showToast("Erro ao carregar template"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // ── Toast ────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── Initialise editor DOM when htmlContent changes externally (AI / load) ──
  // We ONLY push innerHTML into the DOM when editorInitialised is false (i.e.,
  // when content was replaced by AI generation or initial load), never while
  // the user is actively typing.  This prevents the cursor-reset bug.

  useEffect(() => {
    if (!editorInitialised.current && previewRef.current && htmlContent) {
      previewRef.current.innerHTML = htmlContent;
      editorInitialised.current = true;
    }
  }, [htmlContent]);

  // ── Inject global CSS for image drag/resize inside editor ────────────────
  // This runs once on mount to enable native browser image resize handles and
  // cursor affordances inside the contentEditable preview area.
  useEffect(() => {
    const styleId = "email-editor-img-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      [contenteditable] img {
        cursor: move;
        max-width: 100%;
      }
      [contenteditable] img:hover {
        outline: 2px solid #3B82F6;
        outline-offset: 2px;
      }
      [contenteditable] img.selected,
      [contenteditable] img:focus {
        outline: 2px solid #3B82F6;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  // ── Sync preview to state (blur only — never on input) ───────────────────

  const syncPreviewToState = useCallback(() => {
    if (previewRef.current) {
      setHtmlContent(previewRef.current.innerHTML);
    }
  }, []);

  // ── Format handler (for content tab) ─────────────────────────────────────
  // execCommand mutates the DOM directly; no state update needed here — the
  // blur handler will capture the final content when the user leaves the editor.

  function handleFormat(command: string, value?: string) {
    previewRef.current?.focus();
    document.execCommand(command, false, value);
    // Do NOT call syncPreviewToState() here — that would trigger a re-render
    // and reset the cursor mid-edit.
  }

  // ── Insert image ─────────────────────────────────────────────────────────

  function handleInsertImage(src: string) {
    // Append a <p> after the image so the cursor lands below it, not inside
    // draggable="true" enables native browser drag-and-drop repositioning inside contentEditable
    // resize:both + overflow:auto enables native browser resize handles (drag corners to resize)
    const img = `<div style="text-align:center;margin:16px 0;display:block;" draggable="true"><img src="${src}" alt="Imagem" style="max-width:100%;width:100%;height:auto;display:inline-block;cursor:move;resize:both;overflow:auto;" /></div><p><br></p>`;
    if (previewRef.current) {
      previewRef.current.focus();

      // Ensure insertion happens at end if selection is outside the editor
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !previewRef.current.contains(sel.anchorNode)) {
        // Move cursor to end of editor
        const range = document.createRange();
        range.selectNodeContents(previewRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }

      document.execCommand("insertHTML", false, img);
      // DOM updated directly — no state sync needed during editing
    } else {
      editorInitialised.current = false;
      setHtmlContent((prev) => prev + img);
    }
  }

  // ── Insert button ────────────────────────────────────────────────────────

  function handleInsertButton(text: string, url: string, color: string) {
    const btn = `<div style="text-align:center;margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 32px;background-color:${color};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">${text}</a></div>`;
    if (previewRef.current) {
      previewRef.current.focus();
      document.execCommand("insertHTML", false, btn);
      // DOM updated directly — no state sync needed during editing
    } else {
      editorInitialised.current = false;
      setHtmlContent((prev) => prev + btn);
    }
  }

  // ── Image management ─────────────────────────────────────────────────────

  function handleRemoveImage(src: string) {
    // Read live DOM content (may differ from state if user typed without blur)
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

  // ── Compile full HTML for saving ─────────────────────────────────────────
  // Always read the live DOM content so unsaved edits (user typed without blur)
  // are included.

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

  // Ensure htmlContent state is up to date before saving
  function flushEditorToState() {
    if (previewRef.current) {
      const current = previewRef.current.innerHTML;
      if (current !== htmlContent) setHtmlContent(current);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim() || !subject.trim()) {
      showToast("Preencha nome e assunto");
      return;
    }
    flushEditorToState();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        htmlContent: compileFullHtml(),
        jsonContent: JSON.stringify({ design, bodyHtml: previewRef.current?.innerHTML ?? htmlContent }),
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
      setShowCampaignPrompt(true);
    } catch {
      showToast("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAndCampaign() {
    if (!name.trim() || !subject.trim()) {
      showToast("Preencha nome e assunto");
      return;
    }
    flushEditorToState();
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        subject: subject.trim(),
        htmlContent: compileFullHtml(),
        jsonContent: JSON.stringify({ design, bodyHtml: previewRef.current?.innerHTML ?? htmlContent }),
      };

      if (isNew) {
        const res = await api.post<{ data: { id: string } }>(
          "/email-templates",
          payload
        );
        router.push(`/marketing/emails/new?templateId=${res.data.id}`);
      } else {
        await api.put(`/email-templates/${id}`, payload);
        router.push(`/marketing/emails/new?templateId=${id}`);
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
      editorInitialised.current = false;
      setHtmlContent(res.data.htmlContent);
      setSubject(res.data.subject);
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
      editorInitialised.current = false;
      setHtmlContent(res.data.htmlContent);
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
          <div className="flex items-center gap-2">
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
            <button
              onClick={handleSaveAndCampaign}
              disabled={saving || !name.trim() || !subject.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              Criar Campanha
            </button>
          </div>
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

      {/* Post-save campaign prompt banner */}
      {showCampaignPrompt && (
        <div className="shrink-0 px-6 py-2.5 bg-green-50 border-b border-green-200 flex items-center justify-between">
          <span className="text-sm text-green-800">
            Template salvo! Deseja criar uma campanha com este template?
          </span>
          <button
            onClick={() => router.push(`/marketing/emails/new?templateId=${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            Criar Campanha
            <ArrowRight size={14} />
          </button>
        </div>
      )}

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
                  <div className="px-4 pb-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Botões detectados</p>
                    <div className="space-y-2">
                      {buttons.map((btn) => (
                        <div key={btn.index} className="border border-gray-200 rounded-lg p-2.5 bg-gray-50">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700 truncate">{btn.text || 'Botão'}</span>
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
                              {editingBtnIdx === btn.index ? 'Fechar' : 'Editar link'}
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
                                  const current = previewRef.current?.innerHTML ?? htmlContent;
                                  const updated = replaceButtonHref(current, btn.href, editBtnHref);
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

        {/* ── Right: Live editable preview ────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
          {/* Preview header */}
          <div className="shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Preview — clique no texto para editar
            </span>
          </div>

          {/* Preview area — brand-aware */}
          {effectiveBrand === "AIMO" ? (
            // AIMO: template e doc HTML completo (header + hero + footer
            // proprios). Renderiza em iframe via EmailPreview com
            // wrapAimoPreview (pass-through). Edicao inline indisponivel —
            // use IA / Conteudo / HTML cru no painel lateral.
            <div className="flex-1 overflow-auto bg-gray-100 p-4">
              {htmlContent ? (
                <EmailPreview
                  html={htmlContent}
                  branded
                  brand="AIMO"
                  className="h-full min-h-[600px]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Sparkles size={32} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Nenhum conteúdo ainda</p>
                  <p className="text-xs mt-1 text-gray-400">Use a aba IA ao lado para gerar seu email</p>
                </div>
              )}
              <p className="text-xs text-gray-400 text-center mt-3">
                Edição inline desabilitada para AIMO — use IA / Conteúdo / HTML cru ao lado.
              </p>
            </div>
          ) : (
            // BGP: chrome BGP hardcoded + contentEditable inline (legado).
            <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f4f4f4", padding: "20px 8px" }}>
              {/* Logo header */}
              <div style={{ maxWidth: 605, margin: "0 auto", paddingTop: 48, paddingBottom: 24, textAlign: "center" as const }}>
                <img src="https://email-editor-production.s3.amazonaws.com/images/665130/Logo_BGP_16%20(2).png" alt="BGP" style={{ maxWidth: 206, width: "100%", height: "auto", display: "inline-block" }} />
              </div>

              {/* White card body */}
              <div style={{
                maxWidth: 605, margin: "0 auto", backgroundColor: "#fff",
                borderRadius: "16px 16px 0 0",
                padding: "48px 60px 32px",
                fontFamily: "Montserrat, 'Trebuchet MS', sans-serif",
                fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: "#000",
              }}>
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
                    <p className="text-xs mt-1 text-gray-400">Use a aba IA ao lado para gerar seu email</p>
                  </div>
                )}
              </div>

              {/* Spacer */}
              <div style={{ maxWidth: 605, margin: "0 auto", backgroundColor: "#fff", height: 16 }} />

              {/* Social icons */}
              <div style={{ maxWidth: 605, margin: "0 auto", padding: "10px 0", textAlign: "center" as const }}>
                <a href="https://www.instagram.com/bertuzzigp/" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 10px" }}>
                  <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/instagram@2x.png" width={32} height="auto" alt="Instagram" style={{ display: "block", border: 0 }} />
                </a>
                <a href="https://www.youtube.com/@bertuzzigp" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 10px" }}>
                  <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/youtube@2x.png" width={32} height="auto" alt="YouTube" style={{ display: "block", border: 0 }} />
                </a>
                <a href="https://wa.me/5551992091726" target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", margin: "0 10px" }}>
                  <img src="https://app-rsrc.getbee.io/public/resources/social-networks-icon-sets/t-only-logo-color/whatsapp@2x.png" width={32} height="auto" alt="WhatsApp" style={{ display: "block", border: 0 }} />
                </a>
              </div>

              {/* Footer */}
              <div style={{ maxWidth: 605, margin: "0 auto", paddingBottom: 24, textAlign: "center" as const }}>
                <p style={{ fontFamily: "Montserrat, sans-serif", fontSize: 10, color: "#8c8c8c", lineHeight: 1.5, margin: 0 }}>
                  Enviado por www.bertuzzipatrimonial.com.br<br />
                  Av. Carlos Gomes, 75 - Sala 603 - Auxiliadora, Porto Alegre - RS, 90480-000<br />
                  Caso não queira mais receber estes e-mails, <span style={{ textDecoration: "underline" }}>cancele sua inscrição</span>.
                </p>
              </div>
            </div>
          )}
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
