"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import MarketingNav from "@/components/marketing/MarketingNav";
import EmailPreview from "@/components/marketing/EmailPreview";
import {
  ArrowLeft,
  Save,
  Loader2,
  Sparkles,
  Send,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";

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
  const [toast, setToast] = useState("");

  // AI state
  const [aiMode, setAiMode] = useState<"generate" | "improve">("generate");
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("profissional");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Load template
  useEffect(() => {
    if (isNew) return;
    setLoading(true);
    api
      .get<{ data: { id: string; name: string; subject: string; htmlContent: string } }>(
        `/email-templates/${id}`
      )
      .then((res) => {
        setName(res.data.name);
        setSubject(res.data.subject);
        setHtmlContent(res.data.htmlContent || "");
      })
      .catch(() => showToast("Erro ao carregar template"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // Update AI mode based on content
  useEffect(() => {
    setAiMode(htmlContent.trim().length > 20 ? "improve" : "generate");
  }, [htmlContent]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // Save
  async function handleSave() {
    if (!name.trim() || !subject.trim()) {
      showToast("Preencha nome e assunto");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post<{ data: { id: string } }>("/email-templates", {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
        });
        router.push(`/marketing/emails/templates/${res.data.id}`);
        showToast("Template criado!");
      } else {
        await api.put(`/email-templates/${id}`, {
          name: name.trim(),
          subject: subject.trim(),
          htmlContent,
        });
        showToast("Template salvo!");
      }
    } catch {
      showToast("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // AI Generate
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
          audience: "clientes da Bertuzzi Patrimonial - consultoria patrimonial e sucessoria",
        }
      );
      setHtmlContent(res.data.htmlContent);
      setSubject(res.data.subject);
      setAiTopic("");
      showToast("Email gerado com IA!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setAiError("Erro ao gerar: " + msg);
    } finally {
      setAiLoading(false);
    }
  }

  // AI Improve
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
      showToast("Alteracao aplicada!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setAiError("Erro: " + msg);
      setAiInstruction(instruction);
    } finally {
      setAiLoading(false);
    }
  }

  const quickChips = [
    "Use cores da marca BGP (azul e branco)",
    "Adicione um botao de CTA",
    "Torne mais persuasivo",
    "Adicione rodape com dados da empresa",
    "Melhore o design visual",
    "Tom mais consultivo",
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Template" breadcrumb={["Marketing", "Emails", "Templates", "..."]} />
        <MarketingNav />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" />
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={isNew ? "Novo Template" : `Editar: ${name}`}
        breadcrumb={["Marketing", "Emails", "Templates", isNew ? "Novo" : name]}
      />
      <MarketingNav />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/marketing/emails/templates")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
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
            className="text-sm font-medium text-gray-900 bg-transparent border-none outline-none w-52 placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !subject.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </button>
      </div>

      {/* Subject */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assunto</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex: Novidades da semana"
          className="flex-1 text-sm border-none outline-none bg-transparent placeholder:text-gray-400"
        />
      </div>

      {/* Main: Editor + Preview */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: HTML + AI */}
        <div className="w-1/2 flex flex-col border-r border-gray-200">
          <div className="flex-1 overflow-auto">
            <textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder={"Cole ou escreva o HTML do email aqui,\nou use a IA abaixo para gerar..."}
              className="w-full h-full p-4 text-sm font-mono text-gray-800 bg-gray-50 border-none outline-none resize-none"
              spellCheck={false}
            />
          </div>

          {/* AI */}
          <div className="border-t border-gray-200 bg-white">
            {aiMode === "generate" ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-500">
                    <Sparkles size={12} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Gerar email com IA</span>
                </div>
                <textarea
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="Sobre o que e o email? Ex: Promocao de consultoria patrimonial..."
                  rows={2}
                  disabled={aiLoading}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                />
                <div className="flex gap-3">
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    disabled={aiLoading}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                  >
                    <option value="profissional">Profissional</option>
                    <option value="casual">Casual</option>
                    <option value="urgente">Urgente</option>
                    <option value="amigavel">Amigavel</option>
                  </select>
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiTopic.trim() || aiLoading}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    {aiLoading ? "Gerando..." : "Gerar"}
                  </button>
                </div>
                {aiError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{aiError}</p>}
              </div>
            ) : (
              <div className="p-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {quickChips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleAiImprove(chip)}
                      disabled={aiLoading}
                      className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300">
                  <Sparkles size={14} className="text-blue-500 shrink-0" />
                  <input
                    type="text"
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAiImprove(); } }}
                    placeholder={aiLoading ? "Aplicando..." : "Diga o que quer mudar..."}
                    disabled={aiLoading}
                    className="flex-1 text-sm bg-transparent border-none outline-none placeholder:text-gray-400 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleAiImprove()}
                    disabled={!aiInstruction.trim() || aiLoading}
                    className="flex items-center justify-center w-7 h-7 rounded-md text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  </button>
                </div>
                {aiError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{aiError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 flex flex-col bg-gray-100">
          <div className="px-4 py-2 bg-white border-b border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Preview</span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <EmailPreview
              html={htmlContent || '<div style="color:#999;text-align:center;padding:80px 20px;font-family:Arial,sans-serif;"><p style="font-size:16px;">O preview aparecera aqui</p><p style="font-size:13px;">Use a IA para gerar um email ou escreva o HTML ao lado</p></div>'}
              className="h-full min-h-[500px]"
            />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm rounded-lg shadow-lg">
          <Check size={14} className="text-green-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
