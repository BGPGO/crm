"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Mail,
  Phone,
  Briefcase,
  Instagram,
  Calendar,
  FileText,
  Building2,
  ExternalLink,
  TrendingUp,
  CheckSquare,
  Clock,
  Layers,
} from "lucide-react";
import Header from "@/components/layout/Header";
import InlineField from "@/components/deal/InlineField";
import TagBadge from "@/components/marketing/TagBadge";
import EngagementBadge from "@/components/marketing/EngagementBadge";
import { api } from "@/lib/api";
import {
  formatDate,
  formatPhone,
  formatCurrency,
  formatRelativeTime,
} from "@/lib/formatters";
import { formatTaskDate } from "@/lib/taskDateTime";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Organization {
  id: string;
  name: string;
  cnpj: string | null;
}

interface DealStage {
  name: string;
}

interface DealPipeline {
  name: string;
}

interface Deal {
  id: string;
  title: string;
  value: number;
  status: "OPEN" | "WON" | "LOST";
  stage: DealStage;
  pipeline: DealPipeline;
}

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  dueDateFormat?: string | null;
  completed: boolean;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

interface ContactTag {
  tag: {
    id: string;
    name: string;
    color: string;
  };
}

interface LeadScore {
  score: number;
  engagementLevel: "ENGAGED" | "INTERMEDIATE" | "DISENGAGED";
}

interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  sector: string | null;
  birthday: string | null;
  instagram: string | null;
  notes: string | null;
  organizationId: string | null;
  createdAt: string;
  updatedAt: string;
  organization: Organization | null;
  deals: Deal[];
  tasks: Task[];
  activities: Activity[];
  customFieldValues: unknown[];
  tags?: ContactTag[];
  leadScore?: LeadScore | null;
}

interface ContactResponse {
  data: ContactDetail;
}

// ─── Deal Status Badge ────────────────────────────────────────────────────────

function DealStatusBadge({ status }: { status: Deal["status"] }) {
  const map: Record<Deal["status"], { label: string; className: string }> = {
    OPEN: { label: "Em aberto", className: "bg-blue-50 text-blue-700" },
    WON: { label: "Ganho", className: "bg-green-50 text-green-700" },
    LOST: { label: "Perdido", className: "bg-red-50 text-red-700" },
  };
  const { label, className } = map[status] ?? map.OPEN;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col h-full overflow-auto animate-pulse">
      <div className="h-16 bg-white border-b border-gray-200" />
      <div className="flex-1 p-4 sm:p-6 space-y-6">
        <div className="h-6 w-40 bg-gray-100 rounded" />
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="w-full sm:w-72 space-y-3 flex-shrink-0">
            <div className="h-24 bg-gray-100 rounded-xl" />
            <div className="h-64 bg-gray-100 rounded-xl" />
          </div>
          <div className="flex-1 bg-gray-100 rounded-xl h-96" />
        </div>
      </div>
    </div>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: "deals", label: "Negociações", icon: TrendingUp },
  { id: "tasks", label: "Tarefas", icon: CheckSquare },
  { id: "history", label: "Histórico", icon: Clock },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("deals");
  const [saving, setSaving] = useState<string | null>(null);

  const fetchContact = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<ContactResponse>(`/contacts/${id}`);
      setContact(res.data);
    } catch (err) {
      setError("Não foi possível carregar o contato.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  const handleFieldSave = useCallback(
    async (field: string, value: string) => {
      if (!contact) return;
      setSaving(field);
      try {
        const payload: Record<string, string | null> = {
          [field]: value || null,
        };
        await api.put<ContactResponse>(`/contacts/${id}`, payload);
        setContact((prev) =>
          prev ? { ...prev, [field]: value || null } : prev
        );
      } catch (err) {
        console.error("Erro ao salvar campo:", err);
      } finally {
        setSaving(null);
      }
    },
    [contact, id]
  );

  if (loading) return <Skeleton />;

  if (error || !contact) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Contato" breadcrumb={["CRM", "Contatos", "Detalhe"]} />
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-4">
              {error ?? "Contato não encontrado."}
            </p>
            <Link
              href="/contacts"
              className="text-sm text-blue-600 hover:underline"
            >
              ← Voltar para Contatos
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const avatarLetter = contact.name.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-full overflow-auto bg-gray-50">
      <Header
        title={contact.name}
        breadcrumb={["CRM", "Contatos", contact.name]}
      />

      <main className="flex-1 p-4 sm:p-6 space-y-4 max-w-screen-xl mx-auto w-full">
        {/* Back link */}
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ChevronLeft size={16} />
          Contatos
        </Link>

        {/* Body */}
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          {/* ── Left Sidebar ── */}
          <aside className="w-full sm:w-72 flex-shrink-0 space-y-4">
            {/* Avatar + name card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                {avatarLetter}
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-900">
                  {contact.name}
                </p>
                {contact.position && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {contact.position}
                  </p>
                )}
                {contact.organization && (
                  <Link
                    href={`/organizations/${contact.organization.id}`}
                    className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1 mt-1"
                  >
                    <Building2 size={11} />
                    {contact.organization.name}
                  </Link>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Criado {formatRelativeTime(contact.createdAt)}
              </p>
            </div>

            {/* Info fields card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Informações
              </p>
              <div className="divide-y divide-gray-100">
                {/* Name */}
                <div className="flex items-start gap-2 py-0.5">
                  <span className="mt-2.5 text-gray-400 flex-shrink-0">
                    {saving === "name" ? (
                      <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    ) : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Nome"
                      value={contact.name ?? ""}
                      onChange={(v) => handleFieldSave("name", v)}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-2 py-0.5">
                  <Mail size={13} className="mt-3 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Email"
                      value={contact.email ?? ""}
                      onChange={(v) => handleFieldSave("email", v)}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-2 py-0.5">
                  <Phone size={13} className="mt-3 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Telefone"
                      value={contact.phone ?? ""}
                      onChange={(v) => handleFieldSave("phone", v)}
                      formatValue={(v) => (v ? formatPhone(v) : "")}
                    />
                  </div>
                </div>

                {/* Position */}
                <div className="flex items-start gap-2 py-0.5">
                  <Briefcase
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Cargo"
                      value={contact.position ?? ""}
                      onChange={(v) => handleFieldSave("position", v)}
                    />
                  </div>
                </div>

                {/* Sector */}
                <div className="flex items-start gap-2 py-0.5">
                  <Layers
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Setor"
                      value={contact.sector ?? ""}
                      onChange={(v) => handleFieldSave("sector", v)}
                    />
                  </div>
                </div>

                {/* Instagram */}
                <div className="flex items-start gap-2 py-0.5">
                  <Instagram
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Instagram"
                      value={contact.instagram ?? ""}
                      onChange={(v) => handleFieldSave("instagram", v)}
                    />
                  </div>
                </div>

                {/* Birthday */}
                <div className="flex items-start gap-2 py-0.5">
                  <Calendar
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Aniversário"
                      value={contact.birthday ?? ""}
                      type="date"
                      onChange={(v) => handleFieldSave("birthday", v)}
                      formatValue={(v) => (v ? formatDate(v) : "")}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="flex items-start gap-2 py-0.5">
                  <FileText
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Notas"
                      value={contact.notes ?? ""}
                      onChange={(v) => handleFieldSave("notes", v)}
                    />
                  </div>
                </div>

                {/* Organization */}
                <div className="flex items-start gap-2 py-0.5">
                  <Building2
                    size={13}
                    className="mt-3 text-gray-400 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    {contact.organization ? (
                      <div className="flex flex-col gap-0.5 py-2">
                        <span className="text-xs text-gray-400">Empresa</span>
                        <Link
                          href={`/organizations/${contact.organization.id}`}
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {contact.organization.name}
                          <ExternalLink size={11} />
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 py-2">
                        <span className="text-xs text-gray-400">Empresa</span>
                        <span className="text-sm italic text-gray-300">
                          Sem empresa
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tags card */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map(({ tag }) => (
                    <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </div>
              </div>
            )}

            {/* Lead Score card */}
            {contact.leadScore && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Lead Score
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-gray-900">
                    {contact.leadScore.score}
                  </span>
                  <EngagementBadge level={contact.leadScore.engagementLevel} />
                </div>
              </div>
            )}
          </aside>

          {/* ── Right Content ── */}
          <div className="flex-1 min-w-0">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map(({ id: tabId, label, icon: Icon }) => (
                  <button
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    className={`flex items-center gap-2 px-3 sm:px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                      activeTab === tabId
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                    {tabId === "deals" && contact.deals.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        {contact.deals.length}
                      </span>
                    )}
                    {tabId === "tasks" && contact.tasks.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        {contact.tasks.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-5">
                {/* Negociações */}
                {activeTab === "deals" && (
                  <div className="space-y-3">
                    {contact.deals.length === 0 ? (
                      <EmptyState
                        icon={<TrendingUp size={32} className="text-gray-300" />}
                        message="Nenhuma negociação vinculada a este contato."
                      />
                    ) : (
                      contact.deals.map((deal) => (
                        <Link
                          key={deal.id}
                          href={`/pipeline/${deal.id}`}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700 truncate">
                              {deal.title}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {deal.pipeline.name} &rsaquo; {deal.stage.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2 sm:ml-4">
                            <span className="text-sm font-semibold text-gray-800">
                              {formatCurrency(deal.value)}
                            </span>
                            <DealStatusBadge status={deal.status} />
                            <ExternalLink
                              size={13}
                              className="text-gray-300 group-hover:text-blue-500 transition-colors"
                            />
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                )}

                {/* Tarefas */}
                {activeTab === "tasks" && (
                  <div className="space-y-2">
                    {contact.tasks.length === 0 ? (
                      <EmptyState
                        icon={<CheckSquare size={32} className="text-gray-300" />}
                        message="Nenhuma tarefa vinculada a este contato."
                      />
                    ) : (
                      contact.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                              task.completed
                                ? "bg-green-500 border-green-500"
                                : "border-gray-300"
                            }`}
                          >
                            {task.completed && (
                              <svg
                                viewBox="0 0 10 10"
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm ${
                                task.completed
                                  ? "line-through text-gray-400"
                                  : "text-gray-800"
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.dueDate && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Vence em {formatTaskDate(task)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Histórico */}
                {activeTab === "history" && (
                  <div>
                    {contact.activities.length === 0 ? (
                      <EmptyState
                        icon={<Clock size={32} className="text-gray-300" />}
                        message="Nenhuma atividade registrada para este contato."
                      />
                    ) : (
                      <ol className="relative border-l border-gray-200 ml-3 space-y-6">
                        {contact.activities.map((activity) => (
                          <li key={activity.id} className="ml-6">
                            <span className="absolute -left-2 flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 ring-4 ring-white">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                            </span>
                            <p className="text-sm text-gray-700">
                              {activity.description}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {formatRelativeTime(activity.createdAt)}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  message,
}: {
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center">
      {icon}
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
