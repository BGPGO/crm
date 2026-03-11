"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import clsx from "clsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type DealStatus = "active" | "won" | "lost";

interface DealContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface DealDetail {
  id: string;
  title: string;
  status: DealStatus;
  stageId: string;
  responsavel: string;
  qualificacao: number; // 0-5
  codigoContaAzul: string;
  fonte: string;
  campanha: string;
  previsaoFechamento: string;
  dataCriacao: string;
  url: string;
  gclid: string;
  contacts: DealContact[];
  company: {
    name: string;
    cnpj: string;
    site: string;
    instagram: string;
  };
  products: DealProduct[];
  tasks: DealTask[];
  timeline: TimelineEvent[];
}

type TabKey = "historico" | "tarefas" | "produtos" | "arquivos";

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGES = [
  { id: "lead", name: "Lead" },
  { id: "contato-feito", name: "Contato Feito" },
  { id: "marcar-reuniao", name: "Marcar Reunião" },
  { id: "reuniao-marcada", name: "Reunião Marcada" },
  { id: "proposta-enviada", name: "Proposta Enviada" },
  { id: "aguardando-dados", name: "Aguardando Dados" },
  { id: "aguardando-assinatura", name: "Aguardando Assinatura" },
  { id: "ganho-fechado", name: "Ganho Fechado" },
];

const LOSS_REASONS = [
  { value: "preco", label: "Preço" },
  { value: "concorrencia", label: "Concorrência" },
  { value: "timing", label: "Timing" },
  { value: "sem-resposta", label: "Sem resposta" },
  { value: "desistiu", label: "Desistiu" },
  { value: "nao-qualificado", label: "Não qualificado" },
];

const RESPONSAVEIS = [
  { value: "joao-silva", label: "João Silva" },
  { value: "maria-santos", label: "Maria Santos" },
  { value: "pedro-lima", label: "Pedro Lima" },
];

const FONTES = [
  { value: "site", label: "Site" },
  { value: "indicacao", label: "Indicação" },
  { value: "instagram", label: "Instagram" },
  { value: "google-ads", label: "Google Ads" },
  { value: "organico", label: "Orgânico" },
  { value: "outros", label: "Outros" },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "historico", label: "Histórico" },
  { key: "tarefas", label: "Tarefas" },
  { key: "produtos", label: "Produtos e Serviços" },
  { key: "arquivos", label: "Arquivos" },
];

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_DEAL: DealDetail = {
  id: "d7",
  title: "Plataforma E-commerce",
  status: "active",
  stageId: "proposta-enviada",
  responsavel: "joao-silva",
  qualificacao: 4,
  codigoContaAzul: "CA-2024-0098",
  fonte: "google-ads",
  campanha: "Conversão Março 2026",
  previsaoFechamento: "2026-04-15",
  dataCriacao: "2026-01-10",
  url: "https://www.empresa.com.br/lp",
  gclid: "EAIaIQobChMI-abc123",
  contacts: [
    { id: "c1", name: "Jorge Santos", phone: "(11) 99887-6655", email: "jorge@empresa.com.br" },
    { id: "c2", name: "Carla Rodrigues", phone: "(11) 94433-2211", email: "carla@empresa.com.br" },
  ],
  company: {
    name: "Empresa E-commerce LTDA",
    cnpj: "12.345.678/0001-99",
    site: "www.empresa.com.br",
    instagram: "@empresa_oficial",
  },
  products: [
    { id: "p1", name: "Plano Growth", recurrence: "Mensal", price: 2500, quantity: 1 },
    { id: "p2", name: "Setup Inicial", recurrence: "Único", price: 5000, quantity: 1 },
    { id: "p3", name: "Integração ERP", recurrence: "Único", price: 3000, quantity: 2 },
  ],
  tasks: [
    { id: "t1", title: "Enviar proposta revisada", dueDate: "2026-03-15", type: "Proposta", done: true },
    { id: "t2", title: "Ligar para confirmar reunião", dueDate: "2026-03-12", type: "Ligação", done: false },
    { id: "t3", title: "Apresentar demo da plataforma", dueDate: "2026-03-18", type: "Reunião", done: false },
  ],
  timeline: [
    {
      id: "e1",
      type: "DEAL_CREATED",
      content: "Negociação criada via lead do Google Ads",
      date: new Date(Date.now() - 60 * 24 * 3600000),
      user: "Sistema",
    },
    {
      id: "e2",
      type: "STAGE_CHANGE",
      content: "alterou a etapa para Contato Feito a partir do funil Vendas",
      date: new Date(Date.now() - 55 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e3",
      type: "CALL",
      content: "registrou uma ligação — apresentou interesse na plataforma",
      date: new Date(Date.now() - 50 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e4",
      type: "STAGE_CHANGE",
      content: "alterou a etapa para Reunião Marcada a partir do funil Vendas",
      date: new Date(Date.now() - 30 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e5",
      type: "MEETING",
      content: "registrou uma reunião — cliente demonstrou interesse no plano anual",
      date: new Date(Date.now() - 20 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e6",
      type: "STAGE_CHANGE",
      content: "alterou a etapa para Proposta Enviada a partir do funil Vendas",
      date: new Date(Date.now() - 8 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e7",
      type: "EMAIL",
      content: "enviou proposta por e-mail",
      date: new Date(Date.now() - 8 * 24 * 3600000),
      user: "João Silva",
    },
    {
      id: "e8",
      type: "NOTE",
      content: "Cliente pediu desconto no setup. Verificar com gerência.",
      date: new Date(Date.now() - 2 * 24 * 3600000),
      user: "João Silva",
    },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function responsavelLabel(value: string) {
  return RESPONSAVEIS.find((r) => r.value === value)?.label ?? value;
}

function fonteLabel(value: string) {
  return FONTES.find((f) => f.value === value)?.label ?? value;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ─── Sidebar Contact Item ─────────────────────────────────────────────────────

function SidebarContact({ contact }: { contact: DealContact }) {
  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
          <User size={12} />
        </div>
        <span className="text-sm font-semibold text-gray-800 truncate">{contact.name}</span>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DealDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [deal, setDeal] = useState<DealDetail>(MOCK_DEAL);
  const [activeTab, setActiveTab] = useState<TabKey>("historico");
  const [showLossModal, setShowLossModal] = useState(false);
  const [showWinModal, setShowWinModal] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");

  const totalValue = deal.products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  const handleMarkWon = () => {
    setDeal((d) => ({ ...d, status: "won", stageId: "ganho-fechado" }));
    setShowWinModal(false);
  };

  const handleMarkLost = () => {
    const lossEvent: TimelineEvent = {
      id: `e${Date.now()}`,
      type: "STATUS_CHANGE",
      content: `marcou a negociação como perdida${lossReason ? `, motivo: ${LOSS_REASONS.find((r) => r.value === lossReason)?.label}` : ""}`,
      date: new Date(),
      user: "João Silva",
    };
    setDeal((d) => ({
      ...d,
      status: "lost",
      timeline: [lossEvent, ...d.timeline],
    }));
    setShowLossModal(false);
    setLossReason("");
    setLossNote("");
  };

  const handleMarkActive = () => {
    const event: TimelineEvent = {
      id: `e${Date.now()}`,
      type: "STATUS_CHANGE",
      content: "retomou a negociação",
      date: new Date(),
      user: "João Silva",
    };
    setDeal((d) => ({
      ...d,
      status: "active",
      timeline: [event, ...d.timeline],
    }));
  };

  const handleAddNote = (note: string) => {
    const newEvent: TimelineEvent = {
      id: `e${Date.now()}`,
      type: "NOTE",
      content: note,
      date: new Date(),
      user: "João Silva",
    };
    setDeal((d) => ({ ...d, timeline: [newEvent, ...d.timeline] }));
  };

  const handleToggleTask = (id: string) => {
    setDeal((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));
  };

  const handleRemoveProduct = (id: string) => {
    setDeal((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
  };

  const handleStageClick = (stageId: string) => {
    if (deal.status !== "active") return;
    const stageEvent: TimelineEvent = {
      id: `e${Date.now()}`,
      type: "STAGE_CHANGE",
      content: `alterou a etapa para ${STAGES.find((s) => s.id === stageId)?.name} a partir do funil Vendas`,
      date: new Date(),
      user: "João Silva",
    };
    setDeal((d) => ({
      ...d,
      stageId,
      timeline: [stageEvent, ...d.timeline],
    }));
  };

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
              onChange={(v) => setDeal((d) => ({ ...d, title: v }))}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-blue-600">
                {formatCurrency(totalValue)}
              </span>
              <StatusBadge status={deal.status} />
              {deal.qualificacao > 0 && (
                <StarRating value={deal.qualificacao} />
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
                  onClick={() => setShowLossModal(true)}
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
        <StageProgressBar
          stages={STAGES}
          currentStageId={deal.stageId}
          status={deal.status}
          onStageClick={handleStageClick}
        />
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
                onChange={(v) => setDeal((d) => ({ ...d, title: v }))}
              />
              <div className="py-2">
                <span className="text-xs text-gray-400">Qualificação</span>
                <div className="mt-1">
                  <StarRating value={deal.qualificacao} />
                </div>
              </div>
              <InlineField
                label="Criado em"
                value={deal.dataCriacao}
                readOnly
                formatValue={(v) => formatDate(v)}
              />
              <div className="py-2">
                <span className="text-xs text-gray-400">Valor total</span>
                <p className="text-sm font-semibold text-blue-600 mt-0.5">
                  {formatCurrency(totalValue)}
                </p>
              </div>
              <InlineField
                label="Data de fechamento"
                value={deal.previsaoFechamento}
                type="date"
                onChange={(v) => setDeal((d) => ({ ...d, previsaoFechamento: v }))}
                formatValue={(v) => (v ? formatDate(v) : "")}
              />
              <InlineField
                label="Fonte"
                value={deal.fonte}
                type="select"
                options={FONTES}
                onChange={(v) => setDeal((d) => ({ ...d, fonte: v }))}
                formatValue={fonteLabel}
              />
              <InlineField
                label="Campanha"
                value={deal.campanha}
                onChange={(v) => setDeal((d) => ({ ...d, campanha: v }))}
              />
              <InlineField
                label="Código Conta Azul"
                value={deal.codigoContaAzul}
                onChange={(v) => setDeal((d) => ({ ...d, codigoContaAzul: v }))}
              />
              <InlineField
                label="URL"
                value={deal.url}
                readOnly
                href={deal.url}
              />
              <InlineField
                label="gclid"
                value={deal.gclid}
                readOnly
              />
            </div>
          </CollapsibleSection>

          {/* Seção: Contatos */}
          <CollapsibleSection title="Contatos" defaultOpen>
            <div>
              {deal.contacts.length === 0 && (
                <p className="text-xs text-gray-400 italic mb-2">Nenhum contato vinculado.</p>
              )}
              {deal.contacts.map((c) => (
                <SidebarContact key={c.id} contact={c} />
              ))}
              <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors mt-2">
                <UserPlus size={13} />
                Adicionar contato
              </button>
            </div>
          </CollapsibleSection>

          {/* Seção: Empresa */}
          <CollapsibleSection title="Empresa" defaultOpen>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} className="text-gray-500" />
                </div>
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {deal.company.name || "—"}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                <InlineField
                  label="CNPJ"
                  value={deal.company.cnpj}
                  onChange={(v) =>
                    setDeal((d) => ({ ...d, company: { ...d.company, cnpj: v } }))
                  }
                />
                <InlineField
                  label="Site"
                  value={deal.company.site}
                  readOnly
                  href={`https://${deal.company.site}`}
                />
                <InlineField
                  label="Instagram"
                  value={deal.company.instagram}
                  onChange={(v) =>
                    setDeal((d) => ({ ...d, company: { ...d.company, instagram: v } }))
                  }
                />
              </div>
              {deal.company.site && (
                <a
                  href={`https://${deal.company.site}`}
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

          {/* Seção: Responsável */}
          <CollapsibleSection title="Responsável" defaultOpen>
            <InlineField
              label="Responsável"
              value={deal.responsavel}
              type="select"
              options={RESPONSAVEIS}
              onChange={(v) => setDeal((d) => ({ ...d, responsavel: v }))}
              formatValue={responsavelLabel}
            />
          </CollapsibleSection>
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
                  {tab.key === "tarefas" && deal.tasks.filter((t) => !t.done).length > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                      {deal.tasks.filter((t) => !t.done).length}
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
                events={deal.timeline}
                onAddNote={handleAddNote}
              />
            )}

            {/* ── Tarefas ── */}
            {activeTab === "tarefas" && (
              <DealTasks
                tasks={deal.tasks}
                onToggle={handleToggleTask}
              />
            )}

            {/* ── Produtos ── */}
            {activeTab === "produtos" && (
              <DealProducts
                products={deal.products}
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
            options={LOSS_REASONS}
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
              disabled={!lossReason}
              onClick={handleMarkLost}
            >
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
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalValue)}</p>
          </div>

          {deal.products.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Produtos incluídos</p>
              <ul className="space-y-1">
                {deal.products.map((p) => (
                  <li key={p.id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{p.name}</span>
                    <span className="text-gray-500 font-medium">
                      {formatCurrency(p.price * p.quantity)}
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
              onClick={handleMarkWon}
            >
              <Check size={14} />
              Confirmar Venda
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
