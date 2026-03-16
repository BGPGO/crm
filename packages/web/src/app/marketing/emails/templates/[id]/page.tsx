"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  ArrowLeft,
  Save,
  Loader2,
  Sparkles,
  Send,
  Check,
  Image as ImageIcon,
  Plus,
  Trash2,
  Code,
  Eye,
} from "lucide-react";
import { api } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractImages(html: string): { src: string; alt: string }[] {
  const imgs: { src: string; alt: string }[] = [];
  const regex = /<img[^>]+src=["']([^"']*)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    imgs.push({ src: match[1] || "", alt: match[2] || "" });
  }
  return imgs;
}

function replaceImageSrc(html: string, oldSrc: string, newSrc: string): string {
  return html.replace(
    new RegExp(`(src=["'])${oldSrc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(["'])`, "g"),
    `$1${newSrc}$2`
  );
}

function addImageToHtml(html: string, src: string): string {
  const imgTag = `<div style="text-align:center;margin:20px 0;"><img src="${src}" alt="Imagem" style="max-width:100%;height:auto;display:block;margin:0 auto;" /></div>`;
  // Insert before </body> or at end
  if (html.includes("</body>")) {
    return html.replace("</body>", imgTag + "</body>");
  }
  return html + imgTag;
}

function removeImageFromHtml(html: string, src: string): string {
  // Remove the img tag and its wrapping div if present
  const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let result = html.replace(
    new RegExp(`<div[^>]*>\\s*<img[^>]*src=["']${escaped}["'][^>]*/?>\\s*</div>`, "gi"),
    ""
  );
  // Fallback: remove just the img tag
  result = result.replace(
    new RegExp(`<img[^>]*src=["']${escaped}["'][^>]*/?>`, "gi"),
    ""
  );
  return result;
}

function extractTextContent(html: string): string {
  // Strip HTML tags, decode entities, clean up whitespace
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const [showHtml, setShowHtml] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");

  // AI state
  const [aiMode, setAiMode] = useState<"generate" | "improve">("generate");
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("profissional");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Preview ref for contentEditable
  const previewRef = useRef<HTMLDivElement>(null);
  const previewKeyRef = useRef(0);

  // Extracted data
  const images = useMemo(() => extractImages(htmlContent), [htmlContent]);
  const textContent = useMemo(() => extractTextContent(htmlContent), [htmlContent]);

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

  // Update AI mode
  useEffect(() => {
    setAiMode(htmlContent.trim().length > 20 ? "improve" : "generate");
  }, [htmlContent]);

  // Sync preview when htmlContent changes externally (AI, image changes)
  useEffect(() => {
    previewKeyRef.current += 1;
  }, [htmlContent]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── Preview editing ─────────────────────────────────────────────────────────

  const handlePreviewBlur = useCallback(() => {
    if (!previewRef.current) return;
    const newHtml = previewRef.current.innerHTML;
    if (newHtml !== htmlContent) {
      setHtmlContent(newHtml);
    }
  }, [htmlContent]);

  // ── Image management ────────────────────────────────────────────────────────

  function handleImageUrlChange(oldSrc: string, newSrc: string) {
    setHtmlContent((prev) => replaceImageSrc(prev, oldSrc, newSrc));
  }

  function handleAddImage() {
    if (!newImageUrl.trim()) return;
    setHtmlContent((prev) => addImageToHtml(prev, newImageUrl.trim()));
    setNewImageUrl("");
    showToast("Imagem adicionada!");
  }

  function handleRemoveImage(src: string) {
    setHtmlContent((prev) => removeImageFromHtml(prev, src));
    showToast("Imagem removida");
  }

  // ── Save ────────────────────────────────────────────────────────────────────

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

  // ── AI Generate ─────────────────────────────────────────────────────────────

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
      setAiError("Erro ao gerar: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setAiLoading(false);
    }
  }

  // ── AI Improve ──────────────────────────────────────────────────────────────

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
      setAiError("Erro: " + (err instanceof Error ? err.message : "Erro desconhecido"));
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

  // ── Loading ─────────────────────────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHtml(!showHtml)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              showHtml
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {showHtml ? <Eye size={12} /> : <Code size={12} />}
            {showHtml ? "Visual" : "HTML"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !subject.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
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

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left panel: Content + Images + AI */}
        <div className="w-[380px] shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          <div className="flex-1 overflow-y-auto">

            {/* Text content (read-only summary) or HTML editor */}
            {showHtml ? (
              <div className="flex-1">
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Codigo HTML</span>
                </div>
                <textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  placeholder="Cole ou escreva o HTML aqui..."
                  className="w-full min-h-[300px] p-4 text-xs font-mono text-gray-700 bg-gray-50 border-none outline-none resize-none"
                  spellCheck={false}
                />
              </div>
            ) : (
              <div>
                <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conteudo do email</span>
                </div>
                <div className="p-4">
                  {textContent ? (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{textContent}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Nenhum conteudo ainda. Use a IA abaixo para gerar.</p>
                  )}
                </div>
              </div>
            )}

            {/* Images section */}
            <div className="border-t border-gray-100">
              <div className="px-4 py-2 bg-gray-50 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Imagens ({images.length})
                </span>
              </div>

              {images.length > 0 && (
                <div className="p-3 space-y-2">
                  {images.map((img, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="w-12 h-12 shrink-0 rounded bg-gray-200 overflow-hidden flex items-center justify-center">
                        {img.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img.src} alt={img.alt} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon size={16} className="text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={img.src}
                          onChange={(e) => handleImageUrlChange(img.src, e.target.value)}
                          placeholder="URL da imagem"
                          className="w-full text-xs px-2 py-1 border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveImage(img.src)}
                        className="shrink-0 p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add image */}
              <div className="p-3 pt-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddImage(); }}
                    placeholder="URL da nova imagem..."
                    className="flex-1 text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400"
                  />
                  <button
                    onClick={handleAddImage}
                    disabled={!newImageUrl.trim()}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus size={12} />
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* AI section (bottom, always visible) */}
          <div className="border-t border-gray-200 bg-white shrink-0">
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
                <div className="flex gap-2">
                  <select
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    disabled={aiLoading}
                    className="flex-1 px-2 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
                  >
                    <option value="profissional">Profissional</option>
                    <option value="casual">Casual</option>
                    <option value="urgente">Urgente</option>
                    <option value="amigavel">Amigavel</option>
                  </select>
                  <button
                    onClick={handleAiGenerate}
                    disabled={!aiTopic.trim() || aiLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg hover:from-blue-700 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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

        {/* Right: Editable Preview */}
        <div className="flex-1 flex flex-col bg-gray-100">
          <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Preview — clique no texto para editar
            </span>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div
              className="mx-auto bg-white rounded-lg shadow-sm border border-gray-200"
              style={{ maxWidth: 640 }}
            >
              {htmlContent ? (
                <div
                  key={previewKeyRef.current}
                  ref={previewRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={handlePreviewBlur}
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                  className="outline-none min-h-[400px] cursor-text [&_*]:outline-none focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:rounded-lg"
                  style={{ wordBreak: "break-word" }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Sparkles size={32} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium">Nenhum conteudo ainda</p>
                  <p className="text-xs mt-1">Use a IA ao lado para gerar seu email</p>
                </div>
              )}
            </div>
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
