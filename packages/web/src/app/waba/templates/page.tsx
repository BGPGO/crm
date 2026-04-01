"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  RefreshCw,
  LayoutTemplate,
  Copy,
  Check,
  Image,
  Video,
  FileText,
  Type,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";

// ── Types ────────────────────────────────────────────────────────────────────

interface TemplateButton {
  type: "QUICK_REPLY" | "URL";
  text: string;
  url?: string;
  payload?: string;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";
  metaTemplateId: string | null;
  headerType: string | null;
  headerContent: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[] | null;
  components: unknown | null;
  bodyExamples: string[][] | null;
  headerExample: string | null;
  editsRemaining: number;
  lastEditedAt: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "ALL" | "APPROVED" | "PENDING" | "REJECTED";
type CategoryFilter = "ALL" | "MARKETING" | "UTILITY";
function isAutomationTemplate(tpl: WhatsAppTemplate): boolean {
  return tpl.name.startsWith("cadencia_");
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WhatsAppTemplate["status"],
  { label: string; variant: "green" | "yellow" | "red" | "gray" | "orange" }
> = {
  APPROVED: { label: "Aprovado", variant: "green" },
  PENDING: { label: "Pendente", variant: "yellow" },
  REJECTED: { label: "Rejeitado", variant: "red" },
  PAUSED: { label: "Pausado", variant: "gray" },
  DISABLED: { label: "Desativado", variant: "orange" },
};

const CATEGORY_CONFIG: Record<
  WhatsAppTemplate["category"],
  { label: string; variant: "blue" | "purple" | "gray" }
> = {
  MARKETING: { label: "Marketing", variant: "blue" },
  UTILITY: { label: "Utility", variant: "purple" },
  AUTHENTICATION: { label: "Autenticacao", variant: "gray" },
};

const VARIABLE_HINTS: Record<string, string> = {
  "{{1}}": "Nome do contato",
};

const LANGUAGE_OPTIONS = [
  { value: "pt_BR", label: "Portugues (BR)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Espanol" },
];

const HEADER_TYPES = [
  { value: "", label: "Nenhum" },
  { value: "TEXT", label: "Texto" },
  { value: "IMAGE", label: "Imagem" },
  { value: "VIDEO", label: "Video" },
  { value: "DOCUMENT", label: "Documento" },
];

const EMPTY_FORM: FormState = {
  name: "",
  language: "pt_BR",
  category: "MARKETING",
  headerType: "",
  headerContent: "",
  body: "",
  footer: "",
  buttons: [],
  bodyExamples: [],
  headerExample: "",
};

interface FormState {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  headerType: string;
  headerContent: string;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  bodyExamples: string[];
  headerExample: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTemplateName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{\d+\}\}/g);
  if (!matches) return [];
  const unique = [...new Set(matches)];
  unique.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    return numA - numB;
  });
  return unique;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function HeaderTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case "IMAGE":
      return <Image size={14} className="text-blue-500" />;
    case "VIDEO":
      return <Video size={14} className="text-purple-500" />;
    case "DOCUMENT":
      return <FileText size={14} className="text-orange-500" />;
    case "TEXT":
      return <Type size={14} className="text-gray-500" />;
    default:
      return null;
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2",
            t.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-0.5 rounded hover:bg-white/20 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── WhatsApp Preview ─────────────────────────────────────────────────────────

function WhatsAppPreview({ form }: { form: FormState }) {
  const variables = extractVariables(form.body);
  const previewBody = variables.reduce((text, v, i) => {
    const example = form.bodyExamples[i] || `[exemplo ${i + 1}]`;
    return text.replace(v, example);
  }, form.body);

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium text-gray-500 mb-3">Preview WhatsApp</p>
      <div className="w-full max-w-[280px] bg-[#e5ddd5] dark:bg-gray-800 rounded-xl p-4 min-h-[200px]">
        {/* Message bubble */}
        <div className="bg-white dark:bg-gray-700 rounded-lg shadow-sm overflow-hidden max-w-[260px]">
          {/* Header */}
          {form.headerType === "IMAGE" && (
            <div className="bg-gray-100 dark:bg-gray-600 h-32 flex items-center justify-center">
              <Image size={32} className="text-gray-400" />
            </div>
          )}
          {form.headerType === "VIDEO" && (
            <div className="bg-gray-100 dark:bg-gray-600 h-32 flex items-center justify-center">
              <Video size={32} className="text-gray-400" />
            </div>
          )}
          {form.headerType === "DOCUMENT" && (
            <div className="bg-gray-100 dark:bg-gray-600 h-16 flex items-center justify-center gap-2">
              <FileText size={20} className="text-gray-400" />
              <span className="text-xs text-gray-500">documento.pdf</span>
            </div>
          )}
          {form.headerType === "TEXT" && form.headerContent && (
            <div className="px-3 pt-2">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {form.headerContent}
              </p>
            </div>
          )}

          {/* Body */}
          <div className="px-3 py-2">
            <p className="text-[13px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {previewBody || (
                <span className="text-gray-400 italic">Corpo da mensagem...</span>
              )}
            </p>
          </div>

          {/* Footer */}
          {form.footer && (
            <div className="px-3 pb-2">
              <p className="text-[11px] text-gray-500">{form.footer}</p>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-3 pb-1.5 flex justify-end">
            <span className="text-[10px] text-gray-400">12:00</span>
          </div>

          {/* Buttons */}
          {form.buttons.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-600">
              {form.buttons.map((btn, i) => (
                <button
                  key={i}
                  className="w-full py-2 text-center text-[13px] text-blue-500 font-medium border-t border-gray-100 dark:border-gray-600 first:border-t-0 flex items-center justify-center gap-1"
                >
                  {btn.type === "URL" && <ExternalLink size={12} />}
                  {btn.text || `Botao ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  // Data
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Sync
  const [syncing, setSyncing] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Copy
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Toast
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Body textarea ref
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // ── Toast helpers ────────────────────────────────────────────────────────

  const addToast = useCallback((message: string, type: "success" | "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ data: WhatsAppTemplate[] }>(
        "/whatsapp/cloud/templates"
      );
      setTemplates(res.data || []);
    } catch {
      setError("Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Filtered data ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      if (categoryFilter !== "ALL" && t.category !== categoryFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (
          !t.name.toLowerCase().includes(q) &&
          !t.body.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [templates, statusFilter, categoryFilter, searchTerm]);


  const stats = useMemo(() => {
    const approved = templates.filter((t) => t.status === "APPROVED").length;
    const pending = templates.filter((t) => t.status === "PENDING").length;
    const rejected = templates.filter((t) => t.status === "REJECTED").length;
    return { approved, pending, rejected };
  }, [templates]);

  // ── Sync ─────────────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/whatsapp/cloud/templates/sync", {});
      await fetchTemplates();
      addToast("Templates sincronizados com a Meta.", "success");
    } catch {
      addToast("Erro ao sincronizar templates.", "error");
    } finally {
      setSyncing(false);
    }
  };

  // ── Form helpers ─────────────────────────────────────────────────────────

  const updateForm = (patch: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const variables = useMemo(() => extractVariables(form.body), [form.body]);

  // Keep bodyExamples array in sync with variables count
  useEffect(() => {
    setForm((prev) => {
      const needed = variables.length;
      const current = prev.bodyExamples;
      if (current.length === needed) return prev;
      const next = Array.from({ length: needed }, (_, i) => current[i] || "");
      return { ...prev, bodyExamples: next };
    });
  }, [variables]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (tpl: WhatsAppTemplate) => {
    setEditingTemplate(tpl);
    const bodyVars = extractVariables(tpl.body);
    const examples =
      tpl.bodyExamples && tpl.bodyExamples[0]
        ? tpl.bodyExamples[0]
        : Array.from({ length: bodyVars.length }, () => "");
    setForm({
      name: tpl.name,
      language: tpl.language,
      category: tpl.category,
      headerType: tpl.headerType || "",
      headerContent: tpl.headerContent || "",
      body: tpl.body,
      footer: tpl.footer || "",
      buttons: tpl.buttons || [],
      bodyExamples: examples,
      headerExample: tpl.headerExample || "",
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Nome do template e obrigatorio.");
      return;
    }
    if (!form.body.trim()) {
      setFormError("O corpo da mensagem e obrigatorio.");
      return;
    }
    if (form.body.length > 1024) {
      setFormError("O corpo excede 1024 caracteres.");
      return;
    }
    if (form.footer && form.footer.length > 60) {
      setFormError("O rodape excede 60 caracteres.");
      return;
    }

    // Validate examples
    const vars = extractVariables(form.body);
    for (let i = 0; i < vars.length; i++) {
      if (!form.bodyExamples[i]?.trim()) {
        setFormError(`Exemplo para ${vars[i]} e obrigatorio.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      name: formatTemplateName(form.name),
      language: form.language,
      category: form.category,
      headerType: form.headerType || null,
      headerContent: form.headerContent || null,
      body: form.body.trim(),
      footer: form.footer.trim() || null,
      buttons: form.buttons.length > 0 ? form.buttons : null,
      bodyExamples: vars.length > 0 ? [form.bodyExamples] : null,
      headerExample: form.headerExample || null,
    };

    try {
      if (editingTemplate) {
        await api.put(
          `/whatsapp/cloud/templates/${editingTemplate.id}`,
          payload
        );
        addToast("Template atualizado com sucesso.", "success");
      } else {
        await api.post("/whatsapp/cloud/templates", payload);
        addToast("Template criado e enviado para aprovacao.", "success");
      }
      setShowModal(false);
      await fetchTemplates();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar template.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async (tpl: WhatsAppTemplate) => {
    if (!confirm(`Excluir o template "${tpl.name}"? Esta acao nao pode ser desfeita.`)) {
      return;
    }
    setDeletingId(tpl.id);
    try {
      await api.delete(`/whatsapp/cloud/templates/${tpl.id}`);
      addToast("Template excluido.", "success");
      await fetchTemplates();
    } catch {
      addToast("Erro ao excluir template.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Copy name ────────────────────────────────────────────────────────────

  const copyName = async (name: string, id: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  // ── Insert variable ─────────────────────────────────────────────────────

  const insertVariable = () => {
    const nextNum = variables.length + 1;
    const placeholder = `{{${nextNum}}}`;
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody =
        form.body.slice(0, start) + placeholder + form.body.slice(end);
      updateForm({ body: newBody });
      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + placeholder.length,
          start + placeholder.length
        );
      });
    } else {
      updateForm({ body: form.body + placeholder });
    }
  };

  // ── Buttons helpers ──────────────────────────────────────────────────────

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    updateForm({
      buttons: [...form.buttons, { type: "QUICK_REPLY", text: "" }],
    });
  };

  const updateButton = (index: number, patch: Partial<TemplateButton>) => {
    const next = form.buttons.map((b, i) => (i === index ? { ...b, ...patch } : b));
    updateForm({ buttons: next });
  };

  const removeButton = (index: number) => {
    updateForm({ buttons: form.buttons.filter((_, i) => i !== index) });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto">
      <main className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Templates
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gerencie seus templates de mensagem do WhatsApp
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className={clsx(
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
                "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 shadow-sm",
                "dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <RefreshCw
                size={16}
                className={clsx(syncing && "animate-spin")}
              />
              Sincronizar com Meta
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} />
              Novo Template
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
            <span className="text-sm text-red-700 dark:text-red-400">
              {error}
            </span>
            <button
              onClick={fetchTemplates}
              className="text-sm text-red-600 dark:text-red-400 font-medium hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}


        {/* Filter/stats bar */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status pills */}
            {(
              [
                { key: "ALL", label: "Todos" },
                { key: "APPROVED", label: "Aprovados" },
                { key: "PENDING", label: "Pendentes" },
                { key: "REJECTED", label: "Rejeitados" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.key}
                onClick={() => setStatusFilter(pill.key)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                  statusFilter === pill.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                {pill.label}
              </button>
            ))}

            {/* Category filter */}
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) =>
                  setCategoryFilter(e.target.value as CategoryFilter)
                }
                className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALL">Todas categorias</option>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utility</option>
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 w-full lg:w-auto">
            {/* Stats */}
            {!loading && templates.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap hidden sm:block">
                {stats.approved} aprovados &middot; {stats.pending} pendentes
                &middot; {stats.rejected} rejeitados
              </p>
            )}

            {/* Search */}
            <div className="relative flex-1 lg:flex-initial">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar templates..."
                className="w-full lg:w-60 pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Template grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} padding="md">
                <div className="space-y-3 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
                    <div className="h-5 w-14 bg-gray-100 dark:bg-gray-700 rounded-full" />
                  </div>
                  <div className="h-4 w-40 bg-gray-100 dark:bg-gray-700 rounded" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-gray-100 dark:bg-gray-700 rounded" />
                    <div className="h-3 w-3/4 bg-gray-100 dark:bg-gray-700 rounded" />
                  </div>
                  <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
                </div>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutTemplate
                size={48}
                strokeWidth={1.2}
                className="text-gray-300 dark:text-gray-600 mb-4"
              />
              <p className="text-gray-500 dark:text-gray-400 mb-1 font-medium">
                {templates.length === 0
                  ? "Nenhum template encontrado"
                  : "Nenhum resultado para os filtros selecionados"}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                {templates.length === 0
                  ? "Crie seu primeiro template para enviar mensagens pelo WhatsApp."
                  : "Tente alterar os filtros ou o termo de busca."}
              </p>
              {templates.length === 0 && (
                <button
                  onClick={openCreateModal}
                  className="text-sm text-blue-600 font-medium hover:underline"
                >
                  Criar primeiro template
                </button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((tpl) => (
              <Card
                key={tpl.id}
                padding="none"
                className="flex flex-col hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700"
              >
                {/* Rejected banner */}
                {tpl.status === "REJECTED" && tpl.rejectedReason && (
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                      <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                      <span>{tpl.rejectedReason}</span>
                    </p>
                  </div>
                )}

                <div className="p-4 flex-1 flex flex-col gap-3">
                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={STATUS_CONFIG[tpl.status].variant}>
                      {STATUS_CONFIG[tpl.status].label}
                    </Badge>
                    <Badge variant={CATEGORY_CONFIG[tpl.category].variant}>
                      {CATEGORY_CONFIG[tpl.category].label}
                    </Badge>
                    <Badge variant="gray">{tpl.language}</Badge>
                    {tpl.headerType && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                        <HeaderTypeIcon type={tpl.headerType} />
                        {tpl.headerType === "TEXT"
                          ? "Texto"
                          : tpl.headerType === "IMAGE"
                          ? "Imagem"
                          : tpl.headerType === "VIDEO"
                          ? "Video"
                          : "Documento"}
                      </span>
                    )}
                    {tpl.qualityScore && (
                      <Badge
                        variant={
                          tpl.qualityScore === "GREEN"
                            ? "green"
                            : tpl.qualityScore === "YELLOW"
                            ? "yellow"
                            : "red"
                        }
                      >
                        Q: {tpl.qualityScore}
                      </Badge>
                    )}
                    {isAutomationTemplate(tpl) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-700" title="Template usado em automacoes de cadencia">
                        Automacao
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono">
                      {tpl.name}
                    </p>
                    <button
                      onClick={() => copyName(tpl.name, tpl.id)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-400"
                      title="Copiar nome"
                    >
                      {copiedId === tpl.id ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>

                  {/* Body preview */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed flex-1 whitespace-pre-wrap">
                    {highlightVariables(truncate(tpl.body, 160))}
                  </p>

                  {/* Buttons preview */}
                  {tpl.buttons && tpl.buttons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tpl.buttons.map((btn: TemplateButton, i: number) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800"
                        >
                          {btn.type === "URL" && <ExternalLink size={10} />}
                          {btn.text}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  {tpl.footer && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                      {tpl.footer}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <span>
                      Edicoes: {tpl.editsRemaining}/10
                    </span>
                    <span>{formatDate(tpl.lastEditedAt || tpl.updatedAt)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center border-t border-gray-100 dark:border-gray-700">
                  <button
                    onClick={() => openEditModal(tpl)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-bl-xl"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <div className="w-px h-6 bg-gray-100 dark:bg-gray-700" />
                  <button
                    onClick={() => handleDelete(tpl)}
                    disabled={deletingId === tpl.id}
                    className={clsx(
                      "flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors rounded-br-xl",
                      deletingId === tpl.id
                        ? "text-gray-400 cursor-not-allowed"
                        : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                    )}
                  >
                    <Trash2 size={13} />
                    {deletingId === tpl.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl my-8 border border-gray-200 dark:border-gray-700 flex flex-col max-h-[calc(100vh-4rem)]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingTemplate ? "Editar Template" : "Novo Template"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200 dark:divide-gray-700">
                {/* Left: Form */}
                <div className="flex-1 p-6 space-y-5 overflow-y-auto">
                  {/* Name */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nome do template
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateForm({ name: e.target.value })}
                      onBlur={() =>
                        updateForm({ name: formatTemplateName(form.name) })
                      }
                      placeholder="ex: boas_vindas_lead"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Somente letras minusculas, numeros e underscores.
                    </p>
                  </div>

                  {/* Language + Category row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Idioma
                      </label>
                      <select
                        value={form.language}
                        onChange={(e) =>
                          updateForm({ language: e.target.value })
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {LANGUAGE_OPTIONS.map((l) => (
                          <option key={l.value} value={l.value}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Categoria
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) =>
                          updateForm({
                            category: e.target.value as FormState["category"],
                          })
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="MARKETING">Marketing</option>
                        <option value="UTILITY">Utility</option>
                        <option value="AUTHENTICATION">Autenticacao</option>
                      </select>
                    </div>
                  </div>

                  {/* Header */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Cabecalho (opcional)
                    </label>
                    <select
                      value={form.headerType}
                      onChange={(e) =>
                        updateForm({
                          headerType: e.target.value,
                          headerContent: "",
                          headerExample: "",
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {HEADER_TYPES.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>

                    {form.headerType === "TEXT" && (
                      <input
                        type="text"
                        value={form.headerContent}
                        onChange={(e) =>
                          updateForm({ headerContent: e.target.value })
                        }
                        placeholder="Texto do cabecalho"
                        maxLength={60}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}

                    {(form.headerType === "IMAGE" ||
                      form.headerType === "VIDEO" ||
                      form.headerType === "DOCUMENT") && (
                      <div className="space-y-2">
                        <input
                          type="url"
                          value={form.headerExample}
                          onChange={(e) =>
                            updateForm({ headerExample: e.target.value })
                          }
                          placeholder={`URL do ${
                            form.headerType === "IMAGE"
                              ? "imagem"
                              : form.headerType === "VIDEO"
                              ? "video"
                              : "documento"
                          } de exemplo`}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-400">
                          A Meta exige um exemplo de midia para aprovacao.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Corpo da mensagem
                      </label>
                      <span
                        className={clsx(
                          "text-xs",
                          form.body.length > 1024
                            ? "text-red-500"
                            : "text-gray-400"
                        )}
                      >
                        {form.body.length}/1024
                      </span>
                    </div>
                    <div className="relative">
                      <textarea
                        ref={bodyRef}
                        value={form.body}
                        onChange={(e) => updateForm({ body: e.target.value })}
                        rows={8}
                        placeholder="Ola {{1}}, tudo bem? Temos novidades sobre {{2}}..."
                        maxLength={1024}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono leading-relaxed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={insertVariable}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-200 dark:border-blue-800"
                    >
                      <Plus size={12} />
                      Adicionar variavel {`{{${variables.length + 1}}}`}
                    </button>
                  </div>

                  {/* Body examples */}
                  {variables.length > 0 && (
                    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Exemplos das variaveis
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        A Meta exige exemplos reais para aprovar o template.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {variables.map((v, i) => (
                          <div key={v} className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              {v}
                              {VARIABLE_HINTS[v] && (
                                <span className="ml-1 text-gray-400 dark:text-gray-500 font-normal">
                                  ({VARIABLE_HINTS[v]})
                                </span>
                              )}
                            </label>
                            <input
                              type="text"
                              value={form.bodyExamples[i] || ""}
                              onChange={(e) => {
                                const next = [...form.bodyExamples];
                                next[i] = e.target.value;
                                updateForm({ bodyExamples: next });
                              }}
                              placeholder={`Exemplo para ${v}`}
                              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Rodape (opcional)
                      </label>
                      <span
                        className={clsx(
                          "text-xs",
                          (form.footer?.length || 0) > 60
                            ? "text-red-500"
                            : "text-gray-400"
                        )}
                      >
                        {form.footer?.length || 0}/60
                      </span>
                    </div>
                    <input
                      type="text"
                      value={form.footer}
                      onChange={(e) => updateForm({ footer: e.target.value })}
                      placeholder="Ex: Bertuzzi Patrimonial"
                      maxLength={60}
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Buttons */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Botoes (opcional, max 3)
                      </label>
                      {form.buttons.length < 3 && (
                        <button
                          type="button"
                          onClick={addButton}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Plus size={12} />
                          Adicionar
                        </button>
                      )}
                    </div>

                    {form.buttons.map((btn, i) => (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row items-start gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <select
                          value={btn.type}
                          onChange={(e) =>
                            updateButton(i, {
                              type: e.target.value as TemplateButton["type"],
                              url: "",
                            })
                          }
                          className="px-2 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="QUICK_REPLY">Resposta rapida</option>
                          <option value="URL">URL</option>
                        </select>
                        <input
                          type="text"
                          value={btn.text}
                          onChange={(e) =>
                            updateButton(i, { text: e.target.value })
                          }
                          placeholder="Texto do botao"
                          maxLength={25}
                          className="flex-1 w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {btn.type === "URL" && (
                          <input
                            type="url"
                            value={btn.url || ""}
                            onChange={(e) =>
                              updateButton(i, { url: e.target.value })
                            }
                            placeholder="https://..."
                            className="flex-1 w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => removeButton(i)}
                          className="p-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Form error */}
                  {formError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                      <AlertCircle size={16} className="flex-shrink-0" />
                      {formError}
                    </div>
                  )}
                </div>

                {/* Right: Preview */}
                <div className="lg:w-[320px] flex-shrink-0 p-6 bg-gray-50 dark:bg-gray-800/50">
                  <WhatsAppPreview form={form} />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.body.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {saving && (
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                {saving
                  ? "Salvando..."
                  : editingTemplate
                  ? "Salvar Alteracoes"
                  : "Criar Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── Variable highlighting helper ─────────────────────────────────────────────

function highlightVariables(text: string): React.ReactNode {
  const parts = text.split(/(\{\{\d+\}\})/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /\{\{\d+\}\}/.test(part) ? (
      <span
        key={i}
        className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-mono font-medium cursor-help"
        title={VARIABLE_HINTS[part] || `Variavel ${part}`}
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
