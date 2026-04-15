"use client";

import { useEffect, useState } from "react";
import { Eye, X, Sparkles, FileText } from "lucide-react";
import EmailPreview from "@/components/marketing/EmailPreview";
import { api } from "@/lib/api";

interface SendEmailNodeProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface EmailTemplateSummary {
  id: string;
  name: string;
  subject: string;
  isActive?: boolean;
}

interface EmailTemplateFull extends EmailTemplateSummary {
  htmlContent: string;
}

export default function SendEmailNode({ config, onChange }: SendEmailNodeProps) {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const mode = config.isAIGenerated || !config.templateId ? "ai" : "template";

  // Load templates list once
  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    api
      .get<{ data: EmailTemplateSummary[] }>("/email-templates")
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.data || []);
      })
      .catch(() => {
        /* silent — user pode colar ID manual se quiser */
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Quando user troca o template, puxa o subject atual do template pra mostrar
  useEffect(() => {
    if (mode !== "template" || !config.templateId) return;
    const picked = templates.find((t) => t.id === config.templateId);
    if (!picked) return;
    // Só atualiza o label local — o subject real é lido do template no envio
    // (automationActions.ts:237). Não sobrescrevemos config.subject porque é
    // campo que só importa no modo AI.
    // No-op: o display do subject vem do `picked.subject` diretamente no JSX.
  }, [config.templateId, templates, mode]);

  const openPreview = async () => {
    if (!config.templateId) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const res = await api.get<{ data: EmailTemplateFull }>(
        `/email-templates/${config.templateId}`
      );
      setPreviewHtml(res.data?.htmlContent || "");
      setPreviewSubject(res.data?.subject || "");
    } catch {
      setPreviewHtml("<p style='color:#999;text-align:center;padding:40px;'>Falha ao carregar preview</p>");
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === config.templateId);

  return (
    <div className="space-y-3">
      {/* Modo de geração (AI vs Template) */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Modo de envio</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...config, isAIGenerated: false })}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              mode === "template"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <FileText size={14} />
            Template salvo
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...config, isAIGenerated: true, templateId: undefined })}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              mode === "ai"
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Sparkles size={14} />
            IA gera na hora
          </button>
        </div>
      </div>

      {/* ─── Modo Template ─── */}
      {mode === "template" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Template de email</label>
            <select
              value={config.templateId || ""}
              onChange={(e) => onChange({ ...config, templateId: e.target.value || undefined })}
              disabled={loadingList}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">
                {loadingList ? "Carregando templates..." : "— Selecione um template —"}
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assunto vem do template — mostramos só como leitura */}
          {selectedTemplate && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div>
                <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Assunto do template</p>
                <p className="text-sm text-gray-700 mt-0.5 break-words">
                  {selectedTemplate.subject || <span className="italic text-gray-400">(sem assunto)</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={openPreview}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
              >
                <Eye size={12} />
                Ver preview do email
              </button>
            </div>
          )}
        </>
      )}

      {/* ─── Modo AI ─── */}
      {mode === "ai" && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Assunto do email</label>
            <input
              type="text"
              value={config.subject || ""}
              onChange={(e) => onChange({ ...config, subject: e.target.value })}
              placeholder="Ex: Clareza financeira para o seu negócio"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Instruções para a IA</label>
            <textarea
              value={config.prompt || ""}
              onChange={(e) => onChange({ ...config, prompt: e.target.value })}
              placeholder="Ex: Apresentação formal. O que o GoBI faz, CTA para agendar diagnóstico."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              A IA gera o conteúdo baseado nestas instruções + dados do contato (nome, setor, empresa).
            </p>
          </div>
        </>
      )}

      {/* Label from seed (se houver) */}
      {config._label && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">{config._label}</p>
        </div>
      )}

      {/* Preview Modal */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  Preview — {selectedTemplate?.name}
                </p>
                {previewSubject && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">Assunto: {previewSubject}</p>
                )}
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                aria-label="Fechar preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              {previewLoading ? (
                <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
                  Carregando preview...
                </div>
              ) : (
                <EmailPreview
                  html={previewHtml || "<p>Sem conteúdo</p>"}
                  className="h-[600px]"
                  branded
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
