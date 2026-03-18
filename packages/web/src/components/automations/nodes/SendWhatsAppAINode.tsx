"use client";

import { Sparkles } from "lucide-react";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function SendWhatsAppAINode({ config, onChange }: NodeConfigProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Objetivo
        </label>
        <input
          type="text"
          value={config.objective || ""}
          onChange={(e) => onChange({ ...config, objective: e.target.value })}
          placeholder="Ex: Remarcar reunião"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Prompt para IA
        </label>
        <textarea
          value={config.prompt || ""}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Ex: O lead deu no-show na reunião. Tente remarcar de forma amigável."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
      </div>
      <div className="flex items-start gap-2 bg-green-50 rounded-lg p-2.5">
        <Sparkles size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-green-700">
          A IA vai gerar uma mensagem personalizada baseada neste prompt e no contexto do lead.
        </p>
      </div>
    </div>
  );
}
