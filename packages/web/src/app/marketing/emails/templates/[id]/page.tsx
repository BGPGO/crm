"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import MarketingNav from "@/components/marketing/MarketingNav";
import EmailEditor from "@/components/marketing/EmailEditor";
import EmailPreview from "@/components/marketing/EmailPreview";
import AIEmailChat from "@/components/marketing/AIEmailChat";
import {
  ArrowLeft,
  Save,
  Eye,
  EyeOff,
  X,
  Loader2,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
}

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    if (isNew) return;
    async function fetchTemplate() {
      setLoading(true);
      try {
        const result = await api.get<{ data: EmailTemplate }>(
          `/email-templates/${id}`
        );
        setName(result.data.name);
        setSubject(result.data.subject);
        setHtmlContent(result.data.htmlContent || "");
      } catch (err) {
        console.error("Erro ao buscar template:", err);
        showToast("Erro ao carregar template");
      } finally {
        setLoading(false);
      }
    }
    fetchTemplate();
  }, [id, isNew]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.post<{ data: { id: string } }>(
          "/email-templates",
          {
            name: name.trim(),
            subject: subject.trim(),
            htmlContent,
          }
        );
        router.push(`/marketing/emails/templates/${created.data.id}`);
        showToast("Template criado com sucesso");
      } else {
        await api.put(`/email-templates/${id}`, {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
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

  const handleAIApply = useCallback((newHtml: string) => {
    setHtmlContent(newHtml);
    setEditorKey((k) => k + 1);
  }, []);

  const handleSubjectGenerated = useCallback((generatedSubject: string) => {
    setSubject(generatedSubject);
  }, []);

  const handleEditorChange = useCallback((html: string) => {
    setHtmlContent(html);
  }, []);

  // ---------- Loading state ----------
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

  // ---------- Main layout ----------
  const canSave = name.trim().length > 0 && subject.trim().length > 0;

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

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <button
          onClick={() => router.push("/marketing/emails/templates")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPreview ? "Fechar Preview" : "Preview"}
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

      {/* Body wrapper */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Name + Subject inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-4 bg-white border-b border-gray-200">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Nome do template
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Newsletter Semanal"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                Assunto do email
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Novidades da semana"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>
          </div>

          {/* Visual editor */}
          <div className="flex-1 overflow-auto px-6 py-4">
            <EmailEditor
              key={editorKey}
              content={htmlContent}
              onChange={handleEditorChange}
              className="h-full min-h-[400px] rounded-lg border border-gray-200 bg-white shadow-sm"
            />
          </div>

          {/* AI Chat bar at bottom */}
          <div className="border-t border-gray-200 bg-white">
            <AIEmailChat
              currentHtml={htmlContent}
              onApply={handleAIApply}
              onSubjectGenerated={handleSubjectGenerated}
            />
          </div>
        </div>

        {/* Preview slide-over panel */}
        {showPreview && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/20 z-10 lg:hidden"
              onClick={() => setShowPreview(false)}
            />

            {/* Panel */}
            <div className="absolute right-0 top-0 bottom-0 z-20 w-full max-w-lg bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">
                  Preview do Email
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <EmailPreview
                  html={
                    htmlContent ||
                    "<p style='color:#999;text-align:center;padding:60px 20px;font-family:sans-serif;'>Nenhum conteudo ainda. Use o editor ou o chat com IA para criar seu email.</p>"
                  }
                  className="h-full min-h-[500px] rounded-lg border border-gray-100"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check size={14} className="text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
