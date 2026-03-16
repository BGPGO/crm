"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Send, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIBuilderChatProps {
  currentHtml: string;
  onApplyHtml: (html: string) => void;
  onSubjectGenerated?: (subject: string) => void;
  isEmpty: boolean;
}

interface AIGenerateResponse {
  data: { subject: string; htmlContent: string };
}

interface AIImproveResponse {
  data: { htmlContent: string };
}

type Tone = "profissional" | "casual" | "urgente" | "amigavel";

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "profissional", label: "Profissional" },
  { value: "casual", label: "Casual" },
  { value: "urgente", label: "Urgente" },
  { value: "amigavel", label: "Amigavel" },
];

const QUICK_CHIPS = [
  "Mude cores para azul",
  "Adicione CTA",
  "Torne mais profissional",
  "Adicione rodape",
  "Melhore o design",
];

// ---------------------------------------------------------------------------
// Pulsing dots animation
// ---------------------------------------------------------------------------

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-[pulse-dot_1.4s_ease-in-out_infinite]" />
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-[pulse-dot_1.4s_ease-in-out_0.2s_infinite]" />
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-[pulse-dot_1.4s_ease-in-out_0.4s_infinite]" />
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIBuilderChat({
  currentHtml,
  onApplyHtml,
  onSubjectGenerated,
  isEmpty,
}: AIBuilderChatProps) {
  // Generate mode state
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<Tone>("profissional");
  const [audience, setAudience] = useState("");

  // Improve mode state
  const [instruction, setInstruction] = useState("");

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const appliedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Clear "applied" flash after delay
  useEffect(() => {
    if (applied) {
      appliedTimerRef.current = setTimeout(() => {
        setApplied(false);
        inputRef.current?.focus();
      }, 1800);
    }
    return () => {
      if (appliedTimerRef.current) clearTimeout(appliedTimerRef.current);
    };
  }, [applied]);

  // ── Generate from scratch ────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await api.post<AIGenerateResponse>("/ai/generate-email", {
        topic: topic.trim(),
        tone,
        audience: audience.trim() || undefined,
      });

      onApplyHtml(res.data.htmlContent);
      onSubjectGenerated?.(res.data.subject);
      setTopic("");
      setAudience("");
      setApplied(true);
    } catch (err) {
      console.error("Erro ao gerar email:", err);
      setError("Erro ao gerar o email. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ── Improve existing content ─────────────────────────────────────────────

  const handleImprove = useCallback(
    async (text?: string) => {
      const msg = (text ?? instruction).trim();
      if (!msg || loading) return;
      setLoading(true);
      setError("");
      setInstruction("");

      try {
        const res = await api.post<AIImproveResponse>("/ai/improve-email", {
          htmlContent: currentHtml,
          instruction: msg,
        });

        onApplyHtml(res.data.htmlContent);
        setApplied(true);
      } catch (err) {
        console.error("Erro ao melhorar email:", err);
        setError("Erro ao aplicar a alteracao. Tente novamente.");
        setInstruction(msg);
      } finally {
        setLoading(false);
      }
    },
    [currentHtml, instruction, loading, onApplyHtml]
  );

  const handleChipClick = (chip: string) => {
    setInstruction(chip);
    handleImprove(chip);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleImprove();
    }
  };

  // ── Render: Generate mode (empty canvas) ─────────────────────────────────

  if (isEmpty) {
    return (
      <div className="border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Gerar email com IA
              </h3>
              <p className="text-xs text-gray-500">
                Descreva o que precisa e a IA cria para voce
              </p>
            </div>
          </div>

          {/* Topic */}
          <div className="mb-3">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Sobre o que e o email? Ex: Promocao de Black Friday com 40% de desconto..."
              rows={2}
              disabled={loading}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
                         placeholder:text-gray-400 resize-none
                         focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
            />
          </div>

          {/* Tone + Audience row */}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Tom
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                disabled={loading}
                className="w-full px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200"
              >
                {TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Para quem? (opcional)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Ex: Donos de e-commerce"
                disabled={loading}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white
                           placeholder:text-gray-400
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 text-sm text-red-700 bg-red-50 rounded-lg">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2
                       text-sm font-medium text-white
                       bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg
                       hover:from-blue-700 hover:to-blue-600
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-sm hover:shadow-md
                       transition-all duration-200"
          >
            {loading ? (
              <>
                <PulsingDots />
                <span className="ml-1">Gerando...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                Gerar email
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Improve mode (has sections) ──────────────────────────────────

  return (
    <div className="border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
      <div className="p-3">
        {/* Quick chips */}
        {!loading && !applied && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                className="px-2.5 py-1 text-xs font-medium rounded-full
                           bg-blue-50 text-blue-700 border border-blue-100
                           hover:bg-blue-100 hover:border-blue-200
                           transition-all duration-150 cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 text-sm text-red-700 bg-red-50 rounded-lg">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Applied success */}
        {applied && (
          <div className="flex items-center justify-center gap-2 mb-2 py-1.5 text-sm font-medium text-emerald-700">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100">
              <Check size={12} className="text-emerald-600" />
            </div>
            Aplicado!
          </div>
        )}

        {/* Input bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg
                      border border-gray-200 shadow-sm
                      focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-300
                      transition-all duration-200"
        >
          <div className="shrink-0">
            {loading ? (
              <PulsingDots />
            ) : (
              <Sparkles size={16} className="text-blue-500" />
            )}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              loading
                ? "Aplicando alteracoes..."
                : "Descreva o que quer mudar..."
            }
            disabled={loading}
            className="flex-1 min-w-0 text-sm bg-transparent border-none outline-none
                       placeholder:text-gray-400
                       disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            onClick={() => handleImprove()}
            disabled={!instruction.trim() || loading}
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md
                       text-white bg-blue-500
                       hover:bg-blue-600 active:bg-blue-700
                       disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all duration-150"
            aria-label="Enviar instrucao"
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
