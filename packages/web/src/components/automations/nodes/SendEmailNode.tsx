"use client";

interface SendEmailNodeProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function SendEmailNode({ config, onChange }: SendEmailNodeProps) {
  return (
    <div className="space-y-3">
      {/* Subject */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Assunto do email
        </label>
        <input
          type="text"
          value={config.subject || ""}
          onChange={(e) => onChange({ ...config, subject: e.target.value })}
          placeholder="Ex: Clareza financeira para o seu negócio"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Template or AI-generated */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Modo de geração
        </label>
        <select
          value={config.isAIGenerated ? "ai" : config.templateId ? "template" : "ai"}
          onChange={(e) => {
            if (e.target.value === "ai") {
              onChange({ ...config, isAIGenerated: true, templateId: undefined });
            } else {
              onChange({ ...config, isAIGenerated: false });
            }
          }}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ai">IA gera o conteúdo</option>
          <option value="template">Template fixo</option>
        </select>
      </div>

      {/* AI prompt */}
      {(config.isAIGenerated || !config.templateId) && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Instruções para a IA
          </label>
          <textarea
            value={config.prompt || ""}
            onChange={(e) => onChange({ ...config, prompt: e.target.value })}
            placeholder="Ex: Apresentação formal. O que o GoBI faz, CTA para agendar diagnóstico."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            A IA vai gerar o conteúdo do email baseado nessas instruções e nos dados do contato (nome, setor, empresa).
          </p>
        </div>
      )}

      {/* Template ID (if not AI) */}
      {!config.isAIGenerated && config.templateId !== undefined && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            ID do template de email
          </label>
          <input
            type="text"
            value={config.templateId || ""}
            onChange={(e) => onChange({ ...config, templateId: e.target.value })}
            placeholder="ID do EmailTemplate"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Label (human-readable, from seed) */}
      {config._label && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            {config._label}
          </p>
        </div>
      )}
    </div>
  );
}
