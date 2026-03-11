"use client";

import { useState } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import clsx from "clsx";
import {
  User,
  Users,
  Kanban,
  Sliders,
  XCircle,
  Radio,
  Globe,
  Package,
  Copy,
  Check,
  Pencil,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

type TabKey =
  | "profile"
  | "team"
  | "pipeline"
  | "custom-fields"
  | "lost-reasons"
  | "sources"
  | "webhooks"
  | "products";

const tabs: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile",       label: "Perfil",                  icon: User },
  { key: "team",          label: "Equipe",                  icon: Users },
  { key: "pipeline",      label: "Pipeline",                icon: Kanban },
  { key: "custom-fields", label: "Campos Personalizados",   icon: Sliders },
  { key: "lost-reasons",  label: "Motivos de Perda",        icon: XCircle },
  { key: "sources",       label: "Fontes",                  icon: Radio },
  { key: "webhooks",      label: "Webhooks",                icon: Globe },
  { key: "products",      label: "Produtos",                icon: Package },
];

// ---------------------------------------------------------------------------
// ProfileTab
// ---------------------------------------------------------------------------
function ProfileTab() {
  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Informações Pessoais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Nome completo" defaultValue="Usuário Admin" />
          <Input label="E-mail" type="email" defaultValue="admin@bgpgo.com.br" />
          <Input label="Telefone" type="tel" placeholder="(11) 99999-9999" />
          <Input label="Cargo" defaultValue="Administrador" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary">Salvar alterações</Button>
        </div>
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Alterar Senha</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <Input label="Senha atual" type="password" />
          <div />
          <Input label="Nova senha" type="password" />
          <Input label="Confirmar nova senha" type="password" />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary">Atualizar senha</Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamTab
// ---------------------------------------------------------------------------
function TeamTab() {
  const members = [
    { name: "Usuário Admin",  email: "admin@bgpgo.com.br",  role: "Admin",    status: "Ativo" },
    { name: "João Vendedor",  email: "joao@bgpgo.com.br",   role: "Vendedor", status: "Ativo" },
    { name: "Maria Gestora",  email: "maria@bgpgo.com.br",  role: "Gestor",   status: "Ativo" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{members.length} membros na equipe</p>
        <Button variant="primary" size="sm">Convidar membro</Button>
      </div>
      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {members.map((m) => (
            <div key={m.email} className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                  {m.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">{m.role}</span>
                <Button variant="ghost" size="sm">Editar</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineTab
// ---------------------------------------------------------------------------
function PipelineTab() {
  const stages = [
    { name: "Lead",                  order: 1, color: "#3B82F6" },
    { name: "Contato Feito",         order: 2, color: "#06B6D4" },
    { name: "Marcar Reunião",        order: 3, color: "#8B5CF6" },
    { name: "Reunião Marcada",       order: 4, color: "#F59E0B" },
    { name: "Proposta Enviada",      order: 5, color: "#F97316" },
    { name: "Aguardando Dados",      order: 6, color: "#EF4444" },
    { name: "Aguardando Assinatura", order: 7, color: "#EC4899" },
    { name: "Ganho Fechado",         order: 8, color: "#22C55E" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">Etapas do funil de vendas</p>
        <Button variant="secondary" size="sm">Adicionar etapa</Button>
      </div>
      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {stages.map((stage) => (
            <div key={stage.name} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-xs text-gray-400 font-mono w-4">{stage.order}</span>
                <p className="text-sm font-medium text-gray-900">{stage.name}</p>
              </div>
              <Button variant="ghost" size="sm">
                <Pencil size={13} className="mr-1" />
                Editar
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Fields (placeholder)
// ---------------------------------------------------------------------------
function CustomFieldsTab() {
  return (
    <Card padding="lg">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sliders size={36} className="text-gray-300 mb-3" />
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Campos Personalizados</h3>
        <p className="text-xs text-gray-400 max-w-xs">
          Esta seção está em desenvolvimento. Em breve você poderá adicionar campos livres às negociações.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LostReasonsTab
// ---------------------------------------------------------------------------
function LostReasonsTab() {
  const [reasons, setReasons] = useState([
    "Preço",
    "Concorrência",
    "Timing",
    "Sem resposta",
    "Desistiu",
    "Não qualificado",
  ]);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  function handleAdd() {
    if (newValue.trim()) {
      setReasons((prev) => [...prev, newValue.trim()]);
      setNewValue("");
      setAdding(false);
    }
  }

  function handleRemove(index: number) {
    setReasons((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{reasons.length} motivos cadastrados</p>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} className="mr-1" />
          Adicionar motivo
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {reasons.map((reason, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-sm text-gray-800">{reason}</p>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                title="Remover"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {adding && (
            <div className="px-5 py-3 flex items-center gap-2">
              <input
                autoFocus
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewValue(""); }
                }}
                placeholder="Nome do motivo..."
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button size="sm" variant="primary" onClick={handleAdd}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewValue(""); }}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourcesTab
// ---------------------------------------------------------------------------
function SourcesTab() {
  const [sources, setSources] = useState([
    "Site",
    "Indicação",
    "Redes Sociais",
    "WhatsApp",
    "Evento",
  ]);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");

  function handleAdd() {
    if (newValue.trim()) {
      setSources((prev) => [...prev, newValue.trim()]);
      setNewValue("");
      setAdding(false);
    }
  }

  function handleRemove(index: number) {
    setSources((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{sources.length} fontes cadastradas</p>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} className="mr-1" />
          Adicionar fonte
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {sources.map((source, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Radio size={14} className="text-blue-400 flex-shrink-0" />
                <p className="text-sm text-gray-800">{source}</p>
              </div>
              <button
                onClick={() => handleRemove(i)}
                className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                title="Remover"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {adding && (
            <div className="px-5 py-3 flex items-center gap-2">
              <input
                autoFocus
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") { setAdding(false); setNewValue(""); }
                }}
                placeholder="Nome da fonte..."
                className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button size="sm" variant="primary" onClick={handleAdd}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewValue(""); }}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WebhooksTab helpers
// ---------------------------------------------------------------------------
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
      title="Copiar URL"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={clsx(
        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
        enabled ? "bg-blue-600" : "bg-gray-200"
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200",
          enabled ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// WebhooksTab
// ---------------------------------------------------------------------------
function WebhooksTab() {
  const [incomingWebhooks, setIncomingWebhooks] = useState([
    {
      id: "whi-1",
      name: "GreatPages",
      url: "https://seucrm.com/api/webhooks/incoming/gp-a1b2c3d4",
      active: true,
    },
  ]);

  const [outgoingWebhooks, setOutgoingWebhooks] = useState([
    {
      id: "who-1",
      name: "BI Dashboard",
      url: "https://bi.empresa.com/hooks/crm-data",
      events: ["deal.won", "deal.lost"],
      active: true,
    },
  ]);

  function toggleIncoming(id: string) {
    setIncomingWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w))
    );
  }

  function toggleOutgoing(id: string) {
    setOutgoingWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w))
    );
  }

  function removeIncoming(id: string) {
    setIncomingWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  function removeOutgoing(id: string) {
    setOutgoingWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Webhooks de Entrada */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Webhooks de Entrada</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Receba leads automaticamente via formulários externos
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Plus size={14} className="mr-1" />
            Novo webhook de entrada
          </Button>
        </div>

        {/* Instrução */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
          Configure o URL gerado na sua landing page (GreatPages, etc.) para receber leads automaticamente no CRM.
        </div>

        <Card padding="none">
          <div className="divide-y divide-gray-100">
            {incomingWebhooks.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">
                Nenhum webhook de entrada configurado.
              </p>
            )}
            {incomingWebhooks.map((wh) => (
              <div key={wh.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{wh.name}</span>
                    <Badge variant={wh.active ? "green" : "gray"}>
                      {wh.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle enabled={wh.active} onChange={() => toggleIncoming(wh.id)} />
                    <Button variant="ghost" size="sm">
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeIncoming(wh.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 font-mono flex-1 truncate">{wh.url}</span>
                  <CopyButton value={wh.url} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Webhooks de Saída */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Webhooks de Saída</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Envie dados do CRM para sistemas externos (BI, automações, etc.)
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Plus size={14} className="mr-1" />
            Novo webhook de saída
          </Button>
        </div>

        <Card padding="none">
          <div className="divide-y divide-gray-100">
            {outgoingWebhooks.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">
                Nenhum webhook de saída configurado.
              </p>
            )}
            {outgoingWebhooks.map((wh) => (
              <div key={wh.id} className="px-5 py-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-purple-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{wh.name}</span>
                    <Badge variant={wh.active ? "green" : "gray"}>
                      {wh.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle enabled={wh.active} onChange={() => toggleOutgoing(wh.id)} />
                    <Button variant="ghost" size="sm">
                      <Pencil size={13} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => removeOutgoing(wh.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 font-mono flex-1 truncate">{wh.url}</span>
                  <CopyButton value={wh.url} />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-400">Eventos:</span>
                  {wh.events.map((evt) => (
                    <span
                      key={evt}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono"
                    >
                      {evt}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductsTab
// ---------------------------------------------------------------------------
type Recurrence = "mensal" | "anual" | "avulso";

const recurrenceBadge: Record<Recurrence, "blue" | "purple" | "gray"> = {
  mensal: "blue",
  anual: "purple",
  avulso: "gray",
};

function ProductsTab() {
  const products = [
    { id: "p1", name: "CRM Pro",             recurrence: "mensal" as Recurrence, value: 297,    active: true },
    { id: "p2", name: "CRM Pro Anual",       recurrence: "anual"  as Recurrence, value: 2970,   active: true },
    { id: "p3", name: "Consultoria Inicial", recurrence: "avulso" as Recurrence, value: 1500,   active: true },
    { id: "p4", name: "Suporte Premium",     recurrence: "mensal" as Recurrence, value: 197,    active: true },
    { id: "p5", name: "Migração de Dados",   recurrence: "avulso" as Recurrence, value: 800,    active: false },
  ];

  const recurrenceLabel: Record<Recurrence, string> = {
    mensal: "Mensal",
    anual: "Anual",
    avulso: "Avulso",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">{products.length} produtos cadastrados</p>
        <Button variant="primary" size="sm">
          <Plus size={14} className="mr-1" />
          Novo Produto
        </Button>
      </div>

      <Card padding="none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Nome</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Recorrência</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Valor</th>
              <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3.5 font-medium text-gray-900">{product.name}</td>
                <td className="px-5 py-3.5">
                  <Badge variant={recurrenceBadge[product.recurrence]}>
                    {recurrenceLabel[product.recurrence]}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-right text-gray-700 font-semibold">
                  {formatCurrency(product.value)}
                </td>
                <td className="px-5 py-3.5 text-center">
                  <Badge variant={product.active ? "green" : "gray"}>
                    {product.active ? "Ativo" : "Inativo"}
                  </Badge>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm">
                      <Pencil size={13} />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Configurações" />

      <main className="flex-1 p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Nav */}
          <div className="lg:w-52 flex-shrink-0">
            <Card padding="sm">
              <nav className="space-y-0.5">
                {tabs.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={clsx(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors",
                      activeTab === key
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </nav>
            </Card>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === "profile"       && <ProfileTab />}
            {activeTab === "team"          && <TeamTab />}
            {activeTab === "pipeline"      && <PipelineTab />}
            {activeTab === "custom-fields" && <CustomFieldsTab />}
            {activeTab === "lost-reasons"  && <LostReasonsTab />}
            {activeTab === "sources"       && <SourcesTab />}
            {activeTab === "webhooks"      && <WebhooksTab />}
            {activeTab === "products"      && <ProductsTab />}
          </div>
        </div>
      </main>
    </div>
  );
}
