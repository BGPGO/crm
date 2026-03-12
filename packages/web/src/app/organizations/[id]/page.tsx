"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Badge from "@/components/ui/Badge";
import InlineField from "@/components/deal/InlineField";
import {
  Building2,
  Phone,
  Globe,
  Mail,
  Instagram,
  MapPin,
  ChevronLeft,
  User,
  Briefcase,
  FileText,
  AlertCircle,
} from "lucide-react";
import {
  formatDate,
  formatPhone,
  formatCurrency,
  formatCNPJ,
  formatRelativeTime,
} from "@/lib/formatters";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrgContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface DealStage {
  name: string;
}

interface DealPipeline {
  name: string;
}

interface DealUser {
  id: string;
  name: string;
}

interface OrgDeal {
  id: string;
  title: string;
  value: number;
  status: string;
  stage: DealStage;
  pipeline: DealPipeline;
  user: DealUser;
}

interface Organization {
  id: string;
  name: string;
  cnpj: string | null;
  segment: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  instagram: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contacts: OrgContact[];
  deals: OrgDeal[];
}

interface OrganizationResponse {
  data: Organization;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEGMENTS = [
  "Tecnologia",
  "Indústria",
  "Logística",
  "Comércio",
  "Varejo",
  "Consultoria",
  "Serviços",
  "Saúde",
  "Educação",
  "Outro",
];

const dealStatusLabel: Record<string, string> = {
  OPEN: "Em andamento",
  WON: "Ganho",
  LOST: "Perdido",
};

const dealStatusVariant: Record<string, "green" | "red" | "blue" | "gray"> = {
  OPEN: "blue",
  WON: "green",
  LOST: "red",
};

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Carregando..." breadcrumb={["CRM", "Empresas", "..."]} />
      <main className="flex-1 p-6">
        <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="flex gap-6">
          <div className="w-72 flex-shrink-0 space-y-3">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
                  <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-8 w-28 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "contacts" | "deals";

export default function OrganizationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("contacts");
  const [saving, setSaving] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<OrganizationResponse>(`/organizations/${id}`);
      setOrg(result.data);
    } catch (err) {
      console.error("Erro ao carregar empresa:", err);
      setError("Não foi possível carregar os dados da empresa.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  const handleFieldSave = async (field: string, value: string) => {
    if (!org) return;
    setSaving(field);
    try {
      const updated = await api.put<OrganizationResponse>(`/organizations/${id}`, {
        [field]: value || null,
      });
      setOrg(updated.data);
    } catch (err) {
      console.error(`Erro ao salvar campo "${field}":`, err);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <Skeleton />;

  if (error || !org) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Empresa" breadcrumb={["CRM", "Empresas"]} />
        <main className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertCircle size={40} className="mx-auto text-red-400" />
            <p className="text-gray-600 text-sm">{error || "Empresa não encontrada."}</p>
            <button
              onClick={() => router.push("/organizations")}
              className="text-sm text-blue-600 hover:underline"
            >
              Voltar para Empresas
            </button>
          </div>
        </main>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "contacts", label: "Contatos", count: org.contacts.length },
    { key: "deals", label: "Negociações", count: org.deals.length },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title={org.name}
        breadcrumb={["CRM", "Empresas", org.name]}
      />

      <main className="flex-1 p-6">
        {/* Back link */}
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
        >
          <ChevronLeft size={16} />
          Empresas
        </Link>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={22} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{org.name}</h2>
            <p className="text-xs text-gray-400">
              Criada {formatRelativeTime(org.createdAt)} · Atualizada {formatRelativeTime(org.updatedAt)}
            </p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6 items-start">
          {/* ── Left sidebar: editable info ── */}
          <aside className="w-72 flex-shrink-0">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Informações da empresa
              </h3>

              {saving && (
                <p className="text-xs text-blue-500 mb-2 animate-pulse">Salvando...</p>
              )}

              <div className="divide-y divide-gray-100">
                {/* Name */}
                <InlineField
                  label="Nome"
                  value={org.name}
                  onChange={(v) => handleFieldSave("name", v)}
                />

                {/* CNPJ */}
                <InlineField
                  label="CNPJ"
                  value={org.cnpj ?? ""}
                  onChange={(v) => handleFieldSave("cnpj", v)}
                  formatValue={(v) => (v ? formatCNPJ(v) : "")}
                />

                {/* Segment */}
                <InlineField
                  label="Segmento"
                  value={org.segment ?? ""}
                  type="select"
                  options={SEGMENTS.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => handleFieldSave("segment", v)}
                />

                {/* Phone */}
                <div className="flex items-start gap-2">
                  <Phone size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Telefone"
                      value={org.phone ?? ""}
                      onChange={(v) => handleFieldSave("phone", v)}
                      formatValue={(v) => (v ? formatPhone(v) : "")}
                    />
                  </div>
                </div>

                {/* Website */}
                <div className="flex items-start gap-2">
                  <Globe size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Website"
                      value={org.website ?? ""}
                      onChange={(v) => handleFieldSave("website", v)}
                    />
                  </div>
                </div>

                {/* Instagram */}
                <div className="flex items-start gap-2">
                  <Instagram size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Instagram"
                      value={org.instagram ?? ""}
                      onChange={(v) => handleFieldSave("instagram", v)}
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-2">
                  <Mail size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Email"
                      value={org.email ?? ""}
                      onChange={(v) => handleFieldSave("email", v)}
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Endereço"
                      value={org.address ?? ""}
                      onChange={(v) => handleFieldSave("address", v)}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="flex items-start gap-2">
                  <FileText size={13} className="text-gray-300 mt-3.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <InlineField
                      label="Observações"
                      value={org.notes ?? ""}
                      onChange={(v) => handleFieldSave("notes", v)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Right content: tabbed panels ── */}
          <section className="flex-1 min-w-0">
            {/* Tab bar */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === tab.key
                      ? "text-blue-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.key
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab: Contatos ── */}
            {activeTab === "contacts" && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {org.contacts.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    <User size={32} className="mx-auto mb-2 text-gray-200" />
                    Nenhum contato vinculado a esta empresa.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {org.contacts.map((contact) => (
                      <li key={contact.id}>
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                              {contact.name}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              {contact.email && (
                                <span className="text-xs text-gray-400 flex items-center gap-1 truncate">
                                  <Mail size={11} />
                                  {contact.email}
                                </span>
                              )}
                              {contact.phone && (
                                <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                                  <Phone size={11} />
                                  {formatPhone(contact.phone)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronLeft
                            size={14}
                            className="text-gray-300 group-hover:text-blue-400 rotate-180 flex-shrink-0"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Tab: Negociações ── */}
            {activeTab === "deals" && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {org.deals.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">
                    <Briefcase size={32} className="mx-auto mb-2 text-gray-200" />
                    Nenhuma negociação vinculada a esta empresa.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {org.deals.map((deal) => (
                      <li key={deal.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {deal.title}
                              </span>
                              <Badge variant={dealStatusVariant[deal.status] ?? "gray"}>
                                {dealStatusLabel[deal.status] ?? deal.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-gray-400">
                                {deal.pipeline.name} · {deal.stage.name}
                              </span>
                              <span className="text-xs text-gray-400 flex items-center gap-1">
                                <User size={10} />
                                {deal.user.name}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-gray-800 flex-shrink-0">
                            {formatCurrency(deal.value)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </section>
        </div>
      </main>
    </div>
  );
}
