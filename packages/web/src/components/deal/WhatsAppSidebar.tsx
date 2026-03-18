"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, MessageCircle, Bot, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  sender: "CLIENT" | "BOT" | "HUMAN";
  text: string;
  createdAt: string;
  delivered?: boolean;
  senderUser?: { id: string; name: string } | null;
}

interface WhatsAppSidebarProps {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  dealId?: string;
  onClose: () => void;
}

export default function WhatsAppSidebar({
  conversationId,
  contactName,
  contactPhone,
  dealId,
  onClose,
}: WhatsAppSidebarProps) {
  const { user: authUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [activatingBot, setActivatingBot] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const fetchMessages = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const res = await api.get<{ data: Message[] }>(
          `/whatsapp/conversations/${conversationId}/messages?limit=100`
        );
        setMessages(res.data || []);
      } catch {
        // Non-critical
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [conversationId]
  );

  // Initial load
  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  // Poll every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMessages(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/conversations/${conversationId}/send`, {
        content: inputText.trim(),
        userId: authUser?.id,
      });
      setInputText("");
      await fetchMessages(false);
    } catch {
      // Silent fail
    } finally {
      setSending(false);
    }
  };

  const handleActivateBot = async () => {
    if (!dealId || activatingBot) return;
    setActivatingBot(true);
    try {
      await api.post(`/deals/${dealId}/activate-bot`, {});
      await fetchMessages(false);
    } catch {
      // Silent fail
    } finally {
      setActivatingBot(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-green-600 text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle size={18} className="flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{contactName || contactPhone}</p>
              <p className="text-xs opacity-80 truncate">{contactPhone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-green-700 transition-colors flex-shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Carregando...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <MessageCircle size={40} className="text-gray-300" />
              <p className="text-sm text-gray-400 text-center">Nenhuma mensagem ainda. Envie uma mensagem manual ou acione o bot SDR.</p>
              {dealId && (
                <button
                  onClick={handleActivateBot}
                  disabled={activatingBot}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  {activatingBot ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                  {activatingBot ? "Acionando..." : "Acionar Bot SDR"}
                </button>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              const isClient = msg.sender === "CLIENT";
              const isBot = msg.sender === "BOT";

              return (
                <div
                  key={msg.id}
                  className={`flex ${isClient ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${
                      isClient
                        ? "bg-gray-200 text-gray-900"
                        : isBot
                        ? "bg-green-100 border border-green-200 text-gray-900"
                        : "bg-blue-100 border border-blue-200 text-gray-900"
                    }`}
                  >
                    {!isClient && (
                      <p
                        className={`text-[10px] font-semibold mb-0.5 ${
                          isBot ? "text-green-700" : "text-blue-700"
                        }`}
                      >
                        {isBot ? "Bot" : (msg.senderUser?.name || "Equipe")}
                      </p>
                    )}
                    <p
                      className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                      dangerouslySetInnerHTML={{
                        __html: formatWhatsAppText(msg.text || ""),
                      }}
                    />
                    <p className="text-[10px] text-gray-400 text-right mt-0.5">
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-gray-200 p-3 flex-shrink-0 space-y-2">
          {dealId && messages.length > 0 && (
            <button
              onClick={handleActivateBot}
              disabled={activatingBot}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            >
              {activatingBot ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
              {activatingBot ? "Acionando..." : "Acionar Bot SDR"}
            </button>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Digite uma mensagem..."
              disabled={sending}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
