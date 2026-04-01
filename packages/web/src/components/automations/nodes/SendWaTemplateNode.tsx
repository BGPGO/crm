"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface CloudTemplate {
  id: string;
  name: string;
  language: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
  body: string;
  category: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  APPROVED: { label: "Aprovado", color: "bg-green-100 text-green-700" },
  PENDING: { label: "Pendente", color: "bg-yellow-100 text-yellow-700" },
  REJECTED: { label: "Rejeitado", color: "bg-red-100 text-red-700" },
  PAUSED: { label: "Pausado", color: "bg-gray-100 text-gray-600" },
  DISABLED: { label: "Desativado", color: "bg-gray-100 text-gray-600" },
};

export default function SendWaTemplateNode({ config, onChange }: NodeConfigProps) {
  const [templates, setTemplates] = useState<CloudTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await api.get<{ data: CloudTemplate[] }>("/whatsapp/cloud/templates");
        setTemplates(res.data || []);
      } catch {
        // API might not be ready
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, []);

  const selectedTemplate = templates.find((t) => t.name === config.templateName);

  return (
    <div className="space-y-3">
      {/* Template selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Template WABA
        </label>
        {loading ? (
          <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
        ) : templates.length === 0 ? (
          <p className="text-xs text-gray-400">
            Nenhum template encontrado. Crie templates em WABA &gt; Templates.
          </p>
        ) : (
          <select
            value={config.templateName || ""}
            onChange={(e) => {
              const tpl = templates.find((t) => t.name === e.target.value);
              onChange({
                ...config,
                templateName: e.target.value,
                language: tpl?.language || config.language || "pt_BR",
                _label: tpl ? `${tpl.name} (${tpl.status})` : "",
                _templateStatus: tpl?.status || "",
              });
            }}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
          >
            <option value="">Selecionar template...</option>
            {templates.map((t) => {
              const st = statusConfig[t.status] || statusConfig.PENDING;
              return (
                <option key={t.id} value={t.name}>
                  {t.name} — {st.label}
                </option>
              );
            })}
          </select>
        )}
      </div>

      {/* Status badge */}
      {selectedTemplate && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Status:</span>
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              statusConfig[selectedTemplate.status]?.color || "bg-gray-100 text-gray-600"
            }`}
          >
            {statusConfig[selectedTemplate.status]?.label || selectedTemplate.status}
          </span>
        </div>
      )}

      {/* Language */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Idioma
        </label>
        <input
          type="text"
          value={config.language || "pt_BR"}
          onChange={(e) => onChange({ ...config, language: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Padrão: pt_BR (raramente precisa alterar)
        </p>
      </div>

      {/* Preview */}
      {selectedTemplate?.body && (
        <div className="pt-2 border-t border-gray-100">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Preview do template
          </label>
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-200">
            {selectedTemplate.body}
          </div>
        </div>
      )}

      {/* Template name in monospace */}
      {config.templateName && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            Template: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px] font-mono">{config.templateName}</code>
          </p>
        </div>
      )}
    </div>
  );
}
