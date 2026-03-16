"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import { MessageSquare, Send, UserCheck, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";

interface Conversation {
  id: string;
  phone: string;
  pushName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  isActive: boolean;
  needsHumanAttention: boolean;
}

interface Message {
  id: string;
  conversationId: string;
  direction: "CLIENT" | "BOT" | "HUMAN";
  content: string;
  createdAt: string;
}

export default function ConversasChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get<{ data: Conversation[] }>("/whatsapp/conversations");
      setConversations(res.data || []);
    } catch {
      setError("Erro ao carregar conversas.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const res = await api.get<{ data: Message[] }>(`/whatsapp/conversations/${conversationId}/messages`);
      setMessages(res.data || []);
    } catch {
      setError("Erro ao carregar mensagens.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Polling: refresh conversations and messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedId) {
        fetchMessages(selectedId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchMessages, selectedId]);

  // Load messages when selecting a conversation
  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
    }
  }, [selectedId, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/conversations/${selectedId}/send`, { message: inputText.trim() });
      setInputText("");
      await fetchMessages(selectedId);
    } catch {
      setError("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const toggleHumanAttention = async () => {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (!conv) return;
    try {
      await api.put(`/whatsapp/conversations/${selectedId}`, {
        needsHumanAttention: !conv.needsHumanAttention,
      });
      await fetchConversations();
    } catch {
      setError("Erro ao atualizar conversa.");
    }
  };

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const selectedConv = conversations.find((c) => c.id === selectedId);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const truncate = (text: string | null, max: number) => {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Conversas" breadcrumb={["Conversas", "Chat"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-sm text-red-600 font-medium hover:underline">Fechar</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left panel: contact list */}
        <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
          <div className="p-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Contatos</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Nenhuma conversa encontrada
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                    selectedId === conv.id && "bg-blue-50 border-l-2 border-l-blue-600"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                        <MessageSquare size={16} />
                      </div>
                      {conv.isActive && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {conv.pushName || conv.phone}
                        </p>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-2">
                          {formatTime(conv.lastMessageAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <p className="text-xs text-gray-500 truncate flex-1">
                          {truncate(conv.lastMessage, 40)}
                        </p>
                        {conv.needsHumanAttention && (
                          <AlertCircle size={12} className="text-yellow-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel: messages */}
        <div className="flex-1 flex flex-col bg-gray-50">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Selecione uma conversa para visualizar
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {selectedConv?.pushName || selectedConv?.phone || ""}
                  </p>
                  <p className="text-xs text-gray-500">{selectedConv?.phone}</p>
                </div>
                <button
                  onClick={toggleHumanAttention}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    selectedConv?.needsHumanAttention
                      ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <UserCheck size={14} />
                  {selectedConv?.needsHumanAttention ? "Atendimento Humano ON" : "Atendimento Humano OFF"}
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={clsx("h-12 rounded-lg animate-pulse", i % 2 === 0 ? "bg-gray-200 w-2/3" : "bg-gray-200 w-2/3 ml-auto")} />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 mt-10">
                    Nenhuma mensagem ainda
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isClient = msg.direction === "CLIENT";
                    const isBot = msg.direction === "BOT";
                    return (
                      <div
                        key={msg.id}
                        className={clsx("flex", isClient ? "justify-start" : "justify-end")}
                      >
                        <div
                          className={clsx(
                            "max-w-[70%] rounded-xl px-4 py-2.5 shadow-sm",
                            isClient
                              ? "bg-gray-200 text-gray-900"
                              : isBot
                              ? "bg-green-50 border border-green-200 text-gray-900"
                              : "bg-blue-50 border border-blue-200 text-gray-900"
                          )}
                        >
                          {!isClient && (
                            <p className={clsx(
                              "text-[10px] font-semibold mb-0.5",
                              isBot ? "text-green-600" : "text-blue-600"
                            )}>
                              {isBot ? "Bot" : "Você"}
                            </p>
                          )}
                          <p
                            className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                            dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.content) }}
                          />
                          <p className="text-[10px] text-gray-400 mt-1 text-right">
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="bg-white border-t border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
