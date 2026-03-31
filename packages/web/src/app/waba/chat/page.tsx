"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  X,
  ArrowLeft,
  Send,
  Loader2,
  MessageCircle,
  Clock,
  AlertTriangle,
  Image as ImageIcon,
  FileText,
  Play,
  MapPin,
  Smile,
  ChevronDown,
  Bot,
  User,
  UserCheck,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaContact {
  id: string;
  name: string;
  email: string | null;
  phone: string;
}

interface WaAssignedUser {
  id: string;
  name: string;
}

interface WaSenderUser {
  id: string;
  name: string;
}

interface WaMessage {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  senderType: "WA_CLIENT" | "WA_BOT" | "WA_HUMAN" | "WA_SYSTEM";
  type:
    | "TEXT"
    | "IMAGE"
    | "VIDEO"
    | "AUDIO"
    | "DOCUMENT"
    | "TEMPLATE"
    | "INTERACTIVE_BUTTONS"
    | "INTERACTIVE_LIST"
    | "REACTION"
    | "STICKER"
    | "LOCATION"
    | "UNKNOWN";
  body: string | null;
  mediaUrl: string | null;
  interactiveData: any;
  status: "WA_PENDING" | "WA_SENT" | "WA_DELIVERED" | "WA_READ" | "WA_FAILED";
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  templateName: string | null;
  senderUser: WaSenderUser | null;
  createdAt: string;
}

interface WaConversation {
  id: string;
  contact: WaContact | null;
  assignedUser: WaAssignedUser | null;
  status: "WA_OPEN" | "WA_CLOSED" | "WA_ARCHIVED";
  needsHumanAttention: boolean;
  optedOut: boolean;
  unreadCount: number;
  windowOpen: boolean;
  windowExpiresAt: string | null;
  messages: WaMessage[];
  createdAt: string;
  updatedAt: string;
}

interface WaStats {
  total: number;
  open: number;
  closed: number;
  archived: number;
  needsHuman: number;
}

interface WaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}

interface WaUser {
  id: string;
  name: string;
}

// ─── Filter type ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "open" | "bot" | "human";

// ─── Helper functions ─────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0]?.toUpperCase() || "?";
}

function getAvatarColor(name: string | null | undefined): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-cyan-500",
    "bg-rose-500",
    "bg-emerald-500",
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  if (diff < 0) return "agora";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const today = new Date();
  const msgDate = new Date(dateStr);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const msgDayStart = new Date(msgDate.getFullYear(), msgDate.getMonth(), msgDate.getDate());

  if (msgDayStart.getTime() === yesterdayStart.getTime()) return "ontem";

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return msgDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const msgDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDayStart.getTime() === todayStart.getTime()) return "Hoje";
  if (msgDayStart.getTime() === yesterdayStart.getTime()) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function windowTimeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "expirada";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h${mins > 0 ? `${mins}m` : ""} restantes`;
  return `${mins}m restantes`;
}

// ─── Delivery status ticks ────────────────────────────────────────────────────

function DeliveryTicks({ status }: { status: WaMessage["status"] }) {
  switch (status) {
    case "WA_PENDING":
      return <span className="text-gray-400 text-[10px] ml-1" title="Pendente">&#x23F3;</span>;
    case "WA_SENT":
      return <span className="text-gray-400 text-[10px] ml-1" title="Enviada">&#x2713;</span>;
    case "WA_DELIVERED":
      return <span className="text-gray-400 text-[10px] ml-1" title="Entregue">&#x2713;&#x2713;</span>;
    case "WA_READ":
      return <span className="text-blue-500 text-[10px] ml-1" title="Lida">&#x2713;&#x2713;</span>;
    case "WA_FAILED":
      return <span className="text-red-500 text-[10px] ml-1" title="Falhou">&#x274C;</span>;
    default:
      return null;
  }
}

// ─── Sender label ─────────────────────────────────────────────────────────────

function senderLabel(msg: WaMessage): string | null {
  if (msg.direction === "INBOUND") return null;
  switch (msg.senderType) {
    case "WA_BOT":
      return "Bia (Bot)";
    case "WA_HUMAN":
      return msg.senderUser?.name ? `${msg.senderUser.name} (Agente)` : "Agente";
    case "WA_SYSTEM":
      return "Sistema";
    default:
      return null;
  }
}

// ─── Message content renderer ─────────────────────────────────────────────────

function MessageContent({ msg }: { msg: WaMessage }) {
  const { type, body, mediaUrl, interactiveData, templateName } = msg;

  switch (type) {
    case "TEXT":
      return (
        <p className="text-sm whitespace-pre-line break-words">
          {body || ""}
        </p>
      );

    case "IMAGE":
      return (
        <div>
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt="Imagem"
              className="max-w-[240px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
              onClick={() => window.open(mediaUrl, "_blank")}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ImageIcon size={16} />
              <span>Imagem</span>
            </div>
          )}
          {body && <p className="text-sm mt-1 whitespace-pre-line break-words">{body}</p>}
        </div>
      );

    case "VIDEO":
      return (
        <div>
          {mediaUrl ? (
            <video
              src={mediaUrl}
              controls
              className="max-w-[280px] rounded-lg"
              preload="metadata"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Play size={16} />
              <span>Video</span>
            </div>
          )}
          {body && <p className="text-sm mt-1 whitespace-pre-line break-words">{body}</p>}
        </div>
      );

    case "AUDIO":
      return (
        <div>
          {mediaUrl ? (
            <audio src={mediaUrl} controls className="max-w-[260px]" preload="metadata" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Play size={16} />
              <span>Audio</span>
            </div>
          )}
        </div>
      );

    case "DOCUMENT":
      return (
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-gray-500 flex-shrink-0" />
          {mediaUrl ? (
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all"
            >
              {body || "Documento"}
            </a>
          ) : (
            <span className="text-sm text-gray-500">{body || "Documento"}</span>
          )}
        </div>
      );

    case "STICKER":
      return mediaUrl ? (
        <img src={mediaUrl} alt="Sticker" className="w-24 h-24" loading="lazy" />
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Smile size={16} />
          <span>Sticker</span>
        </div>
      );

    case "LOCATION":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin size={16} className="text-red-500 flex-shrink-0" />
          <span>{body || "Localizacao compartilhada"}</span>
        </div>
      );

    case "REACTION":
      return (
        <span className="text-2xl">{body || ""}</span>
      );

    case "TEMPLATE":
      return (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Template: {templateName || ""}
            </p>
          </div>
          <div className="px-3 py-2">
            <p className="text-sm whitespace-pre-line break-words">{body || ""}</p>
          </div>
        </div>
      );

    case "INTERACTIVE_BUTTONS":
      return (
        <div>
          {body && <p className="text-sm whitespace-pre-line break-words mb-2">{body}</p>}
          {interactiveData?.buttons && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(interactiveData.buttons as Array<{ id: string; title: string }>).map(
                (btn, i) => (
                  <span
                    key={btn.id || i}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg"
                  >
                    {btn.title}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      );

    case "INTERACTIVE_LIST":
      return (
        <div>
          {body && <p className="text-sm whitespace-pre-line break-words mb-2">{body}</p>}
          <span className="text-xs text-gray-500 italic">Lista interativa</span>
        </div>
      );

    default:
      return (
        <p className="text-sm text-gray-500 italic">
          {body || `[${type}]`}
        </p>
      );
  }
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function WabaChatPage() {
  const { user: authUser } = useAuth();

  // ── State ──
  const [conversations, setConversations] = useState<WaConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [stats, setStats] = useState<WaStats>({
    total: 0,
    open: 0,
    closed: 0,
    archived: 0,
    needsHuman: 0,
  });
  const [users, setUsers] = useState<WaUser[]>([]);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // ── Selected conversation ──
  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // ── Fetch conversations ──
  const fetchConversations = useCallback(
    async (query?: string) => {
      try {
        const params = new URLSearchParams();
        params.set("limit", "100");
        const s = query !== undefined ? query : searchQuery;
        if (s) params.set("search", s);

        const res = await api.get<{
          data: WaConversation[];
          meta: { total: number };
        }>(`/wa/conversations?${params.toString()}`);
        setConversations(res.data || []);
      } catch {
        // silent on poll
      } finally {
        setLoading(false);
      }
    },
    [searchQuery]
  );

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: WaStats }>("/wa/conversations/stats");
      setStats(res.data);
    } catch {
      // silent
    }
  }, []);

  // ── Fetch messages for selected conversation ──
  const fetchMessages = useCallback(
    async (convId: string, showLoading = false) => {
      if (showLoading) setMessagesLoading(true);
      try {
        const res = await api.get<{ data: WaMessage[]; meta: { total: number } }>(
          `/wa/conversations/${convId}/messages?limit=200`
        );
        setMessages(res.data || []);
      } catch {
        if (showLoading) setError("Erro ao carregar mensagens.");
      } finally {
        if (showLoading) setMessagesLoading(false);
      }
    },
    []
  );

  // ── Initial load ──
  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, [fetchConversations, fetchStats]);

  // ── Load users + templates once ──
  useEffect(() => {
    api
      .get<{ data: WaUser[] }>("/users")
      .then((res) => setUsers(res.data ?? []))
      .catch(() => {});
    api
      .get<{ data: WaTemplate[] }>("/whatsapp/cloud/templates?status=APPROVED")
      .then((res) => setTemplates(res.data ?? []))
      .catch(() => {});
  }, []);

  // ── 5-second polling ──
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

  // ── Load messages on selection + mark read ──
  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId, true);
      api.post(`/wa/conversations/${selectedId}/read`, {}).catch(() => {});
    }
  }, [selectedId, fetchMessages]);

  // ── Auto-scroll to bottom ──
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  // ── Auto-dismiss error ──
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // ── Filtered conversations ──
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (activeFilter === "open") return conv.status === "WA_OPEN";
      if (activeFilter === "bot") {
        const lastMsg = conv.messages[0];
        return lastMsg && lastMsg.senderType === "WA_BOT";
      }
      if (activeFilter === "human") return conv.needsHumanAttention;
      return true;
    });
  }, [conversations, activeFilter]);

  // ── Handlers ──
  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setMobileShowChat(true);
  };

  const handleBack = () => {
    setSelectedId(null);
    setMobileShowChat(false);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      await api.post(`/wa/conversations/${selectedId}/messages`, {
        type: "text",
        content: inputText.trim(),
      });
      setInputText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      await fetchMessages(selectedId);
    } catch {
      setError("Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  const handleSendTemplate = async (template: WaTemplate) => {
    if (!selectedId) return;
    setSending(true);
    try {
      await api.post(`/wa/conversations/${selectedId}/messages`, {
        type: "template",
        templateName: template.name,
        language: template.language || "pt_BR",
      });
      setShowTemplatePicker(false);
      await fetchMessages(selectedId);
    } catch {
      setError("Erro ao enviar template.");
    } finally {
      setSending(false);
    }
  };

  const toggleHumanAttention = async () => {
    if (!selectedId || !selectedConv) return;
    try {
      await api.patch(`/wa/conversations/${selectedId}`, {
        needsHumanAttention: !selectedConv.needsHumanAttention,
      });
      await fetchConversations();
    } catch {
      setError("Erro ao atualizar conversa.");
    }
  };

  const handleAssign = async (userId: string | null) => {
    if (!selectedId) return;
    try {
      await api.patch(`/wa/conversations/${selectedId}`, {
        assignedUserId: userId,
      });
      await fetchConversations();
    } catch {
      setError("Erro ao atribuir responsavel.");
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => fetchConversations(value), 300);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 min-h-0">
      {/* ═══════════════════ LEFT PANEL — CONVERSATION LIST ═══════════════════ */}
      <div
        className={clsx(
          "border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900",
          "w-full md:w-[300px] md:min-w-[300px] md:max-w-[300px]",
          mobileShowChat ? "hidden md:flex" : "flex"
        )}
      >
        {/* Search */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar nome, telefone..."
              className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  fetchConversations("");
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filter pills */}
          <div className="flex gap-1">
            {(
              [
                { key: "all" as FilterKey, label: "Todos", count: stats.total },
                { key: "open" as FilterKey, label: "Abertos", count: stats.open },
                { key: "bot" as FilterKey, label: "Bot", count: null },
                { key: "human" as FilterKey, label: "Humano", count: stats.needsHuman },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors",
                  activeFilter === f.key
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                )}
              >
                {f.label}
                {f.count !== null && (
                  <span className="ml-1 text-[10px] opacity-70">({f.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
          <span>
            <strong className="text-gray-700 dark:text-gray-300">{stats.total}</strong> total
          </span>
          <span>
            <strong className="text-green-600">{stats.open}</strong> abertos
          </span>
          <span>
            <strong className="text-gray-400">{stats.closed}</strong> fechados
          </span>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-2.5 w-1/2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const lastMsg = conv.messages[0] ?? null;
              const displayName =
                conv.contact?.name || conv.contact?.phone || "Sem nome";
              const displayPhone = conv.contact?.phone || "";
              const isSelected = selectedId === conv.id;
              const hasUnread = conv.unreadCount > 0;
              const lastMsgPreview = lastMsg
                ? lastMsg.senderType === "WA_BOT"
                  ? `Bot: ${truncate(lastMsg.body, 35)}`
                  : truncate(lastMsg.body, 40)
                : "";
              const lastMsgTime = lastMsg?.createdAt || conv.updatedAt;

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={clsx(
                    "w-full text-left px-3 py-3 transition-colors border-l-2",
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-900/20 border-l-blue-600"
                      : "border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={clsx(
                          "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold",
                          getAvatarColor(displayName)
                        )}
                      >
                        {getInitials(displayName)}
                      </div>
                      {/* Window indicator */}
                      <div
                        className={clsx(
                          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900",
                          conv.windowOpen ? "bg-green-500" : "bg-gray-400"
                        )}
                        title={conv.windowOpen ? "Janela ativa" : "Fora da janela"}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={clsx(
                            "text-sm truncate",
                            hasUnread
                              ? "font-bold text-gray-900 dark:text-white"
                              : "font-medium text-gray-900 dark:text-gray-100"
                          )}
                        >
                          {displayName}
                        </p>
                        <span
                          className={clsx(
                            "text-[10px] flex-shrink-0 whitespace-nowrap",
                            hasUnread
                              ? "text-blue-600 dark:text-blue-400 font-semibold"
                              : "text-gray-400 dark:text-gray-500"
                          )}
                        >
                          {relativeTime(lastMsgTime)}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {displayPhone}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p
                          className={clsx(
                            "text-xs truncate flex-1",
                            hasUnread
                              ? "text-gray-700 dark:text-gray-300 font-medium"
                              : "text-gray-500 dark:text-gray-400",
                            lastMsg?.senderType === "WA_BOT" && "italic"
                          )}
                        >
                          {lastMsgPreview || "Sem mensagens"}
                        </p>
                        {/* Unread badge */}
                        {hasUnread && (
                          <span className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center bg-blue-600 text-white text-[10px] font-bold rounded-full px-1">
                            {conv.unreadCount}
                          </span>
                        )}
                        {/* Needs human */}
                        {conv.needsHumanAttention && (
                          <AlertTriangle
                            size={12}
                            className="text-yellow-500 flex-shrink-0"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════ RIGHT PANEL — CHAT ═══════════════════════════════ */}
      <div
        className={clsx(
          "flex-1 flex flex-col bg-gray-50 dark:bg-gray-950 min-w-0",
          !mobileShowChat && !selectedId ? "hidden md:flex" : "flex"
        )}
      >
        {!selectedId ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <MessageCircle size={36} className="text-gray-300 dark:text-gray-600" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium">Selecione uma conversa</p>
              <p className="text-sm mt-1">
                Escolha uma conversa na lista para visualizar as mensagens
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Chat Header ── */}
            <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Back button (mobile) */}
                  <button
                    onClick={handleBack}
                    className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0"
                  >
                    <ArrowLeft size={18} className="text-gray-600 dark:text-gray-300" />
                  </button>

                  {/* Avatar */}
                  <div
                    className={clsx(
                      "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0",
                      getAvatarColor(
                        selectedConv?.contact?.name || "?"
                      )
                    )}
                  >
                    {getInitials(selectedConv?.contact?.name)}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {selectedConv?.contact?.name || "Sem nome"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {selectedConv?.contact?.phone || ""}
                      {selectedConv?.assignedUser && (
                        <span className="ml-2">
                          &middot; {selectedConv.assignedUser.name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Window status badge */}
                  {selectedConv?.windowOpen ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Janela ativa &middot; {windowTimeRemaining(selectedConv.windowExpiresAt)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Fora da janela
                    </span>
                  )}

                  {/* Bot/Human toggle */}
                  <button
                    onClick={toggleHumanAttention}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      selectedConv?.needsHumanAttention
                        ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                    )}
                    title={
                      selectedConv?.needsHumanAttention
                        ? "Atendimento humano ativo"
                        : "Bot respondendo"
                    }
                  >
                    {selectedConv?.needsHumanAttention ? (
                      <>
                        <User size={14} />
                        <span className="hidden sm:inline">Humano</span>
                      </>
                    ) : (
                      <>
                        <Bot size={14} />
                        <span className="hidden sm:inline">Bot</span>
                      </>
                    )}
                  </button>

                  {/* Assign user dropdown */}
                  {users.length > 0 && (
                    <div className="relative group">
                      <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 transition-colors">
                        <UserCheck size={14} />
                        <ChevronDown size={12} />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 w-48 max-h-48 overflow-y-auto hidden group-hover:block">
                        <button
                          onClick={() => handleAssign(null)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-500"
                        >
                          Sem responsavel
                        </button>
                        {users.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => handleAssign(u.id)}
                            className={clsx(
                              "w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors",
                              selectedConv?.assignedUser?.id === u.id
                                ? "text-blue-600 font-medium"
                                : "text-gray-700 dark:text-gray-300"
                            )}
                          >
                            {u.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Messages ── */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-4"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.03) 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            >
              {messagesLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={28} className="animate-spin text-blue-500" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
                  <MessageCircle size={28} />
                  <p className="text-sm">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <div className="space-y-1 max-w-3xl mx-auto">
                  {messages.map((msg, idx) => {
                    const isInbound = msg.direction === "INBOUND";
                    const isOutbound = msg.direction === "OUTBOUND";
                    const currentDateKey = getDateKey(msg.createdAt);
                    const prevDateKey =
                      idx > 0 ? getDateKey(messages[idx - 1].createdAt) : null;
                    const showDateSeparator = currentDateKey !== prevDateKey;
                    const label = senderLabel(msg);
                    const isSystem = msg.senderType === "WA_SYSTEM";

                    if (isSystem) {
                      return (
                        <div key={msg.id}>
                          {showDateSeparator && (
                            <div className="flex items-center justify-center my-4">
                              <span className="px-3 py-1 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[11px] rounded-full shadow-sm font-medium border border-gray-200 dark:border-gray-700">
                                {formatDateSeparator(msg.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-center my-2">
                            <span className="px-3 py-1 text-[11px] text-gray-500 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                              {msg.body || "[Sistema]"}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-4">
                            <span className="px-3 py-1 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[11px] rounded-full shadow-sm font-medium border border-gray-200 dark:border-gray-700">
                              {formatDateSeparator(msg.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={clsx(
                            "flex mb-1",
                            isInbound ? "justify-start" : "justify-end"
                          )}
                        >
                          <div
                            className={clsx(
                              "max-w-[75%] md:max-w-[65%]",
                              isInbound ? "mr-12" : "ml-12"
                            )}
                          >
                            {/* Sender label */}
                            {label && (
                              <p
                                className={clsx(
                                  "text-[10px] font-semibold mb-0.5 px-1",
                                  isOutbound ? "text-right" : "text-left",
                                  msg.senderType === "WA_BOT"
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-blue-600 dark:text-blue-400"
                                )}
                              >
                                {label}
                              </p>
                            )}

                            {/* Bubble */}
                            <div
                              className={clsx(
                                "rounded-2xl px-3.5 py-2.5 shadow-sm",
                                isInbound
                                  ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none"
                                  : "bg-green-100 dark:bg-green-900/40 text-gray-900 dark:text-gray-100 rounded-tr-none",
                                msg.status === "WA_FAILED" &&
                                  "border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                              )}
                            >
                              <MessageContent msg={msg} />

                              {/* Footer: time + ticks */}
                              <div className="flex items-center justify-end gap-1 mt-1">
                                {msg.status === "WA_FAILED" && msg.errorMessage && (
                                  <span className="text-[9px] text-red-500 mr-auto truncate max-w-[150px]" title={msg.errorMessage}>
                                    {truncate(msg.errorMessage, 30)}
                                  </span>
                                )}
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {formatTime(msg.createdAt)}
                                </span>
                                {isOutbound && <DeliveryTicks status={msg.status} />}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* ── Input area ── */}
            {selectedConv?.windowOpen ? (
              /* Window OPEN: regular text input */
              <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-3 flex-shrink-0">
                <div className="flex items-end gap-2 max-w-3xl mx-auto">
                  <textarea
                    ref={textareaRef}
                    value={inputText}
                    onChange={(e) => {
                      setInputText(e.target.value);
                      if (textareaRef.current) {
                        textareaRef.current.style.height = "auto";
                        textareaRef.current.style.height =
                          Math.min(textareaRef.current.scrollHeight, 120) + "px";
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        (e.ctrlKey || e.metaKey)
                      ) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Digite sua mensagem... (Ctrl+Enter para enviar)"
                    className="flex-1 px-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-gray-400"
                    disabled={sending}
                    rows={1}
                    style={{ maxHeight: "120px" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sending}
                    className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    title="Enviar (Ctrl+Enter)"
                  >
                    {sending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-center">
                  Enter = nova linha &middot; Ctrl+Enter = enviar
                </p>
              </div>
            ) : (
              /* Window CLOSED: template only */
              <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center gap-2 max-w-3xl mx-auto">
                    <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">
                      Janela de 24h expirada. Use um template aprovado para iniciar conversa.
                    </p>
                  </div>
                </div>
                <div className="p-3">
                  <div className="max-w-3xl mx-auto">
                    <button
                      onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                      disabled={sending}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
                    >
                      {sending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <>
                          <Send size={16} />
                          Enviar Template
                        </>
                      )}
                    </button>

                    {/* Template picker */}
                    {showTemplatePicker && (
                      <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto">
                        {templates.length === 0 ? (
                          <div className="px-4 py-6 text-sm text-gray-400 text-center">
                            Nenhum template aprovado encontrado
                          </div>
                        ) : (
                          templates.map((t) => (
                            <button
                              key={t.id}
                              onClick={() => handleSendTemplate(t)}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {t.name}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                                  {t.category}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {t.language || "pt_BR"}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className="bg-red-50 dark:bg-red-900/80 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-3">
            <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
