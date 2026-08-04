"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, Loader2, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";

// Canal Comercial (número humano) — o CRM lê e envia PELO Messenger (bgpmassa).
// A conversa só é criada no Messenger no primeiro envio; abrir só pra ler não cria nada.

interface ComercialMessage {
  id: string;
  fromMe: boolean;
  senderName?: string | null;
  text: string;
  mediaType?: string | null;
  createdAt: string;
}

const MEDIA_LABEL: Record<string, string> = {
  IMAGE: "Imagem",
  AUDIO: "Áudio",
  VIDEO: "Vídeo",
  DOCUMENT: "Documento",
  STICKER: "Figurinha",
  LOCATION: "Localização",
  CONTACT: "Contato",
};

interface ComercialChatProps {
  contactName: string;
  contactPhone: string;
  embedded?: boolean;
  onClose: () => void;
}

export default function ComercialChat({
  contactName,
  contactPhone,
  embedded,
  onClose,
}: ComercialChatProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ComercialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const getDateKey = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (msgDayStart.getTime() === todayStart.getTime()) return "Hoje";
    if (msgDayStart.getTime() === yesterdayStart.getTime()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };

  const fetchMessages = useCallback(
    async (convId: string) => {
      try {
        const res = await api.get<{ data: ComercialMessage[] }>(
          `/comercial-chat/conversations/${convId}/messages?limit=100`
        );
        setMessages(res.data || []);
      } catch {
        // Non-critical
      }
    },
    []
  );

  // Resolve a conversa da linha Comercial pelo telefone (sem criar nada)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<{ data: { conversationId: string | null } }>(
          `/comercial-chat/conversation?phone=${encodeURIComponent(contactPhone)}`
        );
        if (cancelled) return;
        const convId = res.data?.conversationId ?? null;
        setConversationId(convId);
        if (convId) await fetchMessages(convId);
      } catch {
        // Messenger fora do ar / sem conversa — composer continua disponível
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactPhone, fetchMessages]);

  // Polling enquanto a aba está aberta
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchMessages(conversationId);
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.post<{ data: { conversationId: string } }>(
        `/comercial-chat/send`,
        { phone: contactPhone, content: inputText.trim() }
      );
      setInputText("");
      const convId = res.data?.conversationId;
      if (convId) {
        setConversationId(convId);
        await fetchMessages(convId);
      }
    } catch {
      setSendError("Falha ao enviar — o Messenger pode estar fora do ar. Tenta de novo.");
    } finally {
      setSending(false);
    }
  };

  const content = (
    <div
      className={
        embedded
          ? "flex-1 min-h-0 bg-white flex flex-col"
          : "fixed right-0 top-0 h-full w-[400px] bg-white shadow-2xl z-50 flex flex-col"
      }
    >
      {/* Header — petrol para diferenciar do WABA (emerald) */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-petrol-700 text-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Phone size={16} className="flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate">{contactName || contactPhone}</p>
              <span className="text-[9px] font-medium bg-white/20 px-1.5 py-0.5 rounded-full">Número humano</span>
            </div>
            <p className="text-xs opacity-80 truncate">{contactPhone}</p>
          </div>
        </div>
        {!embedded && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-petrol-800 transition-colors flex-shrink-0 ml-2">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="animate-spin text-petrol-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
            <Phone size={36} className="text-gray-300" />
            <p className="text-sm text-gray-400 text-center">
              {conversationId
                ? "Nenhuma mensagem nessa conversa ainda."
                : "Sem conversa no número Comercial ainda. Ela é criada no Messenger no primeiro envio."}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const showDateSeparator =
              idx === 0 || getDateKey(msg.createdAt) !== getDateKey(messages[idx - 1].createdAt);
            const text =
              msg.text || (msg.mediaType ? `[${MEDIA_LABEL[msg.mediaType] || msg.mediaType}]` : "[Mídia]");

            return (
              <div key={msg.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-3">
                    <span className="px-3 py-0.5 bg-white text-gray-500 text-[10px] rounded-full shadow-sm font-medium border border-gray-200">
                      {formatDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${
                      msg.fromMe
                        ? "bg-petrol-100 border border-petrol-200 text-gray-900"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    {msg.fromMe && (
                      <p className="text-[10px] font-semibold mb-0.5 text-petrol-700">
                        {msg.senderName || "Equipe"}
                      </p>
                    )}
                    <p
                      className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(text) }}
                    />
                    <p className="text-[10px] text-gray-400 text-right mt-0.5">
                      {formatTime(msg.createdAt)}
                    </p>
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
        {sendError && <p className="text-[11px] text-red-500 mb-1.5">{sendError}</p>}
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
            placeholder="Mensagem pelo número Comercial... (Ctrl+Enter envia)"
            disabled={sending}
            rows={1}
            style={{ maxHeight: "100px" }}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-500 focus:border-transparent resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || sending}
            className="p-2 bg-petrol-700 text-white rounded-lg hover:bg-petrol-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            title="Enviar (Ctrl+Enter)"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Enter = nova linha · Ctrl+Enter = enviar · sai pelo número Comercial e aparece no Messenger
        </p>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {content}
    </>
  );
}
