"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Eye,
  X,
  Loader2,
  Check,
  Undo2,
  Redo2,
} from "lucide-react";

import { api } from "@/lib/api";
import Header from "@/components/layout/Header";
import MarketingNav from "@/components/marketing/MarketingNav";
import Button from "@/components/ui/Button";
import EmailPreview from "@/components/marketing/EmailPreview";
import { useEmailBuilder } from "@/components/marketing/email-builder/hooks/useEmailBuilder";
import EmailBuilderCanvas from "@/components/marketing/email-builder/EmailBuilderCanvas";
import SectionPalette from "@/components/marketing/email-builder/SectionPalette";
import PropertiesPanel from "@/components/marketing/email-builder/PropertiesPanel";
import AIBuilderChat from "@/components/marketing/email-builder/ai/AIBuilderChat";
import {
  EmailDocument,
  EmailSection,
  SectionType,
  SectionData,
  SectionStyle,
  DEFAULT_GLOBAL_STYLE,
} from "@/types/email-builder";
import { renderEmailHtml } from "@/components/marketing/email-builder/renderer/emailHtmlRenderer";

// ---------------------------------------------------------------------------
// Default section factories
// ---------------------------------------------------------------------------

function createDefaultSection(type: SectionType): EmailSection {
  const id = crypto.randomUUID();
  const baseStyle: SectionStyle = {
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
  };

  const dataMap: Record<SectionType, SectionData> = {
    header: {
      type: "header",
      alignment: "center",
      html: "<h1>Titulo</h1>",
      companyName: "",
    },
    text: {
      type: "text",
      html: "<p>Escreva seu texto aqui...</p>",
    },
    image: {
      type: "image",
      src: "",
      alt: "Imagem",
      width: "full",
      alignment: "center",
    },
    button: {
      type: "button",
      text: "Clique aqui",
      url: "#",
      alignment: "center",
      buttonColor: "#2563eb",
      textColor: "#ffffff",
      borderRadius: 6,
      size: "md",
    },
    divider: {
      type: "divider",
      color: "#e5e7eb",
      thickness: 1,
      style: "solid",
      width: 100,
    },
    columns: {
      type: "columns",
      layout: "50-50",
      columns: [{ html: "<p>Coluna 1</p>" }, { html: "<p>Coluna 2</p>" }],
      gap: 10,
    },
    social: {
      type: "social",
      alignment: "center",
      iconSize: 24,
      links: [
        { platform: "Facebook", url: "" },
        { platform: "Instagram", url: "" },
      ],
    },
    footer: {
      type: "footer",
      html: "<p>Empresa LTDA - Todos os direitos reservados</p>",
      alignment: "center",
    },
    spacer: {
      type: "spacer",
      height: 20,
    },
  };

  return { id, type, style: baseStyle, data: dataMap[type] };
}

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface EmailTemplateResponse {
  data: {
    id: string;
    name: string;
    subject: string;
    htmlContent: string;
    jsonContent?: string;
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  // -- Meta fields --
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");

  // -- UI state --
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // -- Builder state --
  const builder = useEmailBuilder();
  const {
    sections,
    globalStyle,
    selectedSectionId,
    selectedSection,
    compiledHtml,
    canUndo,
    canRedo,
    addSection,
    removeSection,
    moveSection,
    duplicateSection,
    updateSection,
    selectSection,
    updateGlobalStyle,
    setDocument,
    undo,
    redo,
  } = builder;

  // ── Load template ────────────────────────────────────────────────────────

  useEffect(() => {
    if (isNew) return;

    async function fetchTemplate() {
      setLoading(true);
      try {
        const result = await api.get<EmailTemplateResponse>(
          `/email-templates/${id}`
        );
        const tmpl = result.data;
        setName(tmpl.name);
        setSubject(tmpl.subject);

        // Try to load structured JSON content
        if (tmpl.jsonContent) {
          try {
            const doc: EmailDocument =
              typeof tmpl.jsonContent === "string"
                ? JSON.parse(tmpl.jsonContent)
                : tmpl.jsonContent;
            if (doc.sections && doc.globalStyle) {
              setDocument(doc);
              return;
            }
          } catch {
            // Fall through to HTML import
          }
        }

        // Fallback: wrap raw HTML in a single text section
        if (tmpl.htmlContent) {
          const fallbackSection: EmailSection = {
            id: crypto.randomUUID(),
            type: "text",
            style: {
              paddingTop: 16,
              paddingBottom: 16,
              paddingLeft: 16,
              paddingRight: 16,
            },
            data: { type: "text", html: tmpl.htmlContent },
          };
          setDocument({
            sections: [fallbackSection],
            globalStyle: { ...DEFAULT_GLOBAL_STYLE },
          });
        }
      } catch (err) {
        console.error("Erro ao buscar template:", err);
        showToast("Erro ao carregar template");
      } finally {
        setLoading(false);
      }
    }

    fetchTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  // ── Toast helper ─────────────────────────────────────────────────────────

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Ctrl+S) ─────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, name, subject, sections, globalStyle]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) {
      showToast("Preencha o nome e o assunto do template");
      return;
    }

    setSaving(true);
    try {
      const htmlContent = renderEmailHtml({ sections, globalStyle });
      const jsonContent = JSON.stringify({ sections, globalStyle });

      if (isNew) {
        const created = await api.post<{ data: { id: string } }>(
          "/email-templates",
          {
            name: name.trim(),
            subject: subject.trim(),
            htmlContent,
            jsonContent,
          }
        );
        router.push(`/marketing/emails/templates/${created.data.id}`);
        showToast("Template criado com sucesso");
      } else {
        await api.put(`/email-templates/${id}`, {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
          jsonContent,
        });
        showToast("Template salvo");
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
      showToast("Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  // ── Add section handlers ─────────────────────────────────────────────────

  const handleAddSection = useCallback(
    (type: SectionType, atIndex?: number) => {
      const section = createDefaultSection(type);
      addSection(section, atIndex);
    },
    [addSection]
  );

  const handleAddPrebuilt = useCallback(
    (prebuiltSections: EmailSection[]) => {
      prebuiltSections.forEach((s) => {
        addSection(s);
      });
    },
    [addSection]
  );

  // ── Canvas update handler (bridge to builder) ────────────────────────────

  const handleUpdateSection = useCallback(
    (sectionId: string, data: Partial<SectionData>, style?: Partial<SectionStyle>) => {
      updateSection(sectionId, Object.keys(data).length > 0 ? data : undefined, style);
    },
    [updateSection]
  );

  // ── Properties panel handler (adapts to PropertiesPanel interface) ───────

  const handlePropertiesUpdate = useCallback(
    (data: Partial<SectionData>, style?: Partial<SectionStyle>) => {
      if (!selectedSectionId) return;
      updateSection(
        selectedSectionId,
        Object.keys(data).length > 0 ? data : undefined,
        style
      );
    },
    [selectedSectionId, updateSection]
  );

  // ── AI integration ───────────────────────────────────────────────────────

  const handleAIApplyHtml = useCallback(
    (html: string) => {
      // Replace all sections with a single text section containing AI HTML
      const aiSection: EmailSection = {
        id: crypto.randomUUID(),
        type: "text",
        style: {
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
        },
        data: { type: "text", html },
      };
      setDocument({
        sections: [aiSection],
        globalStyle: { ...globalStyle },
      });
    },
    [setDocument, globalStyle]
  );

  const handleSubjectGenerated = useCallback(
    (generatedSubject: string) => {
      setSubject(generatedSubject);
    },
    []
  );

  const isEmpty = sections.length === 0;
  const canSave = name.trim().length > 0 && subject.trim().length > 0;

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto bg-gray-50">
        <Header
          title="Template"
          breadcrumb={["Marketing", "Emails", "Templates", "..."]}
        />
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando template...
        </div>
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      <Header
        title={isNew ? "Novo Template" : `Editar: ${name}`}
        breadcrumb={[
          "Marketing",
          "Emails",
          "Templates",
          isNew ? "Novo" : name,
        ]}
      />
      <MarketingNav />

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
        {/* Left: back + name */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/marketing/emails/templates")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
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
            className="text-sm font-medium text-gray-900 bg-transparent border-none outline-none
                       placeholder:text-gray-400 focus:ring-0 w-48"
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canUndo}
            onClick={undo}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRedo}
            onClick={redo}
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 size={14} />
          </Button>

          <div className="h-5 w-px bg-gray-200 mx-1" />

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPreview(true)}
          >
            <Eye size={14} />
            Preview
          </Button>

          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!canSave}
            onClick={handleSave}
          >
            <Save size={14} />
            Salvar
          </Button>
        </div>
      </div>

      {/* ── Subject input bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0">
          Assunto
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex: Novidades da semana"
          className="flex-1 text-sm border-none outline-none bg-transparent
                     placeholder:text-gray-400 focus:ring-0"
        />
      </div>

      {/* ── 3-column body ────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: section palette */}
        <SectionPalette
          onAddSection={handleAddSection}
          onAddPrebuilt={handleAddPrebuilt}
        />

        {/* Center: canvas + AI chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EmailBuilderCanvas
            sections={sections}
            selectedSectionId={selectedSectionId}
            globalStyle={globalStyle}
            onSelectSection={selectSection}
            onUpdateSection={handleUpdateSection}
            onRemoveSection={removeSection}
            onDuplicateSection={duplicateSection}
            onMoveSection={moveSection}
            onAddSection={handleAddSection}
          />

          {/* AI chat bar at bottom */}
          <AIBuilderChat
            currentHtml={compiledHtml}
            onApplyHtml={handleAIApplyHtml}
            onSubjectGenerated={handleSubjectGenerated}
            isEmpty={isEmpty}
          />
        </div>

        {/* Right: properties panel */}
        <PropertiesPanel
          section={selectedSection}
          globalStyle={globalStyle}
          onUpdateSection={handlePropertiesUpdate}
          onUpdateGlobalStyle={updateGlobalStyle}
        />
      </div>

      {/* ── Preview modal ────────────────────────────────────────────── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-3xl h-[85vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">
                Preview do Email
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <EmailPreview
                html={
                  compiledHtml ||
                  "<p style='color:#999;text-align:center;padding:60px 20px;font-family:sans-serif;'>Nenhum conteudo ainda.</p>"
                }
                className="h-full min-h-[500px] rounded-lg border border-gray-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ───────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check size={14} className="text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
