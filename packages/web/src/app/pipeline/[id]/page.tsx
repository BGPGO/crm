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
  UserX,
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
import ContractHub from "@/components/pipeline/ContractHub";
import ManualMeetingDialog from "@/components/pipeline/ManualMeetingDialog";
import MeetingSourceBadge from "@/components/pipeline/MeetingSourceBadge";
import type { MeetingSource } from "@/components/pipeline/MeetingSourceBadge";
import WhatsAppSidebar from "@/components/deal/WhatsAppSidebar";
import WabaSidebar from "@/components/deal/WabaSidebar";
import TaskTitleCombobox from "@/components/ui/TaskTitleCombobox";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { brtInputToUtcIso, toDatetimeLocalInputBRT } from "@/lib/taskDateTime";
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
  expectedReturnDate?: string;
  closedAt?: string;
  noShow?: boolean;
  noShowAt?: string;
  meetingSource?: MeetingSource | null;
  classification?: number;
  contaAzulCode?: string;
  recurrence?: string;
  pipeline?: { id: string; name: string; stages: Stage[] };
  stage?: { id: string; name: string; order: number };
  contact?: { id: string; name: string; phone?: string; email?: string };
  organization?: { id: string; name: string; cnpj?: string; website?: string; instagram?: string };
  user?: { id: string; name: string };
  source?: { id: string; name: string };
  campaign?: { id: string; name: string };
  lostReason?: { id: string; name: string };
  leadTracking?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    referrer?: string;
    landingPage?: string;
    ip?: string;
  };
  tasks: DealTask[];
  dealProducts: Array<{
    id: string;
    product: { id?: string; name: string; recurrence?: string };
    quantity: number;
    unitPrice: number;
    discount?: number;
    discountMonths?: number | null;
    setupPrice?: number | null;
    setupInstallments?: number | null;
    recurrenceValue?: number | null;
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

type TabKey = "historico" | "tarefas" | "produtos" | "arquivos" | "contrato" | "readai";

// ─── Constants ───────────────────────────────────────────────────────────────

const TASK_TYPES = [
  { value: "CALL", label: "Ligação" },
  { value: "MEETING", label: "Reunião" },
  { value: "VISIT", label: "Visita" },
  { value: "EMAIL", label: "Email" },
  { value: "OTHER", label: "Outro" },
];

const BASE_TABS: { key: TabKey; label: string }[] = [
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
    expectedReturnDate: data.expectedReturnDate as string | undefined,
    closedAt: data.closedAt as string | undefined,
    noShow: data.noShow as boolean | undefined,
    noShowAt: data.noShowAt as string | undefined,
    meetingSource: data.meetingSource as MeetingSource | undefined,
    classification: data.classification as number | undefined,
    contaAzulCode: data.contaAzulCode as string | undefined,
    recurrence: data.recurrence as string | undefined,
    pipeline: data.pipeline as DealDetail["pipeline"],
    stage: data.stage as DealDetail["stage"],
    contact: data.contact as DealDetail["contact"],
    organization: data.organization as DealDetail["organization"],
    user: data.user as DealDetail["user"],
    source: data.source as DealDetail["source"],
    campaign: data.campaign as DealDetail["campaign"],
    lostReason: data.lostReason as DealDetail["lostReason"],
    leadTracking: (() => {
      const contact = data.contact as Record<string, unknown> | undefined;
      const trackings = contact?.leadTrackings as Record<string, unknown>[] | undefined;
      if (!trackings || trackings.length === 0) return undefined;
      const t = trackings[0];
      return {
        utmSource: t.utmSource as string | undefined,
        utmMedium: t.utmMedium as string | undefined,
        utmCampaign: t.utmCampaign as string | undefined,
        utmTerm: t.utmTerm as string | undefined,
        utmContent: t.utmContent as string | undefined,
        referrer: t.referrer as string | undefined,
        landingPage: t.landingPage as string | undefined,
        ip: t.ip as string | undefined,
      };
    })(),
    tasks: ((data.tasks as unknown[]) ?? []).map((t: unknown) => {
      const task = t as Record<string, unknown>;
      return {
        id: task.id as string,
        title: task.title as string,
        type: task.type as string,
        dueDate: task.dueDate as string | undefined,
        dueDateFormat: task.dueDateFormat as string | undefined,
        done: task.status === "COMPLETED",
        meetingSource: (task.meetingSource as DealTask["meetingSource"]) ?? null,
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

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
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
          className={onChange ? "cursor-pointer" : ""}
          onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined}
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
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore
  }
  document.body.removeChild(textarea);
}

// ─── Sidebar Contact Item ─────────────────────────────────────────────────────

function SidebarContact({
  contact,
  onRemove,
  onUpdate,
}: {
  contact: DealContact;
  onRemove?: () => void;
  onUpdate?: (updated: DealContact) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(contact.name);
  const [editPhone, setEditPhone] = useState(contact.phone ?? "");
  const [editEmail, setEditEmail] = useState(contact.email ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ phone?: string; email?: string }>({});

  const validateFields = () => {
    const errs: { phone?: string; email?: string } = {};
    if (editEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      errs.email = "Email inválido";
    }
    if (editPhone && !/^[\d\s()+-]{8,20}$/.test(editPhone)) {
      errs.phone = "Telefone inválido";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleStartEdit = () => {
    setEditName(contact.name);
    setEditPhone(contact.phone ?? "");
    setEditEmail(contact.email ?? "");
    setErrors({});
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setErrors({});
  };

  const handleSave = async () => {
    if (!validateFields()) return;
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await api.put(`/contacts/${contact.id}`, {
        name: editName.trim(),
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
      });
      const updated: DealContact = {
        ...contact,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
      };
      if (onUpdate) onUpdate(updated);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="py-2 border-b border-gray-100 last:border-0">
        <div className="space-y-1.5">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Nome</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Telefone</label>
            <input
              type="text"
              value={editPhone}
              onChange={(e) => { setEditPhone(e.target.value); if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined })); }}
              className={clsx("w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400", errors.phone ? "border-red-300" : "border-gray-200")}
              placeholder="(00) 00000-0000"
            />
            {errors.phone && <p className="text-[10px] text-red-500 mt-0.5">{errors.phone}</p>}
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => { setEditEmail(e.target.value); if (errors.email) setErrors((prev) => ({ ...prev, email: undefined })); }}
              className={clsx("w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400", errors.email ? "border-red-300" : "border-gray-200")}
              placeholder="email@exemplo.com"
            />
            {errors.email && <p className="text-[10px] text-red-500 mt-0.5">{errors.email}</p>}
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="flex items-center gap-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-2.5 py-1 rounded transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Salvar
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800 px-2 py-1 rounded transition-colors"
            >
              <X size={11} />
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          <User size={12} />
        </div>
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{contact.name}</span>
        <button
          onClick={handleStartEdit}
          className="p-0.5 text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0"
          title="Editar contato"
        >
          <Pencil size={12} />
        </button>
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
  const { user: authUser } = useAuth();
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
  const [readAiMeetings, setReadAiMeetings] = useState<Array<{
    id: string;
    sessionId: string;
    title: string | null;
    summary: string | null;
    transcript: string | null;
    actionItems: any;
    topics: any;
    duration: number | null;
    meetingDate: string | null;
    participants: any;
    aiAnalysis: Record<string, string> | null;
    aiAnalyzedAt: string | null;
  }>>([]);
  const [readAiLoading, setReadAiLoading] = useState(false);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);

  // Auto-select tab from ?tab= query param
  useEffect(() => {
    const tab = searchParams.get("tab") as TabKey | null;
    const allKeys: TabKey[] = ["historico", "tarefas", "produtos", "arquivos", "contrato", "readai"];
    if (tab && allKeys.includes(tab)) {
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
  const [pendingStageMove, setPendingStageMove] = useState<{ stageId: string; stageName: string } | null>(null);

  // Add-contact picker
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  // Contact modal mode: "link" = vincular existente, "create" = criar novo
  const [contactModalMode, setContactModalMode] = useState<"link" | "create">("link");
  const [newContactForm, setNewContactForm] = useState({ name: "", phone: "", email: "", position: "" });

  // Add-product picker
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productQuantity, setProductQuantity] = useState(1);
  const [productUnitPrice, setProductUnitPrice] = useState(0);
  const [productDiscount, setProductDiscount] = useState(0);
  const [productDiscountMonths, setProductDiscountMonths] = useState<number | null>(null);
  const [productSetupPrice, setProductSetupPrice] = useState<number | null>(null);
  const [productSetupInstallments, setProductSetupInstallments] = useState<number | null>(null);
  const [productRecurrenceValue, setProductRecurrenceValue] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Add/edit task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("CALL");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [editingTask, setEditingTask] = useState<DealTask | null>(null);

  // Submission loading flags
  const [submitting, setSubmitting] = useState(false);

  // ── Users list (for responsible dropdown) ──────────────────────────────────
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [allCampaigns, setAllCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  // ── WhatsApp sidebar state ────────────────────────────────────────────────
  const [whatsappConv, setWhatsappConv] = useState<{
    conversationId: string;
    phone: string;
    messageCount: number;
  } | null>(null);
  const [wabaConv, setWabaConv] = useState<{
    conversationId: string;
    phone: string;
    messageCount: number;
  } | null>(null);
  const [showWhatsappSidebar, setShowWhatsappSidebar] = useState(false);
  const [showWabaSidebar, setShowWabaSidebar] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);

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

  const loadWhatsAppConversation = useCallback(async () => {
    try {
      const res = await api.get<{ data: typeof whatsappConv; waba: typeof wabaConv }>(`/deals/${dealId}/whatsapp-conversation`);
      setWhatsappConv((res as any).data);
      setWabaConv((res as any).waba);
    } catch {
      // Non-critical
    }
  }, [dealId]);

  const fetchReadAiMeetings = useCallback(async () => {
    if (!dealId) return;
    setReadAiLoading(true);
    try {
      const res = await api.get<{ data: typeof readAiMeetings }>(`/readai/meetings?dealId=${dealId}`);
      setReadAiMeetings(res.data || []);
    } catch { /* silent */ }
    finally { setReadAiLoading(false); }
  }, [dealId]);

  useEffect(() => {
    if (activeTab === 'readai') fetchReadAiMeetings();
  }, [activeTab, fetchReadAiMeetings]);

  const reanalyzeMeeting = useCallback(async (meetingId: string) => {
    setReanalyzingId(meetingId);
    try {
      const res = await api.post<{ data: { aiAnalysis: Record<string, string>; aiAnalyzedAt: string } }>(
        `/readai/meetings/${meetingId}/analyze`,
        {}
      );
      setReadAiMeetings(prev =>
        prev.map(m =>
          m.id === meetingId
            ? { ...m, aiAnalysis: res.data?.aiAnalysis ?? null, aiAnalyzedAt: res.data?.aiAnalyzedAt ?? null }
            : m
        )
      );
    } catch {
      alert('Erro ao reanalisar reunião. Tente novamente.');
    } finally {
      setReanalyzingId(null);
    }
  }, []);

  // ── Item 5: Update browser tab title with deal name ───────────────────
  useEffect(() => {
    if (deal?.title) {
      document.title = `${deal.title} | CRM BGPGO`;
    }
    return () => {
      document.title = "CRM BGPGO";
    };
  }, [deal?.title]);

  useEffect(() => {
    loadDeal();
    loadTimeline();
    loadWhatsAppConversation();
    api.get<{ data: Array<{ id: string; name: string }> }>("/users")
      .then((res) => setAllUsers((res as { data: Array<{ id: string; name: string }> }).data || []))
      .catch(() => {});
    api.get<{ data: Array<{ id: string; name: string }> }>("/campaigns?limit=200")
      .then((res) => setAllCampaigns((res as { data: Array<{ id: string; name: string }> }).data || []))
      .catch(() => {});
  }, [loadDeal, loadTimeline, loadWhatsAppConversation]);

  // ── Derived values ────────────────────────────────────────────────────────
  // Resolve contact phone: deal.contact (primary) or first dealContact with phone
  const contactWithPhone = deal?.contact?.phone
    ? deal.contact
    : deal?.dealContacts?.find((dc) => dc.contact.phone)?.contact ?? null;

  const totalRecurrence = (deal?.dealProducts ?? []).reduce(
    (sum, p) => sum + (p.recurrenceValue ?? p.unitPrice) * p.quantity,
    0
  );
  const totalSetup = (deal?.dealProducts ?? []).reduce(
    (sum, p) => sum + (p.setupPrice ?? 0),
    0
  );
  const totalValue = totalRecurrence + totalSetup;

  const pendingTaskCount = (deal?.tasks ?? []).filter((t) => !t.done).length;

  // ── Dynamic tabs (include "Contrato" from "Aguardando Dados" onwards) ──
  const stageLower = (deal?.stageName ?? "").toLowerCase();
  const showContractTab = stageLower.includes("aguardando") || stageLower.includes("ganho") || stageLower.includes("assinatura");
  const TABS: { key: TabKey; label: string }[] = [
    ...BASE_TABS,
    ...(showContractTab ? [{ key: "contrato" as TabKey, label: "Contrato" }] : []),
    { key: "readai", label: "Read.ai" },
  ];

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

  const handleNoShow = async () => {
    if (!deal) return;
    setSubmitting(true);
    try {
      await api.post(`/deals/${dealId}/no-show`, {});
      // Find "Marcar reunião" stage
      const marcarStage = stages.find((s) => s.name.toLowerCase().includes("marcar reuni"));
      setDeal((d) => d ? { ...d, stageId: marcarStage?.id ?? d.stageId, noShow: true, noShowAt: new Date().toISOString() } : d);
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao marcar no-show: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveNoShow = async () => {
    if (!deal) return;
    if (!confirm("Remover a tag de no-show deste lead?")) return;
    setSubmitting(true);
    try {
      await api.delete(`/deals/${dealId}/no-show`);
      setDeal((d) => d ? { ...d, noShow: false, noShowAt: undefined } : d);
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao remover no-show: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStageClick = async (stageId: string) => {
    if (!deal || deal.status !== "active") return;

    // Check if moving to "Reunião agendada" — show meeting dialog
    const targetStage = stages.find((s) => s.id === stageId);
    if (targetStage && targetStage.name.toLowerCase().includes("reunião agendada")) {
      setPendingStageMove({ stageId, stageName: targetStage.name });
      return;
    }

    // Normal stage move with optimistic update
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

  const handleMeetingConfirmDetail = async (data: { startTime: string; duration: number; eventType: string; notes: string }) => {
    if (!pendingStageMove || !deal) return;
    try {
      await api.patch(`/deals/${dealId}/stage`, { stageId: pendingStageMove.stageId });
      await api.post(`/deals/${dealId}/manual-meeting`, data);
      setDeal((d) => d ? { ...d, stageId: pendingStageMove.stageId, stageName: pendingStageMove.stageName } : d);
      loadTimeline();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setPendingStageMove(null);
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
      const userId = authUser?.id || deal?.user?.id;
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
        dueDate: taskDueDate ? brtInputToUtcIso(taskDueDate) : undefined,
        userId,
        dealId,
      });
      const created = res.data;
      const newTask: DealTask = {
        id: created.id as string,
        title: created.title as string,
        type: created.type as string,
        dueDate: created.dueDate as string | undefined,
        dueDateFormat: created.dueDateFormat as string | null | undefined,
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

  const handleEditTask = (task: DealTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskType(task.type);
    setTaskDueDate(toDatetimeLocalInputBRT({ dueDate: task.dueDate, dueDateFormat: task.dueDateFormat }));
    setShowAddTask(true);
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !taskTitle.trim()) return;
    setSubmitting(true);
    try {
      const updatedDueDate = taskDueDate ? brtInputToUtcIso(taskDueDate) : undefined;
      await api.put(`/tasks/${editingTask.id}`, {
        title: taskTitle.trim(),
        type: taskType,
        dueDate: updatedDueDate,
      });
      setDeal((d) =>
        d
          ? {
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === editingTask.id
                  ? { ...t, title: taskTitle.trim(), type: taskType, dueDate: updatedDueDate, dueDateFormat: "UTC" }
                  : t
              ),
            }
          : d
      );
      setShowAddTask(false);
      setEditingTask(null);
      setTaskTitle("");
      setTaskType("CALL");
      setTaskDueDate("");
      window.dispatchEvent(new Event("tasks-changed"));
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao atualizar tarefa: ${e?.message ?? "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTask) return;
    if (!confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    setSubmitting(true);
    try {
      await api.delete(`/tasks/${editingTask.id}`);
      setDeal((d) =>
        d ? { ...d, tasks: d.tasks.filter((t) => t.id !== editingTask.id) } : d
      );
      setShowAddTask(false);
      setEditingTask(null);
      setTaskTitle("");
      setTaskType("CALL");
      setTaskDueDate("");
      window.dispatchEvent(new Event("tasks-changed"));
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao excluir tarefa: ${e?.message ?? "Tente novamente."}`);
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

  const resetProductForm = () => {
    setSelectedProductId("");
    setProductQuantity(1);
    setProductUnitPrice(0);
    setProductDiscount(0);
    setProductDiscountMonths(null);
    setProductSetupPrice(null);
    setProductSetupInstallments(null);
    setProductRecurrenceValue(null);
    setEditingProductId(null);
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
    resetProductForm();
    setShowAddProduct(true);
  };

  const handleEditProduct = async (dpId: string) => {
    if (!deal) return;
    const dp = deal.dealProducts.find((p) => p.id === dpId);
    if (!dp) return;
    if (products.length === 0) {
      try {
        const res = await api.get<{ data: Product[] }>("/products");
        setProducts(res.data ?? []);
      } catch { /* ignore */ }
    }
    setEditingProductId(dpId);
    setSelectedProductId(dp.product.id ?? "");
    setProductQuantity(dp.quantity);
    setProductUnitPrice(dp.unitPrice);
    setProductDiscount(dp.discount ?? 0);
    setProductDiscountMonths(dp.discountMonths ?? null);
    setProductSetupPrice(dp.setupPrice ?? null);
    setProductSetupInstallments(dp.setupInstallments ?? null);
    setProductRecurrenceValue(dp.recurrenceValue ?? null);
    setShowAddProduct(true);
  };

  const handleAddProduct = async () => {
    if (!selectedProductId || !deal) return;
    setSubmitting(true);
    try {
      const payload = {
        dealId,
        productId: selectedProductId,
        quantity: productQuantity,
        unitPrice: productUnitPrice,
        discount: productDiscount,
        discountMonths: productDiscountMonths,
        setupPrice: productSetupPrice,
        setupInstallments: productSetupInstallments,
        recurrenceValue: productRecurrenceValue,
      };

      if (editingProductId) {
        await api.put(`/deal-products/${editingProductId}`, payload);
      } else {
        await api.post("/deal-products", payload);
      }
      // Reload deal to get fresh data
      loadDeal();
      setShowAddProduct(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao salvar produto: ${e?.message ?? "Tente novamente."}`);
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
    setContactModalMode("link");
    setNewContactForm({ name: "", phone: "", email: "", position: "" });
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

  const handleCreateAndLinkContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deal || !newContactForm.name.trim()) return;
    setSubmitting(true);
    try {
      // 1. Create the contact
      const created = await api.post<{ data: { id: string; name: string; phone?: string; email?: string } }>("/contacts", {
        name: newContactForm.name.trim(),
        phone: newContactForm.phone.trim() || undefined,
        email: newContactForm.email.trim() || undefined,
        position: newContactForm.position.trim() || undefined,
      });
      const newContact = created.data;
      // 2. Link to deal
      const linked = await api.post<{ data: DealContactLink }>(`/deals/${dealId}/contacts`, {
        contactId: newContact.id,
        isPrimary: deal.dealContacts.length === 0,
      });
      setDeal((d) => d ? { ...d, dealContacts: [...d.dealContacts, linked.data] } : d);
      // Also add to contactOptions cache so it appears in link list
      setContactOptions((opts) => [...opts, { id: newContact.id, name: newContact.name, phone: newContact.phone, email: newContact.email }]);
      setShowAddContact(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(`Erro ao criar contato: ${e?.message ?? "Tente novamente."}`);
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

  const handleStartConversation = async () => {
    setStartingConversation(true);
    try {
      await api.post(`/deals/${dealId}/start-conversation`, {});
      await loadWhatsAppConversation();
      setShowWhatsappSidebar(true);
    } catch {
      alert("Erro ao iniciar conversa. Verifique se o contato tem telefone.");
    } finally {
      setStartingConversation(false);
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
    unitPrice: dp.unitPrice,
    quantity: dp.quantity,
    discount: dp.discount ?? 0,
    discountMonths: dp.discountMonths ?? null,
    setupPrice: dp.setupPrice ?? null,
    setupInstallments: dp.setupInstallments ?? null,
    recurrenceValue: dp.recurrenceValue ?? null,
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
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex-shrink-0">
        <button
          onClick={() => router.push("/pipeline")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-3 transition-colors"
        >
          <ChevronLeft size={16} />
          Funil de Vendas
        </button>

        {/* Title row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3 sm:gap-4 mb-3">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <EditableTitle
              value={deal.title}
              onChange={(v) => {
                setDeal((d) => d ? { ...d, title: v } : d);
                handleUpdateDeal("title", v);
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleOpenAddProduct}
                className="text-xl font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer transition-colors"
                title="Clique para adicionar produto"
              >
                {formatCurrency(totalRecurrence || deal.value)}
              </button>
              <StatusBadge status={deal.status} />
              <MeetingSourceBadge source={deal.meetingSource} size="md" />
              {(deal.classification ?? 0) > 0 && (
                <StarRating value={deal.classification!} />
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {contactWithPhone?.phone && (
              <>
                {/* WABA (API Oficial) — botão principal */}
                {wabaConv && (
                  <button
                    onClick={() => setShowWabaSidebar(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 border border-emerald-600 rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.613.613l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.354 0-4.542-.726-6.347-1.965l-.244-.168-3.151 1.056 1.056-3.151-.168-.244A9.956 9.956 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                    </svg>
                    WABA ({wabaConv.messageCount})
                  </button>
                )}
                {/* Z-API (legado) — botão secundário se existir */}
                {whatsappConv && (
                  <button
                    onClick={() => setShowWhatsappSidebar(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors opacity-75"
                  >
                    <MessageCircle size={14} />
                    Z-API ({whatsappConv.messageCount})
                  </button>
                )}
                {/* Nenhuma conversa — botão de iniciar */}
                {!whatsappConv && !wabaConv && (
                  <button
                    onClick={handleStartConversation}
                    disabled={startingConversation}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    <MessageCircle size={14} />
                    {startingConversation ? "Iniciando..." : "Iniciar Conversa"}
                  </button>
                )}
              </>
            )}
            {deal.status === "active" && (
              <>
                {deal.stage && deal.stage.name.toLowerCase().includes("reunião agendada") && !deal.noShow && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleNoShow}
                    disabled={submitting}
                    className="border-orange-400 text-orange-600 hover:bg-orange-50 hover:border-orange-500"
                  >
                    <UserX size={14} />
                    No-show
                  </Button>
                )}
                {deal.noShow && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRemoveNoShow}
                    disabled={submitting}
                    className="border-gray-300 text-gray-600 hover:bg-gray-50"
                    title="Remover a tag de no-show deste lead"
                  >
                    <UserX size={14} />
                    Remover no-show
                  </Button>
                )}
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
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

        {/* ── Left sidebar (~35%) ── */}
        <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white overflow-y-auto max-h-[40vh] lg:max-h-none">

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
              <div className="py-2">
                <span className="text-xs text-gray-400">Qualificação</span>
                <div className="mt-1">
                  <StarRating
                    value={deal.classification ?? 0}
                    onChange={(v) => {
                      setDeal((d) => d ? { ...d, classification: v } : d);
                      handleUpdateDeal("classification", String(v));
                    }}
                  />
                </div>
              </div>
              <div className="py-2">
                <span className="text-xs text-gray-400">Valor total</span>
                <button
                  onClick={handleOpenAddProduct}
                  className="block text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline mt-0.5 cursor-pointer transition-colors"
                  title="Clique para adicionar produto"
                >
                  {formatCurrency(totalRecurrence || deal.value)}
                </button>
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
              <InlineField
                label="Data de retorno"
                value={deal.expectedReturnDate ?? ""}
                type="date"
                onChange={(v) => {
                  setDeal((d) => d ? { ...d, expectedReturnDate: v } : d);
                  handleUpdateDeal("expectedReturnDate", v);
                }}
                formatValue={(v) => (v ? formatDate(v) : "")}
              />
              {deal.source && (
                <div className="py-2">
                  <span className="text-xs text-gray-400">Fonte</span>
                  <p className="text-sm text-gray-700 mt-0.5">{deal.source.name}</p>
                </div>
              )}
              <div className="py-2">
                <span className="text-xs text-gray-400">Campanha</span>
                <select
                  value={deal.campaign?.id || ""}
                  onChange={async (e) => {
                    const campaignId = e.target.value || null;
                    const selected = allCampaigns.find(c => c.id === campaignId);
                    setDeal((d) => d ? { ...d, campaign: selected ? { id: selected.id, name: selected.name } : undefined } : d);
                    try { await api.put(`/deals/${dealId}`, { campaignId }); } catch { /* silent */ }
                  }}
                  className="w-full mt-0.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                >
                  <option value="">Nenhuma</option>
                  {allCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {deal.leadTracking?.landingPage && (
                <div className="py-2">
                  <span className="text-xs text-gray-400">Landing Page</span>
                  <a
                    href={deal.leadTracking.landingPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mt-0.5 break-all"
                  >
                    <ExternalLink size={12} className="flex-shrink-0" />
                    {(() => {
                      try {
                        const url = new URL(deal.leadTracking.landingPage);
                        return url.hostname + url.pathname;
                      } catch {
                        return deal.leadTracking.landingPage;
                      }
                    })()}
                  </a>
                </div>
              )}
              {deal.leadTracking && (deal.leadTracking.utmSource || deal.leadTracking.utmMedium || deal.leadTracking.utmCampaign) && (
                <div className="py-2">
                  <span className="text-xs text-gray-400">UTMs</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {deal.leadTracking.utmSource && (
                      <span className="inline-flex items-center text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                        source: {deal.leadTracking.utmSource}
                      </span>
                    )}
                    {deal.leadTracking.utmMedium && (
                      <span className="inline-flex items-center text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        medium: {deal.leadTracking.utmMedium}
                      </span>
                    )}
                    {deal.leadTracking.utmCampaign && (
                      <span className="inline-flex items-center text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                        campaign: {deal.leadTracking.utmCampaign}
                      </span>
                    )}
                    {deal.leadTracking.utmTerm && (
                      <span className="inline-flex items-center text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">
                        term: {deal.leadTracking.utmTerm}
                      </span>
                    )}
                    {deal.leadTracking.utmContent && (
                      <span className="inline-flex items-center text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">
                        content: {deal.leadTracking.utmContent}
                      </span>
                    )}
                  </div>
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
                  onUpdate={(updated) => {
                    setDeal((d) => d ? {
                      ...d,
                      dealContacts: d.dealContacts.map((link) =>
                        link.contact.id === updated.id ? { ...link, contact: updated } : link
                      ),
                    } : d);
                  }}
                />
              ))}
              {/* Primary contact (from deal.contact) if not in dealContacts */}
              {deal.contact && deal.dealContacts.length === 0 && (
                <SidebarContact
                  key={deal.contact.id}
                  contact={deal.contact}
                  onUpdate={(updated) => {
                    setDeal((d) => d ? { ...d, contact: updated } : d);
                  }}
                />
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
          <CollapsibleSection title="Responsável" defaultOpen>
            <div className="flex items-center gap-2 py-2">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                <User size={14} />
              </div>
              <select
                value={deal?.user?.id || ""}
                onChange={async (e) => {
                  const newUserId = e.target.value;
                  if (!newUserId || !deal) return;
                  try {
                    await api.put(`/deals/${dealId}`, { userId: newUserId });
                    const selectedUser = allUsers.find(u => u.id === newUserId);
                    setDeal({ ...deal, user: selectedUser ? { id: selectedUser.id, name: selectedUser.name } : deal.user });
                  } catch {
                    alert("Erro ao alterar responsável");
                  }
                }}
                className="flex-1 text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {!deal?.user && <option value="">Sem responsável</option>}
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </CollapsibleSection>
        </aside>

        {/* ── Right main content (~65%) ── */}
        <main className="flex-1 overflow-y-auto flex flex-col">

          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 px-4 sm:px-6 flex-shrink-0 overflow-x-auto">
            <nav className="flex gap-0 -mb-px min-w-max">
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
          <div className="flex-1 p-4 sm:p-6">

            {/* ── Histórico ── */}
            {activeTab === "historico" && (<>
              <DealTimeline
                events={timeline}
                onAddNote={handleAddNote}
                pendingTasks={deal.tasks.filter((t: any) => !t.done)}
                onToggleTask={handleToggleTask}
                onEditTask={(task) => {
                  handleEditTask(task);
                  setActiveTab("tarefas");
                }}
              />
            </>)}

            {/* ── Tarefas ── */}
            {activeTab === "tarefas" && (
              <div>
                <DealTasks
                  tasks={deal.tasks}
                  onToggle={handleToggleTask}
                  onAdd={() => {
                    setEditingTask(null);
                    setTaskTitle("");
                    setTaskType("CALL");
                    setTaskDueDate("");
                    setShowAddTask(true);
                  }}
                  onEdit={handleEditTask}
                  onPostpone={async (taskId, newDate) => {
                    try {
                      await api.put(`/tasks/${taskId}`, { dueDate: newDate.toISOString() });
                      setDeal((d) =>
                        d
                          ? {
                              ...d,
                              tasks: d.tasks.map((t) =>
                                t.id === taskId ? { ...t, dueDate: newDate.toISOString() } : t
                              ),
                            }
                          : d
                      );
                      window.dispatchEvent(new Event("tasks-changed"));
                    } catch (err: unknown) {
                      const e = err as { message?: string };
                      alert(`Erro ao adiar tarefa: ${e?.message ?? "Tente novamente."}`);
                    }
                  }}
                />

                {/* Inline add-task form */}
                {showAddTask && (
                  <div className={clsx(
                    "mt-4 border rounded-lg p-4 space-y-3",
                    editingTask ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"
                  )}>
                    <p className="text-sm font-semibold text-gray-700">
                      {editingTask ? "Editar Tarefa" : "Nova Tarefa"}
                    </p>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Título</label>
                      <TaskTitleCombobox
                        value={taskTitle}
                        onChange={setTaskTitle}
                        compact
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
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
                        <label className="text-xs text-gray-500 mb-1 block">Data e Hora</label>
                        <input
                          type="datetime-local"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        {editingTask && (
                          <button
                            type="button"
                            onClick={handleDeleteTask}
                            disabled={submitting}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                          >
                            <Trash2 size={13} />
                            Excluir
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => {
                          setShowAddTask(false);
                          setEditingTask(null);
                          setTaskTitle("");
                          setTaskType("CALL");
                          setTaskDueDate("");
                        }}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!taskTitle.trim() || submitting}
                          onClick={editingTask ? handleUpdateTask : handleCreateTask}
                        >
                          {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
                          {editingTask ? "Salvar" : "Criar Tarefa"}
                        </Button>
                      </div>
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
                onEdit={handleEditProduct}
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

            {/* ── Contrato (Hub com Aditivo, Distrato, Enviados) ── */}
            {activeTab === "contrato" && showContractTab && (
              <ContractHub
                dealId={dealId}
                deal={{
                  title: deal.title,
                  value: deal.value,
                  contact: deal.contact
                    ? {
                        name: deal.contact.name,
                        email: deal.contact.email ?? "",
                        phone: deal.contact.phone ?? "",
                      }
                    : deal.dealContacts.length > 0
                    ? {
                        name: deal.dealContacts[0].contact.name,
                        email: deal.dealContacts[0].contact.email ?? "",
                        phone: deal.dealContacts[0].contact.phone ?? "",
                      }
                    : null,
                  organization: deal.organization
                    ? {
                        name: deal.organization.name,
                        cnpj: deal.organization.cnpj ?? "",
                        address: "",
                        email: "",
                      }
                    : null,
                  products: deal.dealProducts.map((dp) => ({
                    product: { name: dp.product.name },
                  })),
                }}
              />
            )}

            {activeTab === "readai" && (
              <div className="space-y-4">
                {readAiLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  </div>
                ) : readAiMeetings.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500">Nenhuma gravação do Read.ai vinculada</p>
                    <p className="text-xs text-gray-400 mt-1">As gravações aparecem automaticamente após reuniões</p>
                  </div>
                ) : (
                  readAiMeetings.map((meeting) => (
                    <div key={meeting.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Meeting header */}
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">
                            {meeting.title || 'Reunião sem título'}
                          </h4>
                          <div className="flex items-center gap-3 mt-0.5">
                            {meeting.meetingDate && (
                              <span className="text-xs text-gray-500">
                                {new Date(meeting.meetingDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {meeting.duration && (
                              <span className="text-xs text-gray-400">
                                {meeting.duration}min
                              </span>
                            )}
                            {meeting.aiAnalyzedAt && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium">
                                IA analisou
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {meeting.transcript && (
                            <button
                              onClick={() => reanalyzeMeeting(meeting.id)}
                              disabled={reanalyzingId === meeting.id}
                              className="flex items-center gap-1.5 text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-md font-medium transition-colors disabled:opacity-50"
                              title="Regenerar análise com IA"
                            >
                              {reanalyzingId === meeting.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <RotateCcw size={12} />
                              )}
                              {reanalyzingId === meeting.id ? 'Analisando...' : 'Reanalisar'}
                            </button>
                          )}
                          <a
                            href={`https://app.read.ai/analytics/meetings/${meeting.sessionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            Ver no Read.ai
                          </a>
                        </div>
                      </div>

                      <div className="p-4 space-y-4">

                        {/* ── AI Analysis Report ── */}
                        {meeting.aiAnalysis ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">Relatório de Diagnóstico (IA)</span>
                              {meeting.aiAnalyzedAt && (
                                <span className="text-[10px] text-gray-400">
                                  gerado em {new Date(meeting.aiAnalyzedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  {' · '}{(meeting.aiAnalysis as any).modelo_usado || 'gpt-4o-mini'}
                                </span>
                              )}
                            </div>

                            {/* Grid of analysis cards */}
                            {([
                              { key: 'empresa_negocio', label: 'Empresa & Negócio', color: 'blue' },
                              { key: 'situacao_atual', label: 'Situação Atual', color: 'amber' },
                              { key: 'sistema_atual', label: 'Sistema Atual', color: 'gray' },
                              { key: 'principais_dores', label: 'Principais Dores', color: 'red' },
                              { key: 'gatilhos_conexao', label: 'Gatilhos de Conexão', color: 'green' },
                              { key: 'o_que_chamou_atencao', label: 'O que chamou atenção', color: 'purple' },
                              { key: 'proposta_de_valor', label: 'Proposta de Valor', color: 'indigo' },
                              { key: 'preco_apresentado', label: 'Preço Apresentado', color: 'emerald' },
                              { key: 'objecoes', label: 'Objeções', color: 'orange' },
                              { key: 'proximos_passos', label: 'Próximos Passos', color: 'teal' },
                            ] as const).map(({ key, label, color }) => {
                              const value = (meeting.aiAnalysis as any)?.[key];
                              if (!value || value === 'Não mencionado') return null;
                              const colorMap: Record<string, string> = {
                                blue: 'border-blue-200 bg-blue-50/40',
                                amber: 'border-amber-200 bg-amber-50/40',
                                gray: 'border-gray-200 bg-gray-50',
                                red: 'border-red-200 bg-red-50/40',
                                green: 'border-green-200 bg-green-50/40',
                                purple: 'border-purple-200 bg-purple-50/40',
                                indigo: 'border-indigo-200 bg-indigo-50/40',
                                emerald: 'border-emerald-200 bg-emerald-50/40',
                                orange: 'border-orange-200 bg-orange-50/40',
                                teal: 'border-teal-200 bg-teal-50/40',
                              };
                              const labelColorMap: Record<string, string> = {
                                blue: 'text-blue-700', amber: 'text-amber-700', gray: 'text-gray-600',
                                red: 'text-red-700', green: 'text-green-700', purple: 'text-purple-700',
                                indigo: 'text-indigo-700', emerald: 'text-emerald-700',
                                orange: 'text-orange-700', teal: 'text-teal-700',
                              };
                              return (
                                <div key={key} className={`rounded-lg border p-3 ${colorMap[color]}`}>
                                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${labelColorMap[color]}`}>{label}</p>
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{value}</p>
                                </div>
                              );
                            })}

                            <hr className="border-gray-100" />
                          </div>
                        ) : meeting.transcript ? (
                          <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
                                <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-purple-800">Análise de IA pendente</p>
                              <p className="text-xs text-purple-600">A transcrição está disponível. Clique em Reanalisar para gerar o relatório.</p>
                            </div>
                          </div>
                        ) : null}

                        {/* Summary from Read.ai (fallback / original) */}
                        {meeting.summary && (
                          <details>
                            <summary className="text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer hover:text-gray-600 select-none">
                              Resumo do Read.ai
                              <span className="font-normal ml-1">(original)</span>
                            </summary>
                            <div className="mt-2">
                              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{meeting.summary}</p>
                            </div>
                          </details>
                        )}

                        {/* Action Items */}
                        {meeting.actionItems && Array.isArray(meeting.actionItems) && meeting.actionItems.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Action Items</h5>
                            <ul className="space-y-1.5">
                              {meeting.actionItems.map((item: any, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                                  <span>{typeof item === 'string' ? item : item.text || item.description || item.title || JSON.stringify(item)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Topics */}
                        {meeting.topics && Array.isArray(meeting.topics) && meeting.topics.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tópicos</h5>
                            <div className="flex flex-wrap gap-1.5">
                              {meeting.topics.map((topic: any, i: number) => (
                                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                  {typeof topic === 'string' ? topic : topic.name || topic.title || JSON.stringify(topic)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Transcript (collapsible) */}
                        {meeting.transcript && (
                          <details className="group">
                            <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none">
                              Transcrição
                              <span className="text-gray-400 font-normal ml-1">(clique para expandir)</span>
                            </summary>
                            <div className="mt-2 p-3 bg-gray-50 rounded-lg max-h-80 overflow-y-auto">
                              <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed font-mono">
                                {meeting.transcript}
                              </p>
                            </div>
                          </details>
                        )}

                        {/* Participants */}
                        {meeting.participants && Array.isArray(meeting.participants) && meeting.participants.length > 0 && (
                          <div>
                            <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Participantes</h5>
                            <div className="flex flex-wrap gap-1">
                              {meeting.participants.map((p: any, i: number) => (
                                <span key={i} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                  {typeof p === 'string' ? p : p.name || p.email || JSON.stringify(p)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
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
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalRecurrence || deal.value)}</p>
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
          {/* Tab switcher */}
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setContactModalMode("link")}
              className={clsx(
                "flex-1 py-2 text-xs font-medium transition-colors",
                contactModalMode === "link"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              )}
            >
              Vincular existente
            </button>
            <button
              type="button"
              onClick={() => setContactModalMode("create")}
              className={clsx(
                "flex-1 py-2 text-xs font-medium transition-colors",
                contactModalMode === "create"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              )}
            >
              Criar novo
            </button>
          </div>

          {/* Mode: link existing */}
          {contactModalMode === "link" && (
            <>
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
            </>
          )}

          {/* Mode: create new */}
          {contactModalMode === "create" && (
            <form onSubmit={handleCreateAndLinkContact} className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nome *</label>
                <input
                  autoFocus
                  required
                  value={newContactForm.name}
                  onChange={(e) => setNewContactForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
                <input
                  value={newContactForm.phone}
                  onChange={(e) => setNewContactForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Email</label>
                <input
                  type="email"
                  value={newContactForm.email}
                  onChange={(e) => setNewContactForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cargo</label>
                <input
                  value={newContactForm.position}
                  onChange={(e) => setNewContactForm((f) => ({ ...f, position: e.target.value }))}
                  placeholder="Ex: Diretor Comercial"
                  className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddContact(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={!newContactForm.name.trim() || submitting}>
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
                  Criar e Vincular
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* ── Modal: Adicionar/Editar Produto ── */}
      <Modal
        isOpen={showAddProduct}
        onClose={() => setShowAddProduct(false)}
        title={editingProductId ? "Editar Produto" : "Adicionar Produto"}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Produto</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                const prod = products.find((p) => p.id === e.target.value);
                if (prod && !editingProductId) {
                  setProductUnitPrice(prod.price);
                  setProductRecurrenceValue(prod.price);
                }
              }}
              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              disabled={!!editingProductId}
            >
              <option value="">Selecione um produto...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedProductId && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Valor mensal (recorrência)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={productRecurrenceValue ?? productUnitPrice}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setProductRecurrenceValue(v);
                      setProductUnitPrice(v);
                    }}
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Desconto (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={productDiscount}
                    onChange={(e) => setProductDiscount(Math.min(100, parseFloat(e.target.value) || 0))}
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Tempo do desconto (meses)</label>
                  <input
                    type="number"
                    min={0}
                    value={productDiscountMonths ?? ""}
                    placeholder="Permanente"
                    onChange={(e) => setProductDiscountMonths(e.target.value ? parseInt(e.target.value) || null : null)}
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Setup (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Valor do setup</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={productSetupPrice ?? ""}
                      placeholder="R$ 0,00"
                      onChange={(e) => setProductSetupPrice(e.target.value ? parseFloat(e.target.value) || null : null)}
                      className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Parcelas do setup</label>
                    <input
                      type="number"
                      min={1}
                      value={productSetupInstallments ?? ""}
                      placeholder="1x"
                      onChange={(e) => setProductSetupInstallments(e.target.value ? parseInt(e.target.value) || null : null)}
                      className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Recorrência mensal</span>
                  <span className="font-medium">{formatCurrency((productRecurrenceValue ?? productUnitPrice) * productQuantity)}</span>
                </div>
                {productDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Com desconto{productDiscountMonths ? ` (${productDiscountMonths} meses)` : ""}</span>
                    <span className="font-medium">
                      {formatCurrency((productRecurrenceValue ?? productUnitPrice) * productQuantity * (1 - productDiscount / 100))}
                    </span>
                  </div>
                )}
                {productSetupPrice != null && productSetupPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      Setup{productSetupInstallments && productSetupInstallments > 1 ? ` (${productSetupInstallments}x)` : ""}
                    </span>
                    <span className="font-medium">{formatCurrency(productSetupPrice)}</span>
                  </div>
                )}
              </div>
            </>
          )}

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
              {editingProductId ? "Salvar" : "Adicionar"}
            </Button>
          </div>
        </div>
      </Modal>

      {showWhatsappSidebar && whatsappConv && (
        <WhatsAppSidebar
          conversationId={whatsappConv.conversationId}
          contactName={deal?.contact?.name ?? ""}
          contactPhone={whatsappConv.phone}
          dealId={dealId}
          onClose={() => setShowWhatsappSidebar(false)}
        />
      )}

      {showWabaSidebar && wabaConv && (
        <WabaSidebar
          conversationId={wabaConv.conversationId}
          contactName={deal?.contact?.name ?? ""}
          contactPhone={wabaConv.phone}
          dealId={dealId}
          onClose={() => setShowWabaSidebar(false)}
        />
      )}

      {pendingStageMove && (
        <ManualMeetingDialog
          dealTitle={deal?.title || ""}
          contactName={deal?.contact?.name || ""}
          onConfirm={handleMeetingConfirmDetail}
          onCancel={() => setPendingStageMove(null)}
        />
      )}
    </div>
  );
}
