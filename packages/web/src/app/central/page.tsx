"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import PostponeDropdown from "@/components/ui/PostponeDropdown";
import DealDrawer from "@/components/central/DealDrawer";
import MeetingDrawer, { CentralMeeting } from "@/components/central/MeetingDrawer";
import ConversationDrawer from "@/components/central/ConversationDrawer";
import ConversationTabs from "@/components/deal/ConversationTabs";
import ManualMeetingDialog from "@/components/pipeline/ManualMeetingDialog";
import {
  Calendar,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  Phone,
  Mail,
  MapPin,
  MoreHorizontal,
  MessageCircle,
  MessageSquare,
  Plus,
  User as UserIcon,
  PanelRightOpen,
  TrendingUp,
  Bot,
  X,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/formatters";
import {
  BR_TIMEZONE,
  normalizeDueDate,
  formatTaskDate,
  formatTaskTime,
  brtInputToUtcIso,
} from "@/lib/taskDateTime";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  type: "CALL" | "EMAIL" | "MEETING" | "VISIT" | "OTHER";
  dueDate: string | null;
  dueDateFormat?: string;
  status: "PENDING" | "COMPLETED" | "OVERDUE";
  deal: {
    id: string;
    title: string;
    value?: string | number | null;
    status?: string;
    pipelineId?: string;
    stage: { id: string; name: string; color: string | null; order?: number } | null;
  } | null;
  contact: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  user: { id: string; name: string } | null;
}

interface TasksResponse {
  data: Task[];
  meta: { total: number };
}

interface TeamUser {
  id: string;
  name: string;
}

interface FunnelStage {
  id: string;
  name: string;
  order: number;
  color: string | null;
  dealCount: number;
  totalValue: string | number;
}

interface FunnelSummary {
  stages: FunnelStage[];
  totalDeals: number;
  totalValue: string | number;
}

interface WaConv {
  id: string;
  phone: string;
  pushName: string | null;
  isActive: boolean;
  needsHumanAttention: boolean;
  lastMessageAt: string | null;
  lastClientMessageAt: string | null;
  windowOpen: boolean;
  unreadCount: number;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  dealStage: { name: string; color: string | null; order?: number } | null;
  dealStatus: string | null;
  dealId: string | null;
  dealOwnerId: string | null;
  dealOwnerName: string | null;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    senderType: "WA_CLIENT" | "WA_BOT" | "WA_HUMAN" | "WA_SYSTEM";
    body: string | null;
    type: string;
    createdAt: string;
  }>;
}

// Lead esperando resposta na linha Comercial (Messenger) — vem do /comercial-chat/overview
interface ComercialPending {
  id: string;
  phone: string;
  contactId: string;
  contactName: string;
  dealId: string;
  dealStage: { name: string; color: string | null; order: number } | null;
  dealOwnerName: string | null;
  lastMessageAt: string | null;
  lastBody: string | null;
}

type ConvBucket = "responder" | "agenda" | "bia" | "aguardando";
type Period = "today" | "tomorrow" | "week" | "all";

const CONV_BUCKET_META: Record<ConvBucket, { label: string; accent: string }> = {
  responder: { label: "Responder", accent: "text-red-600" },
  // rótulo do grupo de agenda acompanha o filtro de período (ver convBucketLabel)
  agenda: { label: "Hoje", accent: "text-petrol-700" },
  bia: { label: "Com a BIA", accent: "text-purple-600" },
  aguardando: { label: "Aguardando lead", accent: "text-gray-500" },
};

// "Hoje" do grupo de conversas = mesmo período escolhido no topo da central
const PERIOD_LABEL: Record<Period, string> = {
  today: "Hoje",
  tomorrow: "Amanhã",
  week: "Essa semana",
  all: "Com compromisso",
};

function convBucketLabel(bucket: ConvBucket, period: Period): string {
  return bucket === "agenda" ? PERIOD_LABEL[period] : CONV_BUCKET_META[bucket].label;
}

// answeredAt = última resposta da equipe pelo número Comercial (fora do WABA)
function convBucketOf(c: WaConv, answeredAt: string | null): ConvBucket {
  const last = c.messages[0];
  const clientSpokeLast = last?.direction === "INBOUND";
  if (clientSpokeLast) {
    // já respondida pelo número humano depois da última fala do lead → não cobrar resposta
    if (answeredAt && last && new Date(answeredAt) > new Date(last.createdAt)) return "aguardando";
    if (c.isActive && !c.needsHumanAttention) return "bia"; // BIA vai responder
    return "responder";
  }
  // equipe/BIA falou por último — nunca é "Responder", mesmo com needsHumanAttention
  return c.isActive && !c.needsHumanAttention ? "bia" : "aguardando";
}

function wabaPreview(c: WaConv): string {
  const m = c.messages[0];
  if (!m) return "";
  const prefix =
    m.senderType === "WA_BOT"
      ? "BIA: "
      : m.senderType === "WA_HUMAN"
        ? "Você: "
        : m.senderType === "WA_SYSTEM"
          ? "Sistema: "
          : "";
  const body = m.body || (m.type !== "text" ? `[${m.type}]` : "");
  return `${prefix}${body}`;
}

// Linha unificada da coluna Conversas (WABA ou Comercial)
interface ConvRow {
  key: string;
  channel: "waba" | "comercial";
  name: string;
  phone: string;
  wabaConversationId: string | null;
  dealId: string | null;
  dealStage: WaConv["dealStage"];
  dealOwnerName: string | null;
  isActive: boolean;
  unreadCount: number;
  preview: string;
  waitingSince: string | null;
  respondedViaComercial: boolean;
  // lead tem reunião/tarefa no período filtrado — ex.: "reunião 15:45", "tarefa ter 05/08"
  todayLabel: string | null;
}

type DayBucket = "overdue" | "today" | "tomorrow" | "later";

const taskTypeIcons: Record<Task["type"], typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  VISIT: MapPin,
  OTHER: MoreHorizontal,
};

// ── Date helpers (BRT calendar day) ──────────────────────────────────────────

// YYYY-MM-DD in BRT — string compare = calendar-day compare
const dayKeyBRT = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: BR_TIMEZONE });

function bucketOf(date: Date | null, todayKey: string, tomorrowKey: string): DayBucket {
  if (!date) return "later";
  const k = dayKeyBRT(date);
  if (k < todayKey) return "overdue";
  if (k === todayKey) return "today";
  if (k === tomorrowKey) return "tomorrow";
  return "later";
}

const BUCKET_META: Record<DayBucket, { label: string; accent: string }> = {
  overdue: { label: "Atrasadas", accent: "text-red-600" },
  today: { label: "Hoje", accent: "text-petrol-700" },
  tomorrow: { label: "Amanhã", accent: "text-gray-700" },
  later: { label: "Próximas", accent: "text-gray-500" },
};

// Cores por ordem da etapa (BI e Controladoria têm as etapas espelhadas —
// mesma ordem = mesma cor nos dois funis). No banco as cores estão vazias.
const STAGE_PALETTE = [
  "#0ea5e9", // 1 LEAD
  "#8b5cf6", // 2 Contato feito
  "#f59e0b", // 3 Marcar reunião
  "#3b82f6", // 4 Reunião agendada
  "#f97316", // 5 Proposta enviada
  "#14b8a6", // 6 Aguardando dados
  "#ec4899", // 7 Aguardando assinatura
  "#10b981", // 8 Ganho fechado
  "#ef4444", // 9 Perda fechada
];

// R$ 1.234.567 → "R$ 1,2 mi" (o card não comporta o valor cheio)
function formatCurrencyCompact(value: number): string {
  if (Math.abs(value) < 100_000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function stageColor(stage: { color?: string | null; order?: number | null } | null | undefined): string {
  if (!stage) return "#64748b";
  if (stage.color) return stage.color;
  if (stage.order != null) return STAGE_PALETTE[(stage.order - 1) % STAGE_PALETTE.length];
  return "#64748b";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CentralPage() {
  const { user: authUser } = useAuth();

  // Pessoa selecionada — padrão: usuário logado. "all" = todos.
  const [personId, setPersonId] = useState<string | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);

  const [meetings, setMeetings] = useState<CentralMeeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [funnel, setFunnel] = useState<FunnelSummary | null>(null);
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([]);
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [conversations, setConversations] = useState<WaConv[]>([]);
  // Canal Comercial (Messenger): leads esperando resposta + quem já foi respondido lá
  const [comercialPending, setComercialPending] = useState<ComercialPending[]>([]);
  const [answeredByPhone, setAnsweredByPhone] = useState<Record<string, string>>({});
  // "Com a BIA" e "Aguardando lead" nascem fechados — abre no clique (collapse)
  const [collapsedConvGroups, setCollapsedConvGroups] = useState<Record<string, boolean>>({
    bia: true,
    aguardando: true,
  });
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  // Período do "à fazer": hoje (= hoje + atrasadas), amanhã, essa semana, tudo
  const [period, setPeriod] = useState<"today" | "tomorrow" | "week" | "all">("today");

  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [quickTitle, setQuickTitle] = useState("");
  const [savingQuick, setSavingQuick] = useState(false);

  // Drawers
  const [dealDrawerId, setDealDrawerId] = useState<string | null>(null);
  const [meetingDrawer, setMeetingDrawer] = useState<CentralMeeting | null>(null);
  const [convDrawer, setConvDrawer] = useState<{
    dealId: string;
    contactName: string;
    contactPhone: string;
  } | null>(null);
  // Chat aberto direto de uma conversa da coluna (já temos o conversationId)
  // Acerto de reunião a partir da tarefa: registrar a que falta ou mover a existente
  const [meetingFix, setMeetingFix] = useState<{
    task: Task;
    meeting: CentralMeeting | null;
    startTime: string | null;
  } | null>(null);

  const [chatConv, setChatConv] = useState<{
    wabaConversationId: string | null;
    contactName: string;
    contactPhone: string;
    dealId?: string;
    initialChannel?: "bia" | "comercial";
  } | null>(null);

  const todayKey = dayKeyBRT(new Date());
  const tomorrowKey = dayKeyBRT(new Date(Date.now() + 24 * 60 * 60 * 1000));
  // Fim da semana = próximo domingo (em BRT)
  const weekEndKey = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
      const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: BR_TIMEZONE });
      if (dow === "Sun") return dayKeyBRT(d);
    }
    return dayKeyBRT(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
  }, [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Data entra no período? (hoje = hoje + atrasadas; semana = atrasadas + até domingo)
  const inPeriod = useCallback(
    (d: Date | null): boolean => {
      if (period === "all") return true;
      if (!d) return false;
      const k = dayKeyBRT(d);
      if (period === "today") return k <= todayKey;
      if (period === "tomorrow") return k === tomorrowKey;
      return k <= weekEndKey;
    },
    [period, todayKey, tomorrowKey, weekEndKey]
  );

  // Default: pessoa logada
  useEffect(() => {
    if (authUser?.id && personId === null) setPersonId(authUser.id);
  }, [authUser?.id, personId]);

  const personName = useMemo(() => {
    if (!personId || personId === "all") return null;
    return (
      users.find((u) => u.id === personId)?.name ??
      (authUser?.id === personId ? authUser?.name ?? null : null)
    );
  }, [personId, users, authUser]);

  // ── Fetching ──

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ data: TeamUser[] }>("/users?isActive=true&limit=100");
        setUsers((res.data || []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      } catch {
        /* silent */
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ data: Array<{ id: string; name: string }> }>("/pipelines?limit=50");
        setPipelines((res.data || []).map((p) => ({ id: p.id, name: p.name })));
      } catch {
        /* silent */
      }
    })();
  }, []);

  const fetchMeetings = useCallback(async () => {
    if (!personId) return;
    try {
      // userId filtra por dono OU closer da deal, além do host do Calendly;
      // pipelineId filtra pelo funil da deal vinculada à reunião.
      // fromToday = de hoje 00:00 (BRT) em diante, com canceladas — as de hoje
      // que já passaram ficam na coluna com o selo, igual ao card do Início.
      const userParam = personId !== "all" ? `&userId=${personId}` : "";
      const pipelineParam = pipelineFilter !== "all" ? `&pipelineId=${pipelineFilter}` : "";
      const res = await api.get<{ data: CentralMeeting[] }>(
        `/calendly/config/meetings?period=fromToday&limit=100${userParam}${pipelineParam}`
      );
      setMeetings(res.data || []);
    } catch {
      /* silent */
    } finally {
      setLoadingMeetings(false);
    }
  }, [personId, pipelineFilter]);

  const fetchTasks = useCallback(async () => {
    if (!personId) return;
    try {
      const userParam = personId !== "all" ? `&userId=${personId}` : "";
      const res = await api.get<TasksResponse>(`/tasks?status=PENDING&limit=100${userParam}`);
      setTasks(res.data || []);
      setTasksTotal(res.meta?.total ?? (res.data || []).length);
    } catch {
      /* silent */
    } finally {
      setLoadingTasks(false);
    }
  }, [personId]);

  const fetchConversations = useCallback(async () => {
    if (!personId) return;
    try {
      // dealStatus=OPEN junto com dealOwnerId → só conversas de leads com
      // negociação ABERTA da pessoa (alinha com o funil)
      const ownerParam = personId !== "all" ? `&dealOwnerId=${personId}&dealStatus=OPEN` : "";
      const pipelineParam =
        pipelineFilter !== "all"
          ? `&pipelineId=${pipelineFilter}${personId === "all" ? "&dealStatus=OPEN" : ""}`
          : "";
      const comercialParams = new URLSearchParams();
      if (personId !== "all") comercialParams.set("dealOwnerId", personId);
      if (pipelineFilter !== "all") comercialParams.set("pipelineId", pipelineFilter);
      const [res, overview] = await Promise.all([
        api.get<{ data: WaConv[] }>(
          `/wa/conversations?status=WA_OPEN&limit=100${ownerParam}${pipelineParam}`
        ),
        // Canal Comercial: tolerante a falha (Messenger fora do ar / rota nova ainda não deployada)
        api
          .get<{ data: { pending: ComercialPending[]; answeredByPhone: Record<string, string> } }>(
            `/comercial-chat/overview${comercialParams.toString() ? `?${comercialParams}` : ""}`
          )
          .catch(() => null),
      ]);
      setConversations(res.data || []);
      setComercialPending(overview?.data?.pending || []);
      setAnsweredByPhone(overview?.data?.answeredByPhone || {});
    } catch {
      /* silent */
    } finally {
      setLoadingConvs(false);
    }
  }, [personId, pipelineFilter]);

  const fetchFunnel = useCallback(async () => {
    if (!personId || pipelines.length === 0) return;
    try {
      const ids = pipelineFilter !== "all" ? [pipelineFilter] : pipelines.map((p) => p.id);
      const userParam = personId !== "all" ? `&userIds=${personId}` : "";
      const res = await api.get<{ data: FunnelSummary }>(
        `/pipelines/${ids.join(",")}/summary?status=OPEN${userParam}`
      );
      setFunnel(res.data || null);
    } catch {
      /* silent */
    }
  }, [personId, pipelines, pipelineFilter]);

  useEffect(() => {
    setLoadingMeetings(true);
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    setLoadingTasks(true);
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetchFunnel();
  }, [fetchFunnel]);

  useEffect(() => {
    setLoadingConvs(true);
    fetchConversations();
  }, [fetchConversations]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMeetings();
      fetchTasks();
      fetchFunnel();
      fetchConversations();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchMeetings, fetchTasks, fetchFunnel, fetchConversations]);

  const refreshAll = useCallback(() => {
    fetchTasks();
    fetchFunnel();
  }, [fetchTasks, fetchFunnel]);

  // ── Actions ──

  /**
   * Acerta o registro da reunião a partir da tarefa:
   *  - sem reunião → cria a reunião manual (lembretes ativados, tarefa sincronizada)
   *  - reunião em outra data → reagenda a existente (não cria duplicata)
   * Nos dois caminhos a API deixa tarefa e reunião no mesmo horário.
   */
  const applyMeetingFix = async (data: { startTime: string; duration: number; eventType: string; notes: string }) => {
    if (!meetingFix?.task.deal?.id) return;
    if (meetingFix.meeting) {
      await api.patch(`/calendly/config/meetings/${meetingFix.meeting.id}/reschedule`, {
        startTime: data.startTime,
      });
    } else {
      await api.post(`/deals/${meetingFix.task.deal.id}/manual-meeting`, data);
    }
    setMeetingFix(null);
    fetchMeetings();
    fetchTasks();
  };

  const completeTask = async (task: Task) => {
    setTogglingId(task.id);
    try {
      await api.put(`/tasks/${task.id}`, { status: "COMPLETED" });
      window.dispatchEvent(new Event("tasks-changed"));
      await fetchTasks();
    } catch (err) {
      console.error("Erro ao concluir tarefa:", err);
    } finally {
      setTogglingId(null);
    }
  };

  const postponeTask = async (taskId: string, newDate: Date) => {
    try {
      await api.put(`/tasks/${taskId}`, { dueDate: newDate.toISOString() });
      window.dispatchEvent(new Event("tasks-changed"));
      await fetchTasks();
    } catch (err) {
      console.error("Erro ao adiar tarefa:", err);
    }
  };

  const startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  };

  const saveTaskTitle = async () => {
    if (!editingTaskId) return;
    const title = editingTitle.trim();
    const original = tasks.find((t) => t.id === editingTaskId);
    setEditingTaskId(null);
    if (!title || !original || title === original.title) return;
    try {
      await api.put(`/tasks/${editingTaskId}`, { title });
      window.dispatchEvent(new Event("tasks-changed"));
      await fetchTasks();
    } catch (err) {
      console.error("Erro ao renomear tarefa:", err);
    }
  };

  const createQuickTask = async () => {
    const title = quickTitle.trim();
    const ownerId = personId && personId !== "all" ? personId : authUser?.id;
    if (!title || !ownerId || savingQuick) return;
    setSavingQuick(true);
    try {
      // Segue o filtro de período da página: "Amanhã" cria pra amanhã, o resto pra hoje
      const dueKey = period === "tomorrow" ? tomorrowKey : todayKey;
      await api.post("/tasks", {
        title,
        type: "OTHER",
        userId: ownerId,
        dueDate: brtInputToUtcIso(`${dueKey}T00:00`),
      });
      setQuickTitle("");
      window.dispatchEvent(new Event("tasks-changed"));
      await fetchTasks();
    } catch (err) {
      console.error("Erro ao criar tarefa:", err);
    } finally {
      setSavingQuick(false);
    }
  };

  const openConversation = (args: { dealId: string; contactName: string; contactPhone: string }) => {
    setConvDrawer(args);
  };

  const [confirmingMeetingId, setConfirmingMeetingId] = useState<string | null>(null);
  const toggleMeetingConfirmation = async (m: CentralMeeting) => {
    if (confirmingMeetingId) return;
    setConfirmingMeetingId(m.id);
    try {
      const next = m.confirmationStatus === "CONFIRMED" ? "PENDING" : "CONFIRMED";
      await api.patch(`/calendly/config/meetings/${m.id}/confirmation`, { status: next });
      await fetchMeetings();
    } catch (err) {
      console.error("Erro ao confirmar reunião:", err);
    } finally {
      setConfirmingMeetingId(null);
    }
  };

  // ── Derived data ──

  const visibleMeetings = useMemo(
    () => meetings.filter((m) => inPeriod(new Date(m.startTime))),
    [meetings, inPeriod]
  );

  const meetingGroups = useMemo(() => {
    const groups: Record<Exclude<DayBucket, "overdue">, CentralMeeting[]> = {
      today: [],
      tomorrow: [],
      later: [],
    };
    visibleMeetings.forEach((m) => {
      const b = bucketOf(new Date(m.startTime), todayKey, tomorrowKey);
      if (b === "overdue") return; // dia anterior — a API já só manda de hoje em diante
      groups[b].push(m);
    });
    return groups;
  }, [visibleMeetings, todayKey, tomorrowKey]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (!inPeriod(normalizeDueDate(t))) return false;
        if (stageFilter && t.deal?.stage?.name !== stageFilter) return false;
        if (pipelineFilter !== "all" && t.deal?.pipelineId !== pipelineFilter) return false;
        return true;
      }),
    [tasks, stageFilter, inPeriod, pipelineFilter]
  );

  const taskGroups = useMemo(() => {
    const groups: Record<DayBucket, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      later: [],
    };
    visibleTasks.forEach((t) => {
      groups[bucketOf(normalizeDueDate(t), todayKey, tomorrowKey)].push(t);
    });
    return groups;
  }, [visibleTasks, todayKey, tomorrowKey]);

  const convGroups = useMemo(() => {
    const groups: Record<ConvBucket, ConvRow[]> = { responder: [], agenda: [], bia: [], aguardando: [] };

    const answeredAtOf = (c: WaConv): string | null => {
      const digits = (c.contact?.phone || c.phone || "").replace(/\D/g, "");
      return digits.length >= 8 ? answeredByPhone[digits.slice(-8)] || null : null;
    };

    // Compromissos do lead DENTRO DO PERÍODO FILTRADO (mesma régua das outras
    // colunas: hoje = hoje + atrasados, amanhã, essa semana, tudo).
    // Reunião (com horário) vence tarefa; fora de hoje o badge mostra o dia.
    const todayByDeal = new Map<string, string>();
    const todayByPhone = new Map<string, string>();
    const hhmm = (iso: string) =>
      new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dayShort = (d: Date) =>
      d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    const whenLabel = (d: Date) => {
      const k = dayKeyBRT(d);
      if (k === todayKey) return "hoje";
      if (k === tomorrowKey) return "amanhã";
      if (k < todayKey) return "atrasada";
      return dayShort(d);
    };

    const registrar = (m: CentralMeeting, label: string) => {
      if (m.dealId && !todayByDeal.has(m.dealId)) todayByDeal.set(m.dealId, label);
      const digits = (m.contact?.phone || "").replace(/\D/g, "");
      if (digits.length >= 8 && !todayByPhone.has(digits.slice(-8)))
        todayByPhone.set(digits.slice(-8), label);
    };
    const noPeriodo = meetings
      .filter((m) => inPeriod(new Date(m.startTime)))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Ativas primeiro: se o lead cancelou uma e remarcou outra, vale a que está de pé
    noPeriodo
      .filter((m) => m.status !== "canceled")
      .forEach((m) => {
        const start = new Date(m.startTime);
        registrar(
          m,
          dayKeyBRT(start) === todayKey
            ? `reunião ${hhmm(m.startTime)}`
            : `reunião ${whenLabel(start)} ${hhmm(m.startTime)}`
        );
      });
    // Cancelada no período conta: é justamente o lead que precisa de contato
    noPeriodo
      .filter((m) => m.status === "canceled")
      .forEach((m) => {
        const start = new Date(m.startTime);
        registrar(
          m,
          dayKeyBRT(start) === todayKey
            ? `reunião cancelada ${hhmm(m.startTime)}`
            : `reunião cancelada ${whenLabel(start)}`
        );
      });
    tasks.forEach((t) => {
      if (t.status !== "PENDING") return;
      const due = normalizeDueDate(t);
      // sem data não é compromisso (entraria no grupo no filtro "Tudo")
      if (!due || !inPeriod(due)) return;
      const label = `tarefa ${whenLabel(due)}`;
      if (t.deal?.id && !todayByDeal.has(t.deal.id)) todayByDeal.set(t.deal.id, label);
      const digits = (t.contact?.phone || "").replace(/\D/g, "");
      if (digits.length >= 8 && !todayByPhone.has(digits.slice(-8)))
        todayByPhone.set(digits.slice(-8), label);
    });

    const todayLabelOf = (dealId: string | null, phone: string): string | null => {
      if (dealId && todayByDeal.has(dealId)) return todayByDeal.get(dealId)!;
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 8 ? todayByPhone.get(digits.slice(-8)) || null : null;
    };

    const push = (bucket: ConvBucket, row: ConvRow) => {
      // Responder tem prioridade; o resto com compromisso hoje sobe pro grupo "Hoje"
      const finalBucket = bucket !== "responder" && row.todayLabel ? "agenda" : bucket;
      groups[finalBucket].push(row);
    };

    conversations.forEach((c) => {
      const answeredAt = answeredAtOf(c);
      const bucket = convBucketOf(c, answeredAt);
      const last = c.messages[0];
      const respondedViaComercial = Boolean(
        answeredAt && last?.direction === "INBOUND" && new Date(answeredAt) > new Date(last.createdAt)
      );
      const phone = c.contact?.phone || c.phone;
      push(bucket, {
        key: `waba-${c.id}`,
        channel: "waba",
        name: c.contact?.name || c.pushName || c.phone,
        phone,
        wabaConversationId: c.id,
        dealId: c.dealId,
        dealStage: c.dealStage,
        dealOwnerName: c.dealOwnerName,
        isActive: c.isActive,
        unreadCount: c.unreadCount,
        preview: wabaPreview(c),
        waitingSince:
          bucket === "responder" ? c.lastClientMessageAt || c.lastMessageAt : c.lastMessageAt,
        respondedViaComercial,
        todayLabel: todayLabelOf(c.dealId, phone),
      });
    });

    // Sem resposta na linha Comercial (Messenger) → entra no "Responder" com badge
    comercialPending.forEach((p) => {
      push("responder", {
        key: `com-${p.id}`,
        channel: "comercial",
        name: p.contactName || p.phone,
        phone: p.phone,
        wabaConversationId: null,
        dealId: p.dealId,
        dealStage: p.dealStage,
        dealOwnerName: p.dealOwnerName,
        isActive: false,
        unreadCount: 0,
        preview: p.lastBody || "[Mídia]",
        waitingSince: p.lastMessageAt,
        respondedViaComercial: false,
        todayLabel: todayLabelOf(p.dealId, p.phone),
      });
    });

    // Responder e Hoje: quem espera há mais tempo primeiro (SLA)
    groups.responder.sort(
      (a, b) => new Date(a.waitingSince || 0).getTime() - new Date(b.waitingSince || 0).getTime()
    );
    groups.agenda.sort(
      (a, b) => new Date(a.waitingSince || 0).getTime() - new Date(b.waitingSince || 0).getTime()
    );
    return groups;
  }, [conversations, comercialPending, answeredByPhone, meetings, tasks, todayKey, tomorrowKey, inPeriod]);

  // ── Reunião × tarefa: detecta a divergência que torna reunião invisível ──
  // A reunião (CalendlyEvent) é a fonte da verdade: é ela que aparece no Início,
  // dispara lembrete pro lead e entra na confirmação. Quando o time só mexe na
  // TAREFA ("Reunião marcada" adiada pra outro dia), a reunião fica pra trás.
  const activeMeetingByDeal = useMemo(() => {
    const map = new Map<string, CentralMeeting>();
    meetings
      .filter((m) => m.status !== "canceled" && m.dealId)
      .forEach((m) => {
        const current = map.get(m.dealId!);
        // mantém a mais próxima do futuro
        if (!current || new Date(m.startTime) < new Date(current.startTime)) {
          map.set(m.dealId!, m);
        }
      });
    return map;
  }, [meetings]);

  /** É tarefa de reunião marcada E existe reunião ativa? Devolve a reunião. */
  const meetingForTask = useCallback(
    (task: Task): CentralMeeting | null => {
      if (!task.deal?.id) return null;
      if (/^\s*(re)?marcar\b/i.test(task.title)) return null;
      const isMeetingTask =
        /reuni[ãa]o agendada/i.test(task.deal.stage?.name || "") ||
        /reuni[ãa]o/i.test(task.title);
      if (!isMeetingTask) return null;
      return activeMeetingByDeal.get(task.deal.id) ?? null;
    },
    [activeMeetingByDeal]
  );

  /**
   * Tarefa é de reunião JÁ MARCADA e a agenda não bate? Devolve o alerta.
   * Só vale pra negociação na etapa "Reunião agendada" (ou tarefa "Reunião
   * marcada"): tarefa de "Marcar/Remarcar reunião" é justamente o pedido de
   * agendar — não existe reunião pra cobrar ali, seria ruído.
   */
  const meetingMismatch = useCallback(
    (task: Task): { kind: "missing" | "different"; meeting?: CentralMeeting } | null => {
      if (!task.deal?.id) return null;
      if (/^\s*(re)?marcar\b/i.test(task.title)) return null;
      const stageSaysScheduled = /reuni[ãa]o agendada/i.test(task.deal.stage?.name || "");
      const titleSaysScheduled = /reuni[ãa]o marcada/i.test(task.title);
      if (!stageSaysScheduled && !titleSaysScheduled) return null;
      const due = normalizeDueDate(task);
      if (!due || dayKeyBRT(due) < todayKey) return null; // atrasada: outro problema
      const meeting = activeMeetingByDeal.get(task.deal.id);
      if (!meeting) return { kind: "missing" };
      // mesma data-calendário = alinhado (minutos de diferença não importam)
      if (dayKeyBRT(new Date(meeting.startTime)) === dayKeyBRT(due)) return null;
      return { kind: "different", meeting };
    },
    [activeMeetingByDeal, todayKey]
  );

  const funnelStagesWithDeals = useMemo(
    () => (funnel?.stages || []).filter((s) => s.dealCount > 0),
    [funnel]
  );

  // Stats sempre do dia, independente do período selecionado
  const stats = useMemo(() => {
    let meetingsToday = 0;
    let confirmedToday = 0;
    meetings.forEach((m) => {
      if (m.status === "canceled") return; // cancelada não conta no indicador
      if (dayKeyBRT(new Date(m.startTime)) === todayKey) {
        meetingsToday++;
        if (m.confirmationStatus === "CONFIRMED") confirmedToday++;
      }
    });
    let tasksToday = 0;
    let overdue = 0;
    tasks.forEach((t) => {
      const b = bucketOf(normalizeDueDate(t), todayKey, tomorrowKey);
      if (b === "today") tasksToday++;
      if (b === "overdue") overdue++;
    });
    return {
      meetingsToday,
      confirmedToday,
      tasksToday,
      overdue,
      funnelValue: funnel ? Number(funnel.totalValue) : null,
      funnelDeals: funnel?.totalDeals ?? 0,
    };
  }, [meetings, tasks, funnel, todayKey, tomorrowKey]);

  // ── Formatters ──

  const fmtTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const fmtDay = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

  const timeUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff < 0) return "agora";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `em ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `em ${hours}h${minutes > 0 ? ` ${minutes}min` : ""}`;
    return `em ${minutes}min`;
  };

  const isSoon = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > -30 * 60 * 1000 && diff < 2 * 60 * 60 * 1000;
  };

  const timeSince = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60 * 1000) return "agora";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  // Cor do SLA: quanto tempo o lead está esperando resposta
  const slaClass = (dateStr: string | null) => {
    if (!dateStr) return "bg-gray-100 text-gray-500";
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff > 4 * 60 * 60 * 1000) return "bg-red-100 text-red-700";
    if (diff > 60 * 60 * 1000) return "bg-amber-100 text-amber-700";
    return "bg-green-100 text-green-700";
  };

  // ── Render ──

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Central" breadcrumb={["Central"]} />

      <div className="px-4 sm:px-6 py-6 flex-1 overflow-y-auto">
        {/* Filtro de pessoa + stats */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-[280px] max-w-3xl">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-petrol-50 flex items-center justify-center flex-shrink-0">
                <Calendar size={18} className="text-petrol-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-tight">
                  {stats.meetingsToday > 0 ? `${stats.confirmedToday}/${stats.meetingsToday}` : 0}
                </p>
                <p className="text-[11px] text-gray-500">
                  {stats.meetingsToday > 0 ? "Reuniões confirmadas hoje" : "Reuniões hoje"}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle size={18} className="text-green-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 leading-tight">{stats.tasksToday}</p>
                <p className="text-[11px] text-gray-500">Tarefas hoje</p>
              </div>
            </div>
            <div
              className={clsx(
                "bg-white rounded-xl border px-4 py-3 flex items-center gap-3",
                stats.overdue > 0 ? "border-red-200" : "border-gray-200"
              )}
            >
              <div
                className={clsx(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  stats.overdue > 0 ? "bg-red-50" : "bg-gray-50"
                )}
              >
                <AlertTriangle size={18} className={stats.overdue > 0 ? "text-red-600" : "text-gray-400"} />
              </div>
              <div>
                <p
                  className={clsx(
                    "text-xl font-bold leading-tight",
                    stats.overdue > 0 ? "text-red-600" : "text-gray-900"
                  )}
                >
                  {stats.overdue}
                </p>
                <p className="text-[11px] text-gray-500">Atrasadas</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <TrendingUp size={18} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-xl font-bold text-gray-900 leading-tight"
                  title={stats.funnelValue != null ? formatCurrency(stats.funnelValue) : undefined}
                >
                  {stats.funnelValue != null ? formatCurrencyCompact(stats.funnelValue) : "—"}
                </p>
                <p className="text-[11px] text-gray-500">
                  No funil · {stats.funnelDeals} aberta{stats.funnelDeals !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Filtros: período + pessoa */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(
                [
                  { key: "today", label: "Hoje" },
                  { key: "tomorrow", label: "Amanhã" },
                  { key: "week", label: "Essa semana" },
                  { key: "all", label: "Tudo" },
                ] as const
              ).map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    period === p.key
                      ? "bg-white text-petrol-700 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <select
              value={pipelineFilter}
              onChange={(e) => setPipelineFilter(e.target.value)}
              className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-petrol-500 font-medium text-gray-800"
              title="Filtrar por funil"
            >
              <option value="all">Todos os funis</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <UserIcon size={15} className="text-gray-400" />
            <select
              value={personId ?? ""}
              onChange={(e) => setPersonId(e.target.value)}
              className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-petrol-500 font-medium text-gray-800"
            >
              {personId &&
                personId !== "all" &&
                !users.some((u) => u.id === personId) &&
                authUser?.id === personId && <option value={personId}>{authUser.name}</option>}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === authUser?.id ? " (eu)" : ""}
                </option>
              ))}
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        {/* Funil por etapa — clique numa etapa pra filtrar as tarefas */}
        {funnelStagesWithDeals.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 mb-4 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0 mr-1">
              Funil aberto
            </span>
            {funnelStagesWithDeals.map((s) => {
              const active = stageFilter === s.name;
              const color = stageColor(s);
              return (
                <button
                  key={`${s.id}-${s.order}`}
                  onClick={() => setStageFilter(active ? null : s.name)}
                  title={active ? "Limpar filtro" : "Filtrar tarefas desta etapa"}
                  className={clsx(
                    "flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 flex-shrink-0 transition-all",
                    active && "ring-2"
                  )}
                  style={{
                    backgroundColor: `${color}${active ? "2E" : "14"}`,
                    borderColor: `${color}66`,
                    ...(active ? ({ ["--tw-ring-color"]: `${color}80` } as React.CSSProperties) : {}),
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-semibold" style={{ color }}>
                    {s.name}
                  </span>
                  <span className="text-gray-500">
                    {s.dealCount} · {formatCurrency(Number(s.totalValue))}
                  </span>
                  {active && <X size={12} style={{ color }} />}
                </button>
              );
            })}
            {stageFilter && (
              <button
                onClick={() => setStageFilter(null)}
                className="text-[11px] text-gray-400 hover:text-gray-600 flex-shrink-0 underline"
              >
                limpar
              </button>
            )}
          </div>
        )}

        {/* Três colunas: reuniões + tarefas + conversas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {/* ── Próximas reuniões ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Calendar size={16} className="text-petrol-600" />
                Próximas reuniões
                {personName && <span className="text-xs font-normal text-gray-400">· {personName}</span>}
              </h2>
              <Link href="/reunioes" className="text-xs text-petrol-600 hover:underline">
                Agenda completa
              </Link>
            </div>

            {loadingMeetings ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : visibleMeetings.length === 0 ? (
              <div className="p-10 text-center">
                <Calendar size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  {period === "today"
                    ? "Nenhuma reunião pra hoje"
                    : period === "tomorrow"
                      ? "Nenhuma reunião pra amanhã"
                      : period === "week"
                        ? "Nenhuma reunião essa semana"
                        : personName
                          ? `Nenhuma reunião agendada com ${personName}`
                          : "Nenhuma reunião agendada"}
                </p>
              </div>
            ) : (
              <div>
                {(["today", "tomorrow", "later"] as const).map((bucket) => {
                  const items = meetingGroups[bucket];
                  if (items.length === 0) return null;
                  return (
                    <div key={bucket}>
                      <div className="px-5 py-1.5 bg-gray-50 border-y border-gray-100 first:border-t-0">
                        <span
                          className={clsx(
                            "text-[11px] font-semibold uppercase tracking-wide",
                            BUCKET_META[bucket].accent
                          )}
                        >
                          {BUCKET_META[bucket].label}
                          <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {items.map((m) => {
                          const soon = isSoon(m.startTime);
                          const name = m.contact?.name || m.inviteeName || m.inviteeEmail;
                          const canceled = m.status === "canceled";
                          const past = new Date(m.startTime).getTime() < Date.now();
                          return (
                            <div
                              key={m.id}
                              onClick={() => setMeetingDrawer(m)}
                              className={clsx(
                                "px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors",
                                soon && "bg-yellow-50 border-l-4 border-l-yellow-400"
                              )}
                            >
                              {/* Time */}
                              <div className="w-14 text-center flex-shrink-0">
                                {bucket === "later" && (
                                  <p className="text-[10px] font-medium text-gray-400 uppercase">
                                    {fmtDay(m.startTime)}
                                  </p>
                                )}
                                <p className="text-base font-bold text-gray-900 leading-tight">
                                  {fmtTime(m.startTime)}
                                </p>
                                <p className="text-[10px] text-gray-400">{fmtTime(m.endTime)}</p>
                              </div>

                              <div className="w-px h-10 bg-gray-200 flex-shrink-0" />

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className={clsx(
                                    "text-sm font-semibold truncate",
                                    canceled ? "text-gray-400 line-through" : "text-gray-900"
                                  )}
                                >
                                  {name}
                                </p>
                                {(m.dealOwnerName || m.hostName) && (
                                  <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                                    <UserIcon size={11} /> {m.dealOwnerName || m.hostName}
                                  </span>
                                )}
                              </div>

                              {/* Status escrito — igual ao card do Início; só aparece quando acontece */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {!canceled && m.confirmationStatus === "CONFIRMED" && (
                                  <span
                                    className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full"
                                    title={m.confirmedByName ? `Confirmada por ${m.confirmedByName}` : "Confirmada"}
                                  >
                                    Confirmada
                                  </span>
                                )}
                                {!canceled && m.confirmationStatus === "DECLINED" && (
                                  <span
                                    className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full"
                                    title="Lead avisou que não vem"
                                  >
                                    Não vem
                                  </span>
                                )}
                                {!canceled && m.confirmationStatus === "NO_SHOW" && (
                                  <span
                                    className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full"
                                    title="Lead não compareceu"
                                  >
                                    No-show
                                  </span>
                                )}
                                {!canceled && m.rescheduledAt && (
                                  <span
                                    className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full"
                                    title="Reunião reagendada"
                                  >
                                    Reagendada
                                  </span>
                                )}
                                {canceled && (
                                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                    Cancelada
                                  </span>
                                )}
                              </div>

                              {/* Countdown — só pra reunião que ainda vai acontecer */}
                              {bucket === "today" && !past && !canceled && (
                                <span
                                  className={clsx(
                                    "text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0",
                                    soon ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
                                  )}
                                >
                                  {timeUntil(m.startTime)}
                                </span>
                              )}

                              {/* Actions */}
                              <div
                                className="flex items-center gap-1 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!canceled && (
                                  <button
                                    onClick={() => toggleMeetingConfirmation(m)}
                                    disabled={confirmingMeetingId === m.id}
                                    title={
                                      m.confirmationStatus === "CONFIRMED"
                                        ? `Confirmada${m.confirmedByName ? ` por ${m.confirmedByName}` : ""} — clique pra desfazer`
                                        : m.confirmationStatus === "DECLINED"
                                          ? "Lead avisou que não vem"
                                          : "Marcar como confirmada"
                                    }
                                    className={clsx(
                                      "p-1.5 rounded-lg transition-colors disabled:opacity-50",
                                      m.confirmationStatus === "CONFIRMED"
                                        ? "text-white bg-green-500 hover:bg-green-600"
                                        : m.confirmationStatus === "DECLINED"
                                          ? "text-red-600 bg-red-50 hover:bg-red-100"
                                          : "text-gray-300 hover:text-green-600 hover:bg-green-50"
                                    )}
                                  >
                                    <CheckCircle size={16} />
                                  </button>
                                )}
                                {m.contact?.phone && (
                                  <button
                                    onClick={() => openWhatsAppChat(m.contact!.phone!)}
                                    title="Abrir WhatsApp"
                                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <MessageCircle size={16} />
                                  </button>
                                )}
                                {m.dealId && (
                                  <button
                                    onClick={() => setDealDrawerId(m.dealId)}
                                    title="Abrir negociação"
                                    className="p-1.5 rounded-lg text-petrol-600 hover:bg-petrol-50 transition-colors"
                                  >
                                    <PanelRightOpen size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Tarefas ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle size={16} className="text-petrol-600" />
                Tarefas
                {personName && <span className="text-xs font-normal text-gray-400">· {personName}</span>}
                {stageFilter && (
                  <button
                    onClick={() => setStageFilter(null)}
                    className="flex items-center gap-1 text-[11px] font-medium bg-petrol-50 text-petrol-700 px-2 py-0.5 rounded-full hover:bg-petrol-100 transition-colors"
                    title="Limpar filtro de etapa"
                  >
                    {stageFilter} <X size={11} />
                  </button>
                )}
              </h2>
              <Link href="/tasks" className="text-xs text-petrol-600 hover:underline">
                Ver todas
              </Link>
            </div>

            {/* Quick add */}
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createQuickTask()}
                placeholder={period === "tomorrow" ? "Nova tarefa pra amanhã..." : "Nova tarefa pra hoje..."}
                className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-petrol-500"
              />
              <button
                onClick={createQuickTask}
                disabled={!quickTitle.trim() || savingQuick}
                className="p-2 rounded-lg bg-petrol-600 text-white hover:bg-petrol-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Criar tarefa"
              >
                <Plus size={16} />
              </button>
            </div>

            {loadingTasks ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  {stageFilter
                    ? `Nenhuma tarefa pendente na etapa "${stageFilter}"`
                    : period === "today"
                      ? "Nada atrasado e nada pra hoje 🎉"
                      : period === "tomorrow"
                        ? "Nada pra amanhã"
                        : period === "week"
                          ? "Nada pendente essa semana 🎉"
                          : "Nenhuma tarefa pendente 🎉"}
                </p>
                {stageFilter && (
                  <button
                    onClick={() => setStageFilter(null)}
                    className="mt-2 text-xs text-petrol-600 hover:underline"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            ) : (
              <div>
                {(["overdue", "today", "tomorrow", "later"] as const).map((bucket) => {
                  const items = taskGroups[bucket];
                  if (items.length === 0) return null;
                  return (
                    <div key={bucket}>
                      <div
                        className={clsx(
                          "px-5 py-1.5 border-y border-gray-100 first:border-t-0",
                          bucket === "overdue" ? "bg-red-50" : "bg-gray-50"
                        )}
                      >
                        <span
                          className={clsx(
                            "text-[11px] font-semibold uppercase tracking-wide",
                            BUCKET_META[bucket].accent
                          )}
                        >
                          {BUCKET_META[bucket].label}
                          <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {items.map((task) => {
                          const TIcon = taskTypeIcons[task.type] ?? MoreHorizontal;
                          const timeStr = formatTaskTime(task);
                          const showTime = timeStr && timeStr !== "00:00";
                          const isToggling = togglingId === task.id;
                          const isEditing = editingTaskId === task.id;
                          return (
                            <div
                              key={task.id}
                              className={clsx(
                                "px-5 py-2.5 flex items-center gap-3 group",
                                bucket === "overdue" && "bg-red-50/40"
                              )}
                            >
                              {/* Complete */}
                              <button
                                onClick={() => completeTask(task)}
                                disabled={isToggling}
                                title="Concluir"
                                className="flex-shrink-0 text-gray-300 hover:text-green-600 transition-colors disabled:opacity-50"
                              >
                                {isToggling ? (
                                  <Clock size={18} className="animate-spin text-gray-400" />
                                ) : (
                                  <Circle size={18} />
                                )}
                              </button>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    type="text"
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveTaskTitle();
                                      if (e.key === "Escape") setEditingTaskId(null);
                                    }}
                                    onBlur={saveTaskTitle}
                                    className="w-full text-sm border border-petrol-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-petrol-500"
                                  />
                                ) : (
                                  <p className="text-sm text-gray-900 flex items-center gap-1.5 min-w-0">
                                    <TIcon size={12} className="text-gray-400 flex-shrink-0" />
                                    <span
                                      onClick={() => startEditTask(task)}
                                      title="Clique para editar o título"
                                      className="truncate cursor-text hover:bg-yellow-50 rounded px-0.5 -mx-0.5 transition-colors"
                                    >
                                      {task.title}
                                    </span>
                                  </p>
                                )}
                                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  {bucket !== "today" && task.dueDate && (
                                    <span className={clsx(bucket === "overdue" && "text-red-500 font-medium")}>
                                      {formatTaskDate(task)}
                                    </span>
                                  )}
                                  {showTime && <span>{timeStr}</span>}
                                  {task.deal?.stage && (
                                    <button
                                      onClick={() => setDealDrawerId(task.deal!.id)}
                                      title="Ver negociação"
                                      className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
                                      style={{
                                        backgroundColor: `${stageColor(task.deal.stage)}1A`,
                                        color: stageColor(task.deal.stage),
                                      }}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: stageColor(task.deal.stage) }}
                                      />
                                      {task.deal.stage.name}
                                    </button>
                                  )}
                                  {task.deal && (
                                    <button
                                      onClick={() => setDealDrawerId(task.deal!.id)}
                                      className="text-petrol-600 hover:underline truncate max-w-[180px]"
                                    >
                                      {task.deal.title}
                                    </button>
                                  )}
                                  {!task.deal && task.contact && <span>{task.contact.name}</span>}
                                  {personId === "all" && task.user && <span>· {task.user.name}</span>}
                                  {(() => {
                                    const mm = meetingMismatch(task);
                                    if (!mm) return null;
                                    const due = normalizeDueDate(task);
                                    return (
                                      <button
                                        onClick={() =>
                                          setMeetingFix({
                                            task,
                                            meeting: mm.meeting ?? null,
                                            startTime: due ? due.toISOString() : null,
                                          })
                                        }
                                        title={
                                          mm.kind === "missing"
                                            ? "Essa tarefa de reunião não tem reunião registrada — o lead não aparece no Início nem recebe lembrete. Clique para registrar."
                                            : `A reunião está registrada em ${fmtDay(mm.meeting!.startTime)} ${fmtTime(mm.meeting!.startTime)}. Clique para mover pra data da tarefa.`
                                        }
                                        className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                                      >
                                        <AlertTriangle size={10} />
                                        {mm.kind === "missing"
                                          ? "sem reunião registrada"
                                          : `reunião em ${fmtDay(mm.meeting!.startTime)}`}
                                      </button>
                                    );
                                  })()}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                {task.contact?.phone && (
                                  <button
                                    onClick={() => openWhatsAppChat(task.contact!.phone!)}
                                    title="Abrir WhatsApp"
                                    className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                                  >
                                    <MessageCircle size={15} />
                                  </button>
                                )}
                                {task.deal && (
                                  <button
                                    onClick={() =>
                                      openConversation({
                                        dealId: task.deal!.id,
                                        contactName: task.contact?.name || task.deal!.title,
                                        contactPhone: task.contact?.phone || "",
                                      })
                                    }
                                    title="Abrir conversa (WABA)"
                                    className="p-1.5 rounded-lg text-petrol-600 hover:bg-petrol-50 transition-colors"
                                  >
                                    <MessageSquare size={15} />
                                  </button>
                                )}
                                {/* Tarefa de reunião com reunião registrada: adiar = REMARCAR.
                                    Adiar só a tarefa deixava a reunião (e o lembrete do lead) pra trás. */}
                                {(() => {
                                  const linked = meetingForTask(task);
                                  if (!linked) {
                                    return (
                                      <PostponeDropdown
                                        currentDueDate={normalizeDueDate(task)}
                                        onPostpone={(d) => postponeTask(task.id, d)}
                                        size="sm"
                                      />
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={() =>
                                        setMeetingFix({
                                          task,
                                          meeting: linked,
                                          startTime: linked.startTime,
                                        })
                                      }
                                      title="Remarcar reunião — move a reunião, a tarefa e os lembretes do lead"
                                      className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-petrol-600 hover:bg-petrol-50 transition-colors"
                                    >
                                      <CalendarClock size={13} />
                                    </button>
                                  );
                                })()}
                                {task.deal && (
                                  <button
                                    onClick={() => setDealDrawerId(task.deal!.id)}
                                    title="Abrir negociação"
                                    className="p-1.5 rounded-lg text-petrol-600 hover:bg-petrol-50 transition-colors"
                                  >
                                    <PanelRightOpen size={15} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {tasksTotal > tasks.length && (
                  <Link
                    href="/tasks"
                    className="block px-5 py-2.5 text-center text-xs font-medium text-petrol-700 hover:bg-petrol-50 border-t border-gray-100 transition-colors"
                  >
                    +{tasksTotal - tasks.length} tarefas — ver todas
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* ── Conversas (SLA) ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden lg:col-span-2 xl:col-span-1">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare size={16} className="text-petrol-600" />
                Conversas
                {personName && <span className="text-xs font-normal text-gray-400">· {personName}</span>}
                {convGroups.responder.length > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                    {convGroups.responder.length}
                  </span>
                )}
              </h2>
              <Link href="/waba/chat" className="text-xs text-petrol-600 hover:underline">
                Abrir WhatsApp
              </Link>
            </div>

            {loadingConvs ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 && comercialPending.length === 0 ? (
              <div className="p-10 text-center">
                <MessageSquare size={40} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  {personName
                    ? `Nenhuma conversa aberta dos leads de ${personName}`
                    : "Nenhuma conversa aberta"}
                </p>
              </div>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                {(["responder", "agenda", "bia", "aguardando"] as const).map((bucket) => {
                  const items = convGroups[bucket];
                  if (items.length === 0) return null;
                  const collapsed = collapsedConvGroups[bucket] ?? false;
                  return (
                    <div key={bucket}>
                      <button
                        onClick={() =>
                          setCollapsedConvGroups((prev) => ({ ...prev, [bucket]: !collapsed }))
                        }
                        className={clsx(
                          "w-full text-left px-5 py-1.5 border-y border-gray-100 first:border-t-0 sticky top-0 z-10 flex items-center justify-between cursor-pointer",
                          bucket === "responder"
                            ? "bg-red-50"
                            : bucket === "agenda"
                              ? "bg-petrol-50"
                              : bucket === "bia"
                                ? "bg-purple-50"
                                : "bg-gray-50"
                        )}
                      >
                        <span
                          className={clsx(
                            "text-[11px] font-semibold uppercase tracking-wide",
                            CONV_BUCKET_META[bucket].accent
                          )}
                        >
                          {convBucketLabel(bucket, period)}
                          <span className="ml-1.5 font-normal text-gray-400">({items.length})</span>
                        </span>
                        <ChevronDown
                          size={13}
                          className={clsx("text-gray-400 transition-transform", collapsed && "-rotate-90")}
                        />
                      </button>
                      <div className={clsx("divide-y divide-gray-50", collapsed && "hidden")}>
                        {items.map((row) => (
                            <div
                              key={row.key}
                              onClick={() =>
                                setChatConv({
                                  wabaConversationId: row.wabaConversationId,
                                  contactName: row.name,
                                  contactPhone: row.phone,
                                  dealId: row.dealId || undefined,
                                  initialChannel: row.channel === "comercial" ? "comercial" : undefined,
                                })
                              }
                              className={clsx(
                                "px-5 py-2.5 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors",
                                bucket === "responder" && "bg-red-50/30"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{row.name}</p>
                                  {row.channel === "comercial" && (
                                    <span
                                      title="Sem resposta no número Comercial (Messenger)"
                                      className="flex items-center gap-0.5 text-[10px] font-medium bg-petrol-100 text-petrol-700 px-1.5 py-0.5 rounded-full flex-shrink-0"
                                    >
                                      <Phone size={10} /> Comercial
                                    </span>
                                  )}
                                  {row.isActive && (
                                    <span
                                      title="BIA conduzindo"
                                      className="flex items-center gap-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex-shrink-0"
                                    >
                                      <Bot size={10} /> BIA
                                    </span>
                                  )}
                                  {row.respondedViaComercial && (
                                    <span
                                      title="Equipe respondeu pelo número Comercial"
                                      className="flex items-center gap-0.5 text-[10px] font-medium bg-petrol-50 text-petrol-600 px-1.5 py-0.5 rounded-full flex-shrink-0"
                                    >
                                      <Phone size={10} /> respondida no Comercial
                                    </span>
                                  )}
                                  {row.todayLabel && (
                                    <span
                                      title={
                                        row.todayLabel.includes("cancelada")
                                          ? "Reunião cancelada nesse período — lead precisa de contato"
                                          : "Compromisso do lead no período filtrado"
                                      }
                                      className={clsx(
                                        "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0",
                                        row.todayLabel.includes("cancelada")
                                          ? "bg-red-100 text-red-700"
                                          : "bg-amber-100 text-amber-700"
                                      )}
                                    >
                                      <Calendar size={10} /> {row.todayLabel}
                                    </span>
                                  )}
                                  {row.unreadCount > 0 && (
                                    <span className="text-[10px] font-bold bg-green-500 text-white min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full flex-shrink-0">
                                      {row.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{row.preview}</p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  {row.dealStage && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-1.5 py-0.5"
                                      style={{
                                        backgroundColor: `${stageColor(row.dealStage)}1A`,
                                        color: stageColor(row.dealStage),
                                      }}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: stageColor(row.dealStage) }}
                                      />
                                      {row.dealStage.name}
                                    </span>
                                  )}
                                  {personId === "all" && row.dealOwnerName && (
                                    <span className="text-[10px] text-gray-400">{row.dealOwnerName}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span
                                  className={clsx(
                                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                    bucket === "responder"
                                      ? slaClass(row.waitingSince)
                                      : "bg-gray-100 text-gray-500"
                                  )}
                                >
                                  {timeSince(row.waitingSince)}
                                </span>
                                {row.dealId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDealDrawerId(row.dealId);
                                    }}
                                    title="Abrir negociação"
                                    className="p-1 rounded-lg text-petrol-600 hover:bg-petrol-50 transition-colors"
                                  >
                                    <PanelRightOpen size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Drawers ── */}
      {dealDrawerId && (
        <DealDrawer
          dealId={dealDrawerId}
          onClose={() => setDealDrawerId(null)}
          onOpenConversation={(args) => {
            setDealDrawerId(null);
            openConversation(args);
          }}
          onChanged={refreshAll}
        />
      )}
      {meetingDrawer && (
        <MeetingDrawer
          meeting={meetingDrawer}
          onChanged={fetchMeetings}
          onClose={() => setMeetingDrawer(null)}
          onOpenDeal={(dealId) => {
            setMeetingDrawer(null);
            setDealDrawerId(dealId);
          }}
          onOpenConversation={(args) => {
            setMeetingDrawer(null);
            openConversation(args);
          }}
        />
      )}
      {convDrawer && (
        <ConversationDrawer
          dealId={convDrawer.dealId}
          contactName={convDrawer.contactName}
          contactPhone={convDrawer.contactPhone}
          onClose={() => setConvDrawer(null)}
        />
      )}
      {meetingFix && (
        <ManualMeetingDialog
          dealTitle={meetingFix.task.deal?.title || meetingFix.task.title}
          contactName={meetingFix.task.contact?.name || ""}
          mode={meetingFix.meeting ? "reschedule" : "create"}
          initialStartTime={meetingFix.startTime}
          onConfirm={applyMeetingFix}
          onCancel={() => setMeetingFix(null)}
        />
      )}
      {chatConv && (
        <ConversationTabs
          wabaConversationId={chatConv.wabaConversationId}
          contactName={chatConv.contactName}
          contactPhone={chatConv.contactPhone}
          dealId={chatConv.dealId}
          initialChannel={chatConv.initialChannel}
          onClose={() => {
            setChatConv(null);
            fetchConversations();
          }}
        />
      )}
    </div>
  );
}
