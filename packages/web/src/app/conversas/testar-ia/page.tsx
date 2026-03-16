"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import { Send, Trash2, Bot, AlertTriangle, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export default function TestarIAPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulate Lead panel state
  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simContext, setSimContext] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [sourceName, setSourceName] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post<{ data: { reply: string } }>(
        "/whatsapp/test-chat",
        {
          message: text,
          history: messages,
        }
      );

      const botMessage: ChatMessage = {
        role: "assistant",
        content: res.data.reply,
      };

      setMessages([...updatedMessages, botMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "Erro ao se comunicar com a IA. Verifique se a API Key da OpenAI esta configurada.",
        isError: true,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setSimContext(null);
    inputRef.current?.focus();
  };

  const simulateLead = async () => {
    if (!contactName.trim() || simLoading) return;
    setSimLoading(true);
    setSimError(null);
    try {
      const res = await api.post<{ data: { aiReply: string; context?: string } }>(
        "/whatsapp/test-chat/simulate-lead",
        {
          contactName: contactName.trim(),
          campaignName: campaignName.trim() || undefined,
          sourceName: sourceName.trim() || undefined,
        }
      );
      const botMessage: ChatMessage = {
        role: "assistant",
        content: res.data.aiReply,
      };
      setMessages([botMessage]);
      if (res.data.context) {
        setSimContext(res.data.context);
      }
      setSimPanelOpen(false);
    } catch {
      setSimError("Erro ao simular lead. Verifique se a API esta acessivel.");
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Testar IA" breadcrumb={["Conversas", "Testar IA"]} />
      <ConversasNav />

      {/* Simulate Lead Panel */}
      <div className="bg-indigo-50 border border-indigo-200 mx-4 mt-3 rounded-xl overflow-hidden">
        <button
          onClick={() => setSimPanelOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <UserPlus size={16} />
            Simular Entrada de Lead
          </span>
          {simPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {simPanelOpen && (
          <div className="px-4 pb-4 pt-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">
                  Nome do Lead <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ex: João Silva"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">
                  Campanha
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: GoBI Maio 2026"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-indigo-800 mb-1">
                  Fonte
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Ex: Google Ads"
                  disabled={simLoading}
                  className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>

            {simError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                {simError}
              </p>
            )}

            <button
              onClick={simulateLead}
              disabled={!contactName.trim() || simLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {simLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Simulando...
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  Simular
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <Bot size={48} strokeWidth={1.5} />
              <p className="text-sm">Envie uma mensagem para testar o Agente SDR IA</p>
              <p className="text-xs text-gray-300">O historico e mantido apenas nesta sessao</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {simContext && (
                <div className="flex items-start gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                  <UserPlus size={13} className="mt-0.5 flex-shrink-0" />
                  <span><span className="font-medium">Contexto usado:</span> {simContext}</span>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={clsx(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={clsx(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : msg.isError
                        ? "bg-red-50 border border-red-200 text-red-700 rounded-bl-md"
                        : "bg-gray-100 text-gray-900 rounded-bl-md"
                    )}
                  >
                    {msg.isError ? (
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-red-500" />
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      </div>
                    ) : msg.role === "user" ? (
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    ) : (
                      <span
                        className="whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                        dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.content) }}
                      />
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Limpar conversa"
              >
                <Trash2 size={18} />
              </button>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
