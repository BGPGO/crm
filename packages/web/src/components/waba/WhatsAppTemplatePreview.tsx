"use client";

import { Image as ImageIcon, Video, FileText, ExternalLink } from "lucide-react";

interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

interface PreviewTemplate {
  headerType?: string | null;
  headerContent?: string | null;
  body?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
  bodyExamples?: string[] | string[][] | null;
}

interface Props {
  template: PreviewTemplate;
  /** Override de variáveis (ex: {"{{1}}": "Oliver"}). Se não passado, usa bodyExamples. */
  sampleParams?: Record<string, string>;
  /** Esconde o título "Preview WhatsApp". */
  hideTitle?: boolean;
}

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{\d+\}\}/g);
  if (!matches) return [];
  return [...new Set(matches)].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    return numA - numB;
  });
}

function isHttpUrl(value: string | null | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

function normalizeBodyExamples(raw: PreviewTemplate["bodyExamples"]): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  // CloudWaTemplate.bodyExamples vem como string[][] (Meta) ou string[] (uso simplificado).
  if (Array.isArray(raw[0])) return raw[0] as string[];
  return raw as string[];
}

export default function WhatsAppTemplatePreview({ template, sampleParams, hideTitle }: Props) {
  const body = template.body ?? "";
  const examples = normalizeBodyExamples(template.bodyExamples);
  const variables = extractVariables(body);
  const previewBody = variables.reduce((text, v, i) => {
    const override = sampleParams?.[v];
    const fallback = examples[i] || `[exemplo ${i + 1}]`;
    return text.replace(v, override ?? fallback);
  }, body);

  const headerType = (template.headerType || "").toUpperCase();
  const headerContent = template.headerContent ?? "";
  const buttons = template.buttons || [];

  return (
    <div className="flex flex-col items-center">
      {!hideTitle && <p className="text-xs font-medium text-gray-500 mb-3">Preview WhatsApp</p>}
      <div className="w-full max-w-[300px] bg-[#e5ddd5] dark:bg-gray-800 rounded-xl p-4">
        {/* Message bubble */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm overflow-hidden">
          {/* Header IMAGE — usa <img> real se headerContent for URL, senão ícone */}
          {headerType === "IMAGE" && (
            isHttpUrl(headerContent) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerContent}
                alt="Header"
                className="w-full h-40 object-cover bg-gray-100"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  el.parentElement?.classList.add("h-32", "bg-gray-100", "flex", "items-center", "justify-center");
                }}
              />
            ) : (
              <div className="bg-gray-100 dark:bg-gray-600 h-32 flex items-center justify-center">
                <ImageIcon size={32} className="text-gray-400" />
              </div>
            )
          )}
          {headerType === "VIDEO" && (
            isHttpUrl(headerContent) ? (
              <video src={headerContent} controls className="w-full h-40 object-cover bg-black" />
            ) : (
              <div className="bg-gray-100 dark:bg-gray-600 h-32 flex items-center justify-center">
                <Video size={32} className="text-gray-400" />
              </div>
            )
          )}
          {headerType === "DOCUMENT" && (
            <div className="bg-gray-100 dark:bg-gray-600 h-16 flex items-center justify-center gap-2">
              <FileText size={20} className="text-gray-400" />
              <span className="text-xs text-gray-500">
                {isHttpUrl(headerContent) ? headerContent.split("/").pop() : "documento.pdf"}
              </span>
            </div>
          )}
          {headerType === "TEXT" && headerContent && (
            <div className="px-3 pt-2">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {headerContent}
              </p>
            </div>
          )}

          {/* Body */}
          <div className="px-3 py-2">
            <p className="text-[13px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {previewBody || (
                <span className="text-gray-400 italic">Corpo da mensagem...</span>
              )}
            </p>
          </div>

          {/* Footer */}
          {template.footer && (
            <div className="px-3 pb-2">
              <p className="text-[11px] text-gray-500">{template.footer}</p>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-3 pb-1.5 flex justify-end">
            <span className="text-[10px] text-gray-400">12:00</span>
          </div>

          {/* Buttons */}
          {buttons.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-600">
              {buttons.map((btn, i) => (
                <button
                  key={i}
                  className="w-full py-2 text-center text-[13px] text-petrol-500 font-medium border-t border-gray-100 dark:border-gray-600 first:border-t-0 flex items-center justify-center gap-1"
                  type="button"
                >
                  {btn.type === "URL" && <ExternalLink size={12} />}
                  {btn.text || `Botão ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
