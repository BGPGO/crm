"use client";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export default function SendWhatsAppTemplateNode({ config, onChange }: NodeConfigProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Mensagem
        </label>
        <textarea
          value={config.message || ""}
          onChange={(e) => onChange({ ...config, message: e.target.value })}
          placeholder="Digite a mensagem fixa que será enviada..."
          rows={4}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
      </div>
      <p className="text-xs text-gray-400">
        Variáveis: {"{nome}"}, {"{empresa}"}, {"{telefone}"}
      </p>
    </div>
  );
}
