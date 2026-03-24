"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import { MessageSquare, Send, UserCheck, AlertCircle, Search, Tag, X, Plus, Wifi, WifiOff, ArrowLeft, Pencil, Check, XCircle } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { formatWhatsAppText } from "@/lib/formatters";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationMessage {
  id: string;
  conversationId: string;
  sender: "CLIENT" | "BOT" | "HUMAN";
  text: string;
  createdAt: string;
}

interface ConvTag {
  id: string;
  name: string;
  color: string | null;
}

interface Conversation {
  id: string;
  phone: string;
  pushName: string | null;
  lastMessageAt: string | null;
  isActive: boolean;
  needsHumanAttention: boolean;
  status: string;
  contactId?: string | null;
  messages?: ConversationMessage[];
  tags?: ConvTag[];
  hasUndelivered?: boolean;
  unreadCount?: number;
  contact?: { id: string; name: string; email: string } | null;
  assignedUser?: { id: string; name: string } | null;
}

interface Message {
  id: string;
  conversationId: string;
  sender: "CLIENT" | "BOT" | "HUMAN";
  text: string;
  createdAt: string;
  delivered?: boolean;
  editedAt?: string | null;
  senderUserId?: string | null;
  senderUser?: { id: string; name: string } | null;
}

export default function ConversasChatPage() {
  const { user: authUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Array<{id: string, name: string, content: string, category: string}>>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'ai' | 'human' | 'open' | 'closed' | 'errors'>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [allUsers, setAllUsers] = useState<Array<{id: string, name: string}>>([]);
  const [stats, setStats] = useState<{total: number, withAI: number, withHuman: number, open: number, closed: number, withErrors: number}>({ total: 0, withAI: 0, withHuman: 0, open: 0, closed: 0, withErrors: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [allTags, setAllTags] = useState<ConvTag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchConversations = useCallback(async (query?: string) => {
    try {
      const params = new URLSearchParams();
      if (activeFilter === 'ai') params.set('attendant', 'ai');
      else if (activeFilter === 'human') params.set('attendant', 'human');
      else if (activeFilter === 'open') params.set('status', 'open');
      else if (activeFilter === 'closed') params.set('status', 'closed');
      else if (activeFilter === 'errors') params.set('hasErrors', 'true');
      if (userFilter && userFilter !== 'all') params.set('assignedUserId', userFilter);
      const s = query !== undefined ? query : searchQuery;
      if (s) params.set('search', s);

      const res = await api.get<{ data: Conversation[] }>(`/whatsapp/conversations?${params.toString()}`);
      setConversations(res.data || []);
    } catch {
      setError("Erro ao carregar conversas.");
    } finally {
      setLoading(false);
    }
  }, [activeFilter, userFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: {total: number, withAI: number, withHuman: number, open: number, closed: number, withErrors: number} }>("/whatsapp/conversations/stats");
      setStats(res.data);
    } catch {}
  }, []);

  const fetchMessages = useCallback(async (conversationId: string, showLoading = false) => {
    if (showLoading) setMessagesLoading(true);
    try {
      const res = await api.get<{ data: Message[] }>(`/whatsapp/conversations/${conversationId}/messages`);
      setMessages(res.data || []);
    } catch {
      setError("Erro ao carregar mensagens.");
    } finally {
      if (showLoading) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    api.get<{ data: Array<{id: string, name: string, content: string, category: string}> }>("/whatsapp/message-templates")
      .then(res => setTemplates(res.data || []))
      .catch(() => {});
    api.get<{ data: ConvTag[] }>("/tags")
      .then(res => setAllTags(Array.isArray(res) ? res : res.data ?? []))
      .catch(() => {});
    api.get<{ data: Array<{id: string, name: string}> }>("/users")
      .then(res => setAllUsers(res.data ?? []))
      .catch(() => {});
  }, []);

  // Polling: refresh conversations and messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      fetchStats();
      if (selectedId) {
        fetchMessages(selectedId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchStats, fetchMessages, selectedId]);

  // Load messages when selecting a conversation (with loading skeleton) and mark as read
  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId, true);
      api.post(`/whatsapp/conversations/${selectedId}/read`, {}).catch(() => {});
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
      await api.post(`/whatsapp/conversations/${selectedId}/send`, { content: inputText.trim(), userId: authUser?.id });
      setInputText("");
      await fetchMessages(selectedId);
    } catch {
      setError("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
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
    if (!editingMessageId || !editText.trim() || !selectedId || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.put(`/whatsapp/conversations/${selectedId}/messages/${editingMessageId}`, {
        text: editText.trim(),
        userId: authUser?.id,
      });
      setEditingMessageId(null);
      setEditText("");
      await fetchMessages(selectedId);
    } catch {
      setError("Erro ao editar mensagem.");
    } finally {
      setSavingEdit(false);
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

  const selectTemplate = (template: { name: string; content: string }) => {
    const conv = conversations.find((c) => c.id === selectedId);
    const nome = conv?.contact?.name || conv?.pushName || "";
    const email = conv?.contact?.email || "";
    const telefone = conv?.phone || "";

    const interpolated = template.content
      .replace(/\{\{nome\}\}/gi, nome)
      .replace(/\{\{email\}\}/gi, email)
      .replace(/\{\{telefone\}\}/gi, telefone);

    setInputText(interpolated);
    setShowTemplates(false);
    setTemplateFilter("");
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

  const formatConvTimestamp = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (msgDay.getTime() === today.getTime()) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    if (msgDay.getTime() === yesterday.getTime()) {
      return "Ontem";
    }
    // Same week: day name
    const diffDays = Math.floor((today.getTime() - msgDay.getTime()) / 86400000);
    if (diffDays < 7) {
      return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  const formatDateSeparator = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (msgDay.getTime() === today.getTime()) return "Hoje";
    if (msgDay.getTime() === yesterday.getTime()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  };

  const getMessageDateKey = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  const truncate = (text: string | null, max: number) => {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "..." : text;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Conversas" breadcrumb={["Conversas", "Chat"]} />
      <ConversasNav />

      {/* Attendance indicators */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4 md:gap-6 overflow-x-auto">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-xs text-gray-600">Em atendimento: <strong className="text-gray-900">{stats.open}</strong></span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-xs text-gray-600">Com IA: <strong className="text-gray-900">{stats.withAI}</strong></span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
          <span className="text-xs text-gray-600">Com humano: <strong className="text-gray-900">{stats.withHuman}</strong></span>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-600">Fechadas: <strong className="text-gray-900">{stats.closed}</strong></span>
        </div>
        {stats.withErrors > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs text-red-600">Erros: <strong className="text-red-700">{stats.withErrors}</strong></span>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-sm text-red-600 font-medium hover:underline">Fechar</button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left panel: contact list */}
        <div className={clsx(
          "border-r border-gray-200 flex flex-col bg-white",
          "w-full md:w-80",
          selectedId ? "hidden md:flex" : "flex"
        )}>
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                  searchTimeoutRef.current = setTimeout(() => fetchConversations(v), 300);
                }}
                placeholder="Buscar nome, email, telefone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); fetchConversations(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {([
                { key: 'all' as const, label: 'Todas', count: stats.total, color: '' },
                { key: 'ai' as const, label: 'Com IA', count: stats.withAI, color: '' },
                { key: 'human' as const, label: 'Humano', count: stats.withHuman, color: '' },
                { key: 'open' as const, label: 'Abertas', count: stats.open, color: '' },
                { key: 'closed' as const, label: 'Fechadas', count: stats.closed, color: '' },
                { key: 'errors' as const, label: 'Erros', count: stats.withErrors, color: 'error' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={clsx(
                    "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                    activeFilter === f.key
                      ? f.color === 'error' ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      : f.color === 'error' && f.count > 0 ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {f.label} <span className="text-[10px] opacity-70">({f.count})</span>
                </button>
              ))}
            </div>
            {allUsers.length > 0 && (
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos os responsáveis</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
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
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                        <MessageSquare size={16} />
                      </div>
                      {conv.hasUndelivered ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" title="Mensagens com erro" />
                      ) : conv.isActive && conv.status !== 'closed' ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="Ativo no WhatsApp" />
                      ) : (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-400 rounded-full border-2 border-white" title="Offline / Fechada" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={clsx("text-sm truncate", (conv.unreadCount ?? 0) > 0 ? "font-bold text-gray-900" : "font-medium text-gray-900")}>
                          {conv.pushName || conv.phone}
                        </p>
                        <span className={clsx("text-[11px] flex-shrink-0 whitespace-nowrap leading-none", (conv.unreadCount ?? 0) > 0 ? "text-green-600 font-semibold" : "text-gray-400")}>
                          {formatConvTimestamp(conv.lastMessageAt) || formatConvTimestamp(conv.messages?.[0]?.createdAt ?? null)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className={clsx("text-xs truncate flex-1", (conv.unreadCount ?? 0) > 0 ? "text-gray-700 font-medium" : "text-gray-500")}>
                          {truncate(conv.messages?.[0]?.text ?? null, 40)}
                        </p>
                        {(conv.unreadCount ?? 0) > 0 && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center bg-green-500 text-white text-[10px] font-bold rounded-full px-1">
                            {conv.unreadCount}
                          </span>
                        )}
                        {conv.needsHumanAttention && (
                          <AlertCircle size={12} className="text-yellow-500 flex-shrink-0" />
                        )}
                        {!conv.needsHumanAttention && conv.isActive && conv.status !== 'closed' && (conv.unreadCount ?? 0) === 0 && (
                          <span className="text-[10px] px-1 py-0.5 bg-blue-50 text-blue-600 rounded font-medium flex-shrink-0">IA</span>
                        )}
                        {conv.needsHumanAttention && (
                          <span className="text-[10px] px-1 py-0.5 bg-yellow-50 text-yellow-600 rounded font-medium flex-shrink-0 ml-0.5">Humano</span>
                        )}
                        {conv.status === 'closed' && (
                          <span className="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded font-medium flex-shrink-0 ml-0.5">Fechada</span>
                        )}
                      </div>
                      {conv.tags && conv.tags.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {conv.tags.slice(0, 3).map(tag => (
                            <span key={tag.id} className="text-[9px] px-1 py-0 rounded bg-purple-50 text-purple-600 truncate max-w-[80px]">{tag.name}</span>
                          ))}
                          {conv.tags.length > 3 && <span className="text-[9px] text-gray-400">+{conv.tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel: messages */}
        <div className={clsx(
          "flex-1 flex flex-col bg-gray-50",
          !selectedId ? "hidden md:flex" : "flex"
        )}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Selecione uma conversa para visualizar
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedId(null)}
                      className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 mr-1"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    {selectedConv?.hasUndelivered ? (
                      <span title="Mensagens com erro de envio"><WifiOff size={14} className="text-red-500" /></span>
                    ) : (
                      <span title="WhatsApp ativo"><Wifi size={14} className="text-green-500" /></span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedConv?.pushName || selectedConv?.phone || ""}
                      </p>
                      <p className="text-xs text-gray-500">{selectedConv?.phone} {selectedConv?.contact?.email ? `· ${selectedConv.contact.email}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
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
                  <button
                    onClick={async () => {
                      if (!selectedId || !selectedConv) return;
                      const newStatus = selectedConv.status === 'closed' ? 'open' : 'closed';
                      await api.put(`/whatsapp/conversations/${selectedId}`, { status: newStatus });
                      await fetchConversations();
                      fetchStats();
                    }}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      selectedConv?.status === 'closed'
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {selectedConv?.status === 'closed' ? 'Reabrir' : 'Fechar'}
                  </button>
                </div>
                </div>
                {/* Tags bar */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <Tag size={12} className="text-gray-400" />
                  {selectedConv?.tags?.map(tag => (
                    <span key={tag.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                      {tag.name}
                      <button onClick={async () => {
                        await api.delete(`/whatsapp/conversations/${selectedId}/tags/${tag.id}`);
                        fetchConversations();
                      }} className="hover:text-red-500"><X size={10} /></button>
                    </span>
                  ))}
                  <div className="relative">
                    <button onClick={() => setShowTagPicker(!showTagPicker)} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 font-medium">
                      <Plus size={10} /> Tag
                    </button>
                    {showTagPicker && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 w-48 max-h-48 overflow-y-auto">
                        {allTags
                          .filter(t => !selectedConv?.tags?.some(ct => ct.id === t.id))
                          .map(tag => (
                            <button key={tag.id} onClick={async () => {
                              await api.post(`/whatsapp/conversations/${selectedId}/tags`, { tagId: tag.id });
                              fetchConversations();
                              setShowTagPicker(false);
                            }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 transition-colors">
                              {tag.name}
                            </button>
                          ))}
                        {allTags.filter(t => !selectedConv?.tags?.some(ct => ct.id === t.id)).length === 0 && (
                          <div className="px-3 py-2 text-xs text-gray-400 text-center">Todas as tags aplicadas</div>
                        )}
                      </div>
                    )}
                  </div>
                  {!selectedConv?.contactId && (
                    <span className="text-[10px] text-gray-400 italic">Sem contato vinculado</span>
                  )}
                </div>
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
                  messages.map((msg, idx) => {
                    const isClient = msg.sender === "CLIENT";
                    const isBot = msg.sender === "BOT";
                    const isHuman = msg.sender === "HUMAN";
                    const currentDateKey = getMessageDateKey(msg.createdAt);
                    const prevDateKey = idx > 0 ? getMessageDateKey(messages[idx - 1].createdAt) : null;
                    const showDateSeparator = currentDateKey !== prevDateKey;
                    const isEditing = editingMessageId === msg.id;
                    const canEdit = isHuman && msg.senderUserId === authUser?.id;

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-3">
                            <span className="px-3 py-1 bg-gray-100 text-gray-500 text-[11px] rounded-full shadow-sm font-medium">
                              {formatDateSeparator(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={clsx("flex group", isClient ? "justify-start" : "justify-end")}>
                          <div className={clsx("relative", !isClient && "flex items-start gap-1")}>
                            {/* Edit button — shown on hover for own HUMAN messages */}
                            {canEdit && !isEditing && (
                              <button
                                onClick={() => handleStartEdit(msg)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0 mt-2"
                                title="Editar mensagem"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            <div
                              className={clsx(
                                "max-w-[70%] rounded-xl px-4 py-2.5 shadow-sm",
                                msg.delivered === false && !isClient
                                  ? "bg-red-50 border border-red-300 text-gray-900 opacity-70"
                                  : isClient
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
                                  {isBot ? "Bot" : (msg.senderUser?.name || "Equipe")}
                                </p>
                              )}
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                        e.preventDefault();
                                        handleSaveEdit();
                                      }
                                      if (e.key === "Escape") {
                                        handleCancelEdit();
                                      }
                                    }}
                                    className="w-full text-sm border border-blue-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    rows={3}
                                    autoFocus
                                  />
                                  <div className="flex items-center gap-1.5 justify-end">
                                    <button
                                      onClick={handleCancelEdit}
                                      className="p-1 rounded hover:bg-gray-200 text-gray-500"
                                      title="Cancelar"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                    <button
                                      onClick={handleSaveEdit}
                                      disabled={!editText.trim() || savingEdit}
                                      className="p-1 rounded hover:bg-blue-100 text-blue-600 disabled:opacity-50"
                                      title="Salvar (Ctrl+Enter)"
                                    >
                                      <Check size={14} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p
                                  className="text-sm whitespace-pre-wrap break-words [&_strong]:font-bold [&_em]:italic [&_del]:line-through"
                                  dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.text || '') }}
                                />
                              )}
                              <div className="flex items-center justify-between mt-1 gap-2">
                                {msg.delivered === false && !isClient && (
                                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                    Nao enviada
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400 text-right flex-1">
                                  {formatTime(msg.createdAt)}
                                  {msg.editedAt && <span className="ml-1 italic">(editada)</span>}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Cadência ativa */}
              {(() => {
                const cadenceTags = selectedConv?.tags?.filter(t =>
                  t.name?.startsWith('Cadência Etapa')
                ) || [];
                const activeCadence = cadenceTags[0];
                if (!activeCadence) return null;

                return (
                  <div className="px-4 py-2 bg-purple-50 border-t border-purple-200 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                      <span className="text-xs font-semibold text-purple-700">{activeCadence.name}</span>
                      <span className="text-[10px] text-purple-400">em andamento</span>
                    </div>
                  </div>
                );
              })()}

              {/* Input */}
              <div className="bg-white border-t border-gray-200 p-3 relative">
                {/* Template dropdown */}
                {showTemplates && (
                  <div className="absolute bottom-full left-0 right-0 mx-3 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-10">
                    <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500">
                      Modelos de mensagem
                    </div>
                    {templates
                      .filter(t => !templateFilter || t.name.toLowerCase().includes(templateFilter) || t.category.toLowerCase().includes(templateFilter))
                      .map(t => (
                        <button
                          key={t.id}
                          onClick={() => selectTemplate(t)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">/{t.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{t.category}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{t.content.slice(0, 80)}...</p>
                        </button>
                      ))
                    }
                    {templates.filter(t => !templateFilter || t.name.toLowerCase().includes(templateFilter) || t.category.toLowerCase().includes(templateFilter)).length === 0 && (
                      <div className="px-3 py-4 text-sm text-gray-400 text-center">Nenhum modelo encontrado</div>
                    )}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInputText(val);
                      if (val.startsWith("/")) {
                        setShowTemplates(true);
                        setTemplateFilter(val.slice(1).toLowerCase());
                      } else {
                        setShowTemplates(false);
                      }
                      // Auto-resize textarea
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "auto";
                        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setShowTemplates(false); return; }
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !showTemplates) {
                        e.preventDefault();
                        handleSend();
                      }
                      // Enter sem Ctrl = quebra de linha (comportamento padrão do textarea)
                    }}
                    placeholder="Digite / para usar um modelo... (Ctrl+Enter para enviar)"
                    className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    disabled={sending}
                    rows={1}
                    style={{ maxHeight: "120px" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending || showTemplates}
                    className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    title="Enviar (Ctrl+Enter)"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Enter = nova linha · Ctrl+Enter = enviar</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
