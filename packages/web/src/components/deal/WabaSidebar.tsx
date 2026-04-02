"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, Loader2, Pencil, Check, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "WA_CLIENT" | "WA_BOT" | "WA_HUMAN" | "WA_SYSTEM";
  body: string | null;
  type: string;
  templateName?: string | null;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  senderUserId?: string | null;
  senderUser?: { id: string; name: string } | null;
}

interface WabaSidebarProps {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  dealId?: string;
  onClose: () => void;
}

export default function WabaSidebar({
  conversationId,
  contactName,
  contactPhone,
  dealId,
  onClose,
}: WabaSidebarProps) {
  const { user: authUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
          `/wa/conversations/${conversationId}/messages?limit=100`
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

  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => fetchMessages(false), 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/wa/conversations/${conversationId}/messages`, {
        type: "text",
        text: inputText.trim(),
        senderUserId: authUser?.id,
      });
      setInputText("");
      await fetchMessages(false);
    } catch {
      // Silent fail
    } finally {
      setSending(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "WA_DELIVERED": return <span className="text-gray-400" title="Entregue">✓✓</span>;
      case "WA_READ": return <span className="text-blue-400" title="Lida">✓✓</span>;
      case "WA_SENT": return <span className="text-gray-400" title="Enviada">✓</span>;
      case "WA_FAILED": return <span className="text-red-400" title="Falhou">✗</span>;
      case "WA_PENDING": return <span className="text-gray-300" title="Pendente">○</span>;
      default: return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header — emerald para diferenciar da Z-API */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-emerald-600 text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.613.613l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.354 0-4.542-.726-6.347-1.965l-.244-.168-3.151 1.056 1.056-3.151-.168-.244A9.956 9.956 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
            </svg>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate">{contactName || contactPhone}</p>
                <span className="text-[9px] font-medium bg-white/20 px-1.5 py-0.5 rounded-full">API Oficial</span>
              </div>
              <p className="text-xs opacity-80 truncate">{contactPhone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-emerald-700 transition-colors flex-shrink-0 ml-2">
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={20} className="animate-spin text-emerald-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm text-gray-400 text-center">Nenhuma mensagem na WABA ainda.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isClient = msg.direction === "INBOUND";
              const isBot = msg.senderType === "WA_BOT";
              const isHuman = msg.senderType === "WA_HUMAN";
              const isTemplate = msg.type === "TEMPLATE";
              const text = msg.body || (isTemplate ? `[Template: ${msg.templateName}]` : "[Mídia]");

              return (
                <div key={msg.id} className={`flex ${isClient ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${
                      isClient
                        ? "bg-gray-200 text-gray-900"
                        : isBot
                        ? "bg-emerald-50 border border-emerald-200 text-gray-900"
                        : isTemplate
                        ? "bg-amber-50 border border-amber-200 text-gray-900"
                        : "bg-blue-100 border border-blue-200 text-gray-900"
                    }`}
                  >
                    {!isClient && (
                      <p className={`text-[10px] font-semibold mb-0.5 ${
                        isBot ? "text-emerald-700" : isTemplate ? "text-amber-700" : "text-blue-700"
                      }`}>
                        {isBot ? "BIA" : isTemplate ? "Template" : (msg.senderUser?.name || "Equipe")}
                      </p>
                    )}
                    <p
                      className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(text) }}
                    />
                    <div className="flex items-center gap-1 justify-end mt-0.5">
                      <p className="text-[10px] text-gray-400">
                        {formatTime(msg.sentAt || msg.createdAt)}
                      </p>
                      {!isClient && <span className="text-[10px]">{statusIcon(msg.status)}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-gray-200 p-3 flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (textareaRef.current) {
                  textareaRef.current.style.height = "auto";
                  textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + "px";
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Mensagem... (Ctrl+Enter envia)"
              disabled={sending}
              rows={1}
              style={{ maxHeight: "100px" }}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              title="Enviar (Ctrl+Enter)"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Enter = nova linha · Ctrl+Enter = enviar</p>
        </div>
      </div>
    </>
  );
}
