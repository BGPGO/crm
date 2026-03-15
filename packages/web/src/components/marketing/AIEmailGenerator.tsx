"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface AIEmailGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (result: { subject: string; htmlContent: string }) => void;
}

interface AIGenerateResponse {
  subject: string;
  htmlContent: string;
}

export default function AIEmailGenerator({
  isOpen,
  onClose,
  onGenerate,
}: AIEmailGeneratorProps) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("profissional");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIGenerateResponse | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await api.post<{ data: AIGenerateResponse }>(
        "/ai/generate-email",
        {
          topic: topic.trim(),
          tone,
          audience: audience.trim() || undefined,
        }
      );
      setResult(response.data);
    } catch (err) {
      console.error("Erro ao gerar email:", err);
      setError("Erro ao gerar o email. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (result) {
      onGenerate(result);
      handleReset();
      onClose();
    }
  };

  const handleReset = () => {
    setTopic("");
    setTone("profissional");
    setAudience("");
    setResult(null);
    setError("");
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Gerar Email com IA" size="lg">
      <div className="space-y-4">
        {!result ? (
          <>
            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assunto / Tema
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Descreva o tema do email. Ex: Promoção de fim de ano com 30% de desconto em todos os planos..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tom
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="profissional">Profissional</option>
                <option value="casual">Casual</option>
                <option value="urgente">Urgente</option>
                <option value="amigavel">Amigável</option>
              </select>
            </div>

            {/* Audience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Público-alvo (opcional)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Ex: Donos de pequenas empresas, profissionais de marketing..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={loading}
                disabled={!topic.trim()}
                onClick={handleGenerate}
              >
                <Sparkles size={14} />
                Gerar com IA
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Generated result */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assunto gerado
              </label>
              <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                {result.subject}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preview do email
              </label>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <iframe
                  srcDoc={result.htmlContent}
                  sandbox=""
                  className="w-full bg-white"
                  style={{ minHeight: 300 }}
                  title="AI Generated Email Preview"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setResult(null)}>
                Gerar outro
              </Button>
              <Button variant="primary" size="sm" onClick={handleUse}>
                <Sparkles size={14} />
                Usar este email
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
