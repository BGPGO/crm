"use client";

import { useState, useRef, useEffect } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import { Send, Trash2, Bot, AlertTriangle } from "lucide-react";
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
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Testar IA" breadcrumb={["Conversas", "Testar IA"]} />
      <ConversasNav />

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
