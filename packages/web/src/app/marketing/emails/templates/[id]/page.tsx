"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import MarketingNav from "@/components/marketing/MarketingNav";
import EmailPreview from "@/components/marketing/EmailPreview";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
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

  useEffect(() => {
    if (isNew) return;
    async function fetchTemplate() {
      setLoading(true);
      try {
        const result = await api.get<{ data: EmailTemplate }>(`/email-templates/${id}`);
        setName(result.data.name);
        setSubject(result.data.subject);
        setHtmlContent(result.data.htmlContent || "");
      } catch (err) {
        console.error("Erro ao buscar template:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTemplate();
  }, [id, isNew]);

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.post<{ data: { id: string } }>("/email-templates", {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
        });
        router.push(`/marketing/emails/templates/${created.data.id}`);
      } else {
        await api.put(`/email-templates/${id}`, {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
        });
      }
    } catch (err) {
      console.error("Erro ao salvar template:", err);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="flex flex-col h-full overflow-auto">
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

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/marketing/emails/templates")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar para Templates
          </button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={!name.trim() || !subject.trim()}
            onClick={handleSave}
          >
            <Save size={14} />
            Salvar
          </Button>
        </div>

        {/* Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          {/* Left: form + HTML */}
          <div className="space-y-4 flex flex-col">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome do template
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Newsletter Padrão"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assunto padrão
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Novidades da semana"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conteúdo HTML
              </label>
              <textarea
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                placeholder="<html>&#10;  <body>&#10;    <h1>Seu email aqui</h1>&#10;  </body>&#10;</html>"
                className="w-full flex-1 min-h-[400px] px-3 py-2 text-sm font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                Editor visual (TipTap) será integrado em breve.
              </p>
            </div>
          </div>

          {/* Right: preview */}
          <div className="flex flex-col">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preview
            </label>
            <EmailPreview
              html={
                htmlContent ||
                "<p style='color:#999;text-align:center;padding:40px;font-family:sans-serif;'>Digite o HTML ao lado para ver o preview aqui</p>"
              }
              className="flex-1 min-h-[500px]"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
