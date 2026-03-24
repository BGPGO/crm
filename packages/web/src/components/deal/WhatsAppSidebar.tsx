"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, MessageCircle, Bot, Loader2, Pencil, Check, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  sender: "CLIENT" | "BOT" | "HUMAN";
  text: string;
  createdAt: string;
  delivered?: boolean;
  editedAt?: string | null;
  senderUserId?: string | null;
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const sidebarTextareaRef = useRef<HTMLTextAreaElement>(null);
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

  const handleStartEdit = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditText(msg.text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditText("");
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editText.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.put(`/whatsapp/conversations/${conversationId}/messages/${editingMessageId}`, {
        text: editText.trim(),
        userId: authUser?.id,
      });
      setEditingMessageId(null);
      setEditText("");
      await fetchMessages(false);
    } catch {
      // Silent fail
    } finally {
      setSavingEdit(false);
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
              const isHuman = msg.sender === "HUMAN";
              const isEditing = editingMessageId === msg.id;
              const canEdit = isHuman && msg.senderUserId === authUser?.id;

              return (
                <div
                  key={msg.id}
                  className={`flex group ${isClient ? "justify-start" : "justify-end"}`}
                >
                  <div className={`relative ${!isClient ? "flex items-start gap-1" : ""}`}>
                    {/* Edit button */}
                    {canEdit && !isEditing && (
                      <button
                        onClick={() => handleStartEdit(msg)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1.5"
                        title="Editar mensagem"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
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
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                handleSaveEdit();
                              }
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="w-full text-sm border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={handleCancelEdit} className="p-0.5 rounded hover:bg-gray-200 text-gray-500" title="Cancelar">
                              <XCircle size={13} />
                            </button>
                            <button onClick={handleSaveEdit} disabled={!editText.trim() || savingEdit} className="p-0.5 rounded hover:bg-blue-100 text-blue-600 disabled:opacity-50" title="Salvar (Ctrl+Enter)">
                              <Check size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p
                          className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                          dangerouslySetInnerHTML={{
                            __html: formatWhatsAppText(msg.text || ""),
                          }}
                        />
                      )}
                      <p className="text-[10px] text-gray-400 text-right mt-0.5">
                        {formatTime(msg.createdAt)}
                        {msg.editedAt && <span className="ml-1 italic">(editada)</span>}
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
          <div className="flex items-end gap-2">
            <textarea
              ref={sidebarTextareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (sidebarTextareaRef.current) {
                  sidebarTextareaRef.current.style.height = "auto";
                  sidebarTextareaRef.current.style.height = Math.min(sidebarTextareaRef.current.scrollHeight, 100) + "px";
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
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
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
