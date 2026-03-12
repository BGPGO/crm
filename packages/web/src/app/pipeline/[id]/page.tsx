"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Check,
  X,
  Building2,
  User,
  Phone,
  Mail,
  Copy,
  MessageCircle,
  UserPlus,
  ExternalLink,
  RotateCcw,
  Pencil,
  Loader2,
  Trash2,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Textarea from "@/components/ui/Textarea";
import DealTimeline, { TimelineEvent } from "@/components/deal/DealTimeline";
import DealProducts, { DealProduct } from "@/components/deal/DealProducts";
import DealTasks, { DealTask } from "@/components/deal/DealTasks";
import CollapsibleSection from "@/components/deal/CollapsibleSection";
import InlineField from "@/components/deal/InlineField";
import StageProgressBar from "@/components/deal/StageProgressBar";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { api } from "@/lib/api";
import clsx from "clsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type DealStatus = "active" | "won" | "lost";

interface Stage {
  id: string;
  name: string;
  order?: number;
}

interface DealContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface DealContactLink {
  id: string;
  contact: DealContact;
  isPrimary: boolean;
}

interface DealDetail {
  id: string;
  title: string;
  status: DealStatus;
  stageId: string;
  stageName: string;
  value: number;
  expectedCloseDate?: string;
  closedAt?: string;
  classification?: number;
  contaAzulCode?: string;
  recurrence?: string;
  pipeline?: { id: string; name: string; stages: Stage[] };
  stage?: { id: string; name: string; order: number };
  contact?: { id: string; name: string; phone?: string; email?: string };
  organization?: { id: string; name: string; cnpj?: string; website?: string; instagram?: string };
  user?: { id: string; name: string };
  source?: { id: string; name: string };
  lostReason?: { id: string; name: string };
  tasks: DealTask[];
  dealProducts: Array<{
    id: string;
    product: { id?: string; name: string; recurrence?: string };
    quantity: number;
    unitPrice: number;
    discount?: number;
  }>;
  dealContacts: DealContactLink[];
}

interface LostReason {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
}

interface ContactOption {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

type TabKey = "historico" | "tarefas" | "produtos" | "arquivos";

// ─── Constants ───────────────────────────────────────────────────────────────

const TASK_TYPES = [
  { value: "CALL", label: "Ligação" },
  { value: "MEETING", label: "Reunião" },
  { value: "VISIT", label: "Visita" },
  { value: "EMAIL", label: "Email" },
  { value: "OTHER", label: "Outro" },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "historico", label: "Histórico" },
  { key: "tarefas", label: "Tarefas" },
  { key: "produtos", label: "Produtos e Serviços" },
  { key: "arquivos", label: "Arquivos" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapApiStatus(apiStatus: string): DealStatus {
  if (apiStatus === "WON") return "won";
  if (apiStatus === "LOST") return "lost";
  return "active";
}

function mapApiDeal(data: Record<string, unknown>): DealDetail {
  return {
    id: data.id as string,
    title: data.title as string,
    status: mapApiStatus(data.status as string),
    stageId: (data.stage as { id: string; name: string; order: number } | undefined)?.id ?? "",
    stageName: (data.stage as { id: string; name: string; order: number } | undefined)?.name ?? "",
    value: (data.value as number) ?? 0,
    expectedCloseDate: data.expectedCloseDate as string | undefined,
    closedAt: data.closedAt as string | undefined,
    classification: data.classification as number | undefined,
    contaAzulCode: data.contaAzulCode as string | undefined,
    recurrence: data.recurrence as string | undefined,
    pipeline: data.pipeline as DealDetail["pipeline"],
    stage: data.stage as DealDetail["stage"],
    contact: data.contact as DealDetail["contact"],
    organization: data.organization as DealDetail["organization"],
    user: data.user as DealDetail["user"],
    source: data.source as DealDetail["source"],
    lostReason: data.lostReason as DealDetail["lostReason"],
    tasks: ((data.tasks as unknown[]) ?? []).map((t: unknown) => {
      const task = t as Record<string, unknown>;
      return {
        id: task.id as string,
        title: task.title as string,
        type: task.type as string,
        dueDate: task.dueDate as string | undefined,
        done: task.status === "COMPLETED",
      };
    }),
    dealProducts: (((data.dealProducts ?? data.products) as unknown[]) ?? []).map((dp: unknown) => {
      const d = dp as Record<string, unknown>;
      const prod = d.product as Record<string, unknown> ?? {};
      return {
        id: d.id as string,
        product: { id: prod.id as string | undefined, name: prod.name as string },
        quantity: (d.quantity as number) ?? 1,
        unitPrice: (d.unitPrice as number) ?? 0,
        discount: (d.discount as number) ?? 0,
      };
    }),
    dealContacts: ((data.dealContacts as unknown[]) ?? []).map((dc: unknown) => {
      const link = dc as Record<string, unknown>;
      const c = link.contact as Record<string, unknown> ?? {};
      return {
        id: link.id as string,
        contact: {
          id: c.id as string,
          name: c.name as string,
          phone: c.phone as string | undefined,
          email: c.email as string | undefined,
        },
        isPrimary: link.isPrimary as boolean,
      };
    }),
  };
}

function mapApiTimeline(items: unknown[]): TimelineEvent[] {
  return items.map((item: unknown) => {
    const e = item as Record<string, unknown>;
    const user = e.user as Record<string, unknown> | undefined;
    const contact = e.contact as Record<string, unknown> | undefined;
    return {
      id: e.id as string,
      type: e.type as TimelineEvent["type"],
      content: e.content as string,
      date: new Date(e.createdAt as string),
      user: (user?.name ?? contact?.name ?? "Sistema") as string,
    };
  });
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill={n <= value ? "#FBBF24" : "none"}
          stroke={n <= value ? "#FBBF24" : "#D1D5DB"}
          strokeWidth="1.2"
        >
          <path d="M7 1l1.545 3.13L12 4.635l-2.5 2.435.59 3.44L7 8.885l-3.09 1.625L4.5 7.07 2 4.635l3.455-.505L7 1z" />
        </svg>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: DealStatus }) {
  const map = {
    active: { cls: "bg-blue-100 text-blue-700", label: "Em andamento" },
    won: { cls: "bg-green-100 text-green-700", label: "VENDIDA" },
    lost: { cls: "bg-red-100 text-red-700", label: "PERDIDA" },
  };
  const { cls, label } = map[status];
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ─── Sidebar Contact Item ─────────────────────────────────────────────────────

function SidebarContact({
  contact,
  onRemove,
}: {
  contact: DealContact;
  onRemove?: () => void;
}) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          <User size={12} />
        </div>
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{contact.name}</span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-0.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
            title="Remover contato"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {contact.phone && (
        <div className="flex items-center gap-1 pl-8 mb-0.5">
          <a
            href={`tel:${contact.phone}`}
            className="text-xs text-gray-600 hover:text-blue-600 transition-colors flex-1 truncate"
          >
            {contact.phone}
          </a>
          <button
            onClick={() => copyToClipboard(contact.phone!)}
            className="p-0.5 text-gray-300 hover:text-gray-600 transition-colors"
            title="Copiar"
          >
            <Copy size={11} />
          </button>
          <a
            href={`tel:${contact.phone}`}
            className="p-0.5 text-gray-300 hover:text-blue-500 transition-colors"
            title="Ligar"
          >
            <Phone size={11} />
          </a>
          <a
            href={`https://wa.me/55${contact.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 text-gray-300 hover:text-green-500 transition-colors"
            title="WhatsApp"
          >
            <MessageCircle size={11} />
          </a>
        </div>
      )}

      {contact.email && (
        <div className="flex items-center gap-1 pl-8">
          <a
            href={`mailto:${contact.email}`}
            className="text-xs text-gray-600 hover:text-blue-600 transition-colors flex-1 truncate"
          >
            {contact.email}
          </a>
          <button
            onClick={() => copyToClipboard(contact.email!)}
            className="p-0.5 text-gray-300 hover:text-gray-600 transition-colors"
            title="Copiar"
          >
            <Copy size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Inline Editable Title ───────────────────────────────────────────────────

function EditableTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    if (draft.trim()) onChange(draft.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
          className="text-2xl font-bold text-gray-900 border-b-2 border-blue-500 outline-none bg-transparent flex-1"
        />
        <button onClick={commit} className="p-1 text-green-600 hover:text-green-700">
          <Check size={16} />
        </button>
        <button
          onClick={() => { setDraft(value); setEditing(false); }}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 group cursor-pointer"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      <h1 className="text-2xl font-bold text-gray-900 leading-tight">{value}</h1>
      <Pencil size={14} className="text-gray-300 group-hover:text-blue-400 transition-colors flex-shrink-0" />
    </div>
  );
}

// ─── Loading / Error states ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-3 bg-gray-50">
      <Loader2 size={32} className="text-blue-500 animate-spin" />
      <p className="text-sm text-gray-500">Carregando negociação...</p>
    </div>
  );
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-4 bg-gray-50">
      <div className="text-center">
        <p className="text-base font-semibold text-gray-700">Negociação não encontrada</p>
        <p className="text-sm text-gray-400 mt-1">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onBack}>
        <ChevronLeft size={14} />
        Voltar ao Funil
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DealDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dealId = params.id;

  // ── Data state ────────────────────────────────────────────────────────────
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [lostReasons, setLostReasons] = useState<LostReason[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("historico");

  // Auto-select tab from ?tab= query param
  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey | null;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Modals
  const [showLossModal, setShowLossModal] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  // Add-contact picker
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");

  // Add-product picker
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQuantity, setProductQuantity] = useState(1);

  // Add-task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Submission loading flags
  const [submitting, setSubmitting] = useState(false);

  // ── Load deal on mount ────────────────────────────────────────────────────
  const loadDeal = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get<{ data: Record<string, unknown> }>(`/deals/${dealId}`);
      const mapped = mapApiDeal(res.data);
      setDeal(mapped);

      // Load pipeline stages
      if (mapped.pipeline?.id) {
        try {
          const stagesRes = await api.get<{ data: Stage[] }>(`/pipeline-stages?pipelineId=${mapped.pipeline.id}`);
          setStages(stagesRes.data ?? mapped.pipeline.stages ?? []);
        } catch {
          setStages(mapped.pipeline?.stages ?? []);
        }
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      setLoadError(e?.message ?? "Erro ao carregar negociação.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  const loadTimeline = useCallback(async () => {
    try {
      const res = await api.get<{ data: unknown[] }>(`/deals/${dealId}/timeline`);
      setTimeline(mapApiTimeline(res.data ?? []));
    } catch {
      // Timeline is non-critical; leave empty
    }
  }, [dealId]);

  useEffect(() => {
    loadDeal();
    loadTimeline();
  }, [loadDeal, loadTimeline]);

  // ── Derived values ────────────────────────────────────────────────────────
  const totalValue = (deal?.dealProducts ?? []).reduce(
    (sum, p) => sum + p.unitPrice * p.quantity * (1 - (p.discount ?? 0) / 100),
    0
  );

  const pendingTaskCount = (deal?.tasks ?? []).filter((t) => !t.done).length;

  // ── Action handlers ───────────────────────────────────────────────────────

  const handleMarkWon = async () => {
    if (!deal) return;
    setSubmitting(true);
    try {
      await api.patch(`/deals/${dealId}/status`, { status: "WON" });
      const lastStage = stages[stages.length - 1];
      setDeal((d) => d ? { ...d, status: "won", stageId: lastStage?.id ?? d.stageId } : d);
      setShowWinModal(false);
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao marcar como venda: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkLost = async () => {
    if (!deal || !lossReason) return;
    setSubmitting(true);
    try {
      await api.patch(`/deals/${dealId}/status`, { status: "LOST", lostReasonId: lossReason });
      setDeal((d) => d ? { ...d, status: "lost" } : d);
      setShowLossModal(false);
      setLossReason("");
      setLossNote("");
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao marcar como perda: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkActive = async () => {
    if (!deal) return;
    try {
      await api.patch(`/deals/${dealId}/status`, { status: "OPEN" });
      setDeal((d) => d ? { ...d, status: "active" } : d);
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao retomar negociação: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleStageClick = async (stageId: string) => {
    if (!deal || deal.status !== "active") return;
    // Optimistic update
    setDeal((d) => d ? { ...d, stageId } : d);
    try {
      await api.patch(`/deals/${dealId}/stage`, { stageId });
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      // Revert optimistic update
      setDeal((d) => d ? { ...d, stageId: deal.stageId } : d);
      alert(`Erro ao mover etapa: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleUpdateDeal = async (field: string, value: string) => {
    if (!deal) return;
    try {
      await api.put(`/deals/${dealId}`, { [field]: value });
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao atualizar campo: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleUpdateOrg = async (field: string, value: string) => {
    if (!deal?.organization?.id) return;
    try {
      await api.put(`/organizations/${deal.organization.id}`, { [field]: value });
    } catch {
      // Silent fail — UI already updated optimistically via InlineField
    }
  };

  const handleAddNote = async (note: string) => {
    try {
      // Get admin user id if not known
      let userId = deal?.user?.id;
      if (!userId) {
        try {
          const usersRes = await api.get<{ data: Array<{ id: string }> }>("/users");
          userId = usersRes.data?.[0]?.id;
        } catch {
          // ignore
        }
      }
      if (!userId) {
        alert("Erro: nenhum usuário encontrado para associar a anotação.");
        return;
      }
      await api.post("/activities", {
        type: "NOTE",
        content: note,
        userId,
        dealId,
      });
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao salvar anotação: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleToggleTask = async (id: string) => {
    if (!deal) return;
    const task = deal.tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus = task.done ? "PENDING" : "COMPLETED";
    // Optimistic update
    setDeal((d) =>
      d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) } : d
    );
    try {
      await api.put(`/tasks/${id}`, { status: newStatus });
    } catch (err: unknown) {
      const e = err as { message?: string };
      // Revert
      setDeal((d) =>
        d ? { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: task.done } : t)) } : d
      );
      alert(`Erro ao atualizar tarefa: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !deal) return;
    setSubmitting(true);
    try {
      const userId = deal.user?.id;
      if (!userId) {
        alert("Erro: negociação sem responsável atribuído.");
        setSubmitting(false);
        return;
      }
      const res = await api.post<{ data: Record<string, unknown> }>("/tasks", {
        title: taskTitle.trim(),
        type: taskType,
        dueDate: taskDueDate || undefined,
        userId,
        dealId,
      });
      const created = res.data;
      const newTask: DealTask = {
        id: created.id as string,
        title: created.title as string,
        type: created.type as string,
        dueDate: created.dueDate as string | undefined,
        done: false,
      };
      setDeal((d) => d ? { ...d, tasks: [...d.tasks, newTask] } : d);
      setShowAddTask(false);
      setTaskTitle("");
      setTaskType("CALL");
      setTaskDueDate("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao criar tarefa: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveProduct = async (id: string) => {
    if (!deal) return;
    // Optimistic
    setDeal((d) => d ? { ...d, dealProducts: d.dealProducts.filter((p) => p.id !== id) } : d);
    try {
      await api.delete(`/deal-products/${id}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      // Reload to restore
      loadDeal();
      alert(`Erro ao remover produto: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleOpenAddProduct = async () => {
    if (products.length === 0) {
      try {
        const res = await api.get<{ data: Product[] }>("/products");
        setProducts(res.data ?? []);
      } catch {
        // ignore
      }
    }
    setSelectedProductId("");
    setProductQuantity(1);
    setShowAddProduct(true);
  };

  const handleAddProduct = async () => {
    if (!selectedProductId || !deal) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ data: Record<string, unknown> }>("/deal-products", {
        dealId,
        productId: selectedProductId,
        quantity: productQuantity,
      });
      const newDp = res.data;
      const prod = products.find((p) => p.id === selectedProductId);
      setDeal((d) =>
        d
          ? {
              ...d,
              dealProducts: [
                ...d.dealProducts,
                {
                  id: newDp.id as string,
                  product: { id: selectedProductId, name: prod?.name ?? "" },
                  quantity: productQuantity,
                  unitPrice: (newDp.unitPrice as number) ?? prod?.price ?? 0,
                  discount: 0,
                },
              ],
            }
          : d
      );
      setShowAddProduct(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao adicionar produto: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAddContact = async () => {
    if (contactOptions.length === 0) {
      try {
        const res = await api.get<{ data: ContactOption[] }>("/contacts");
        setContactOptions(res.data ?? []);
      } catch {
        // ignore
      }
    }
    setSelectedContactId("");
    setContactSearch("");
    setShowAddContact(true);
  };

  const handleAddContact = async () => {
    if (!selectedContactId || !deal) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ data: DealContactLink }>(`/deals/${dealId}/contacts`, {
        contactId: selectedContactId,
        isPrimary: deal.dealContacts.length === 0,
      });
      const linked = res.data;
      setDeal((d) => d ? { ...d, dealContacts: [...d.dealContacts, linked] } : d);
      setShowAddContact(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao adicionar contato: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!deal) return;
    // Optimistic
    setDeal((d) =>
      d ? { ...d, dealContacts: d.dealContacts.filter((dc) => dc.contact.id !== contactId) } : d
    );
    try {
      await api.delete(`/deals/${dealId}/contacts/${contactId}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      loadDeal();
      alert(`Erro ao remover contato: ${e?.message ?? "Tente novamente."}`);
    }
  };

  const handleOpenLossModal = async () => {
    if (lostReasons.length === 0) {
      try {
        const res = await api.get<{ data: LostReason[] }>("/lost-reasons");
        setLostReasons(res.data ?? []);
      } catch {
        // ignore
      }
    }
    setLossReason("");
    setLossNote("");
    setShowLossModal(true);
  };

  // ── Build DealProducts list for component ──────────────────────────────────
  const dealProductsForComponent: DealProduct[] = (deal?.dealProducts ?? []).map((dp) => ({
    id: dp.id,
    name: dp.product.name,
    recurrence: dp.product?.recurrence ?? "—",
    price: dp.unitPrice,
    quantity: dp.quantity,
  }));

  // ── Filtered contacts search ────────────────────────────────────────────────
  const filteredContactOptions = contactOptions.filter((c) =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(contactSearch.toLowerCase())
  );

  // ── Loss reason options for Select ─────────────────────────────────────────
  const lossReasonOptions = lostReasons.map((r) => ({ value: r.id, label: r.name }));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <LoadingState />;
  if (loadError || !deal) return <ErrorState message={loadError ?? "Não encontrado."} onBack={() => router.push("/pipeline")} />;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* ── Top: back link + stage bar ─────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <button
          onClick={() => router.push("/pipeline")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3 transition-colors"
        >
          <ChevronLeft size={16} />
          Funil de Vendas
        </button>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <EditableTitle
              value={deal.title}
              onChange={(v) => {
                setDeal((d) => d ? { ...d, title: v } : d);
                handleUpdateDeal("title", v);
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-blue-600">
                {formatCurrency(totalValue || deal.value)}
              </span>
              <StatusBadge status={deal.status} />
              {(deal.classification ?? 0) > 0 && (
                <StarRating value={deal.classification!} />
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            {deal.status === "active" && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowWinModal(true)}
                  className="bg-green-600 hover:bg-green-700 border-green-600"
                >
                  <Check size={14} />
                  Marcar como Venda
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleOpenLossModal}
                >
                  <X size={14} />
                  Marcar como Perda
                </Button>
              </>
            )}
            {(deal.status === "won" || deal.status === "lost") && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkActive}
              >
                <RotateCcw size={14} />
                Retomar Negociação
              </Button>
            )}
          </div>
        </div>

        {/* Stage progress bar */}
        {stages.length > 0 && (
          <StageProgressBar
            stages={stages}
            currentStageId={deal.stageId}
            status={deal.status}
            onStageClick={handleStageClick}
          />
        )}
      </div>

      {/* ── Body: sidebar + main ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar (~35%) ── */}
        <aside className="w-80 xl:w-96 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">

          {/* Seção: Negociação */}
          <CollapsibleSection title="Negociação" defaultOpen>
            <div className="divide-y divide-gray-100">
              <InlineField
                label="Negociação"
                value={deal.title}
                onChange={(v) => {
                  setDeal((d) => d ? { ...d, title: v } : d);
                  handleUpdateDeal("title", v);
                }}
              />
              {(deal.classification ?? 0) > 0 && (
                <div className="py-2">
                  <span className="text-xs text-gray-400">Qualificação</span>
                  <div className="mt-1">
                    <StarRating value={deal.classification!} />
                  </div>
                </div>
              )}
              <div className="py-2">
                <span className="text-xs text-gray-400">Valor total</span>
                <p className="text-sm font-semibold text-blue-600 mt-0.5">
                  {formatCurrency(totalValue || deal.value)}
                </p>
              </div>
              <InlineField
                label="Data de fechamento"
                value={deal.expectedCloseDate ?? ""}
                type="date"
                onChange={(v) => {
                  setDeal((d) => d ? { ...d, expectedCloseDate: v } : d);
                  handleUpdateDeal("expectedCloseDate", v);
                }}
                formatValue={(v) => (v ? formatDate(v) : "")}
              />
              {deal.source && (
                <div className="py-2">
                  <span className="text-xs text-gray-400">Fonte</span>
                  <p className="text-sm text-gray-700 mt-0.5">{deal.source.name}</p>
                </div>
              )}
              {deal.contaAzulCode && (
                <InlineField
                  label="Código Conta Azul"
                  value={deal.contaAzulCode}
                  onChange={(v) => {
                    setDeal((d) => d ? { ...d, contaAzulCode: v } : d);
                    handleUpdateDeal("contaAzulCode", v);
                  }}
                />
              )}
            </div>
          </CollapsibleSection>

          {/* Seção: Contatos */}
          <CollapsibleSection title="Contatos" defaultOpen>
            <div>
              {deal.dealContacts.length === 0 && (
                <p className="text-xs text-gray-400 italic mb-2">Nenhum contato vinculado.</p>
              )}
              {deal.dealContacts.map((dc) => (
                <SidebarContact
                  key={dc.id}
                  contact={dc.contact}
                  onRemove={() => handleRemoveContact(dc.contact.id)}
                />
              ))}
              {/* Primary contact (from deal.contact) if not in dealContacts */}
              {deal.contact && deal.dealContacts.length === 0 && (
                <SidebarContact key={deal.contact.id} contact={deal.contact} />
              )}
              <button
                onClick={handleOpenAddContact}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors mt-2"
              >
                <UserPlus size={13} />
                Adicionar contato
              </button>
            </div>
          </CollapsibleSection>

          {/* Seção: Empresa */}
          {deal.organization && (
            <CollapsibleSection title="Empresa" defaultOpen>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Building2 size={14} className="text-gray-500" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800 truncate">
                    {deal.organization.name || "—"}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {deal.organization.cnpj !== undefined && (
                    <InlineField
                      label="CNPJ"
                      value={deal.organization.cnpj ?? ""}
                      onChange={(v) => {
                        setDeal((d) => d ? { ...d, organization: { ...d.organization!, cnpj: v } } : d);
                        handleUpdateOrg("cnpj", v);
                      }}
                    />
                  )}
                  {deal.organization.website !== undefined && (
                    <InlineField
                      label="Site"
                      value={deal.organization.website ?? ""}
                      readOnly
                      href={deal.organization.website ? `https://${deal.organization.website}` : undefined}
                    />
                  )}
                  {deal.organization.instagram !== undefined && (
                    <InlineField
                      label="Instagram"
                      value={deal.organization.instagram ?? ""}
                      onChange={(v) => {
                        setDeal((d) => d ? { ...d, organization: { ...d.organization!, instagram: v } } : d);
                        handleUpdateOrg("instagram", v);
                      }}
                    />
                  )}
                </div>
                {deal.organization.website && (
                  <a
                    href={`https://${deal.organization.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Abrir página da Empresa
                  </a>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Seção: Responsável */}
          {deal.user && (
            <CollapsibleSection title="Responsável" defaultOpen>
              <div className="flex items-center gap-2 py-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <User size={14} />
                </div>
                <span className="text-sm text-gray-700">{deal.user.name}</span>
              </div>
            </CollapsibleSection>
          )}
        </aside>

        {/* ── Right main content (~65%) ── */}
        <main className="flex-1 overflow-y-auto flex flex-col">

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <nav className="flex gap-0 -mb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={clsx(
                    "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                    activeTab === tab.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  )}
                >
                  {tab.label}
                  {tab.key === "tarefas" && pendingTaskCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {pendingTaskCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="flex-1 p-6">

            {/* ── Histórico ── */}
            {activeTab === "historico" && (
              <DealTimeline
                events={timeline}
                onAddNote={handleAddNote}
              />
            )}

            {/* ── Tarefas ── */}
            {activeTab === "tarefas" && (
              <div>
                <DealTasks
                  tasks={deal.tasks}
                  onToggle={handleToggleTask}
                  onAdd={() => setShowAddTask(true)}
                />

                {/* Inline add-task form */}
                {showAddTask && (
                  <div className="mt-4 border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
                    <p className="text-sm font-semibold text-gray-700">Nova Tarefa</p>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Título</label>
                      <input
                        autoFocus
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="Título da tarefa..."
                        className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
                        <select
                          value={taskType}
                          onChange={(e) => setTaskType(e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        >
                          {TASK_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 mb-1 block">Prazo</label>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" size="sm" onClick={() => setShowAddTask(false)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        disabled={!taskTitle.trim() || submitting}
                        onClick={handleCreateTask}
                      >
                        {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
                        Criar Tarefa
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Produtos ── */}
            {activeTab === "produtos" && (
              <DealProducts
                products={dealProductsForComponent}
                onAdd={handleOpenAddProduct}
                onRemove={handleRemoveProduct}
              />
            )}

            {/* ── Arquivos ── */}
            {activeTab === "arquivos" && (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 64 64"
                  fill="none"
                  className="opacity-30"
                >
                  <rect x="8" y="4" width="36" height="48" rx="4" fill="#E5E7EB" />
                  <rect x="10" y="6" width="32" height="4" rx="2" fill="#D1D5DB" />
                  <rect x="10" y="14" width="32" height="3" rx="1.5" fill="#E5E7EB" />
                  <rect x="10" y="20" width="24" height="3" rx="1.5" fill="#E5E7EB" />
                  <path d="M44 36l8 8-8 8V36z" fill="#9CA3AF" />
                </svg>
                <p className="text-sm font-medium text-gray-500">Nenhum arquivo anexado</p>
                <p className="text-xs text-gray-400">Arraste arquivos aqui ou clique para fazer upload.</p>
                <button className="mt-1 text-xs font-semibold text-blue-600 border border-blue-300 hover:bg-blue-50 px-4 py-2 rounded-md transition-colors">
                  Anexar arquivo
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Modal: Marcar como Perda ── */}
      <Modal
        isOpen={showLossModal}
        onClose={() => setShowLossModal(false)}
        title="Marcar como Perda"
        size="sm"
      >
        <div className="space-y-4">
          <Select
            label="Motivo da perda"
            value={lossReason}
            placeholder="Selecione um motivo"
            options={lossReasonOptions}
            onChange={(e) => setLossReason(e.target.value)}
          />
          <Textarea
            label="Observação (opcional)"
            value={lossNote}
            onChange={(e) => setLossNote(e.target.value)}
            placeholder="Detalhes sobre o motivo..."
            rows={3}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowLossModal(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!lossReason || submitting}
              onClick={handleMarkLost}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
              Confirmar Perda
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Marcar como Venda ── */}
      <Modal
        isOpen={showWinModal}
        onClose={() => setShowWinModal(false)}
        title="Confirmar Venda"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Confirme os detalhes antes de marcar esta negociação como venda.
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold text-green-800">{deal.title}</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalValue || deal.value)}</p>
          </div>

          {deal.dealProducts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Produtos incluídos</p>
              <ul className="space-y-1">
                {deal.dealProducts.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{p.product.name}</span>
                    <span className="text-gray-500 font-medium">
                      {formatCurrency(p.unitPrice * p.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowWinModal(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 border-green-600"
              disabled={submitting}
              onClick={handleMarkWon}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
              Confirmar Venda
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Adicionar Contato ── */}
      <Modal
        isOpen={showAddContact}
        onClose={() => setShowAddContact(false)}
        title="Adicionar Contato"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Buscar contato</label>
            <input
              autoFocus
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Nome ou e-mail..."
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
            {filteredContactOptions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum contato encontrado.</p>
            )}
            {filteredContactOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedContactId(c.id)}
                className={clsx(
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  selectedContactId === c.id
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-50 text-gray-700"
                )}
              >
                <span className="font-medium">{c.name}</span>
                {c.email && <span className="text-xs text-gray-400 ml-2">{c.email}</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAddContact(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!selectedContactId || submitting}
              onClick={handleAddContact}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
              Vincular Contato
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Adicionar Produto ── */}
      <Modal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        title="Adicionar Produto"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Produto</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">Selecione um produto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(p.price)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Quantidade</label>
            <input
              type="number"
              min={1}
              value={productQuantity}
              onChange={(e) => setProductQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowAddProduct(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!selectedProductId || submitting}
              onClick={handleAddProduct}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
