"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
}

const CATEGORY_OPTIONS = [
  { value: "geral", label: "Geral" },
  { value: "boas-vindas", label: "Boas-vindas" },
  { value: "follow-up", label: "Follow-up" },
  { value: "agendamento", label: "Agendamento" },
  { value: "proposta", label: "Proposta" },
  { value: "reengajamento", label: "Reengajamento" },
];

const categoryLabel = (value: string) =>
  CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? value;

export default function ModelosPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search / filter
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("geral");
  const [formContent, setFormContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set("search", searchTerm);
      if (filterCategory) params.set("category", filterCategory);
      const query = params.toString();
      const res = await api.get<{ data: MessageTemplate[] }>(
        `/whatsapp/message-templates${query ? `?${query}` : ""}`
      );
      setTemplates(res.data || []);
    } catch {
      setError("Erro ao carregar modelos de mensagem.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterCategory]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormCategory("geral");
    setFormContent("");
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormCategory(template.category);
    setFormContent(template.content);
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formContent.trim()) {
      setFormError("Nome e conteudo sao obrigatorios.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingTemplate) {
        await api.put(`/whatsapp/message-templates/${editingTemplate.id}`, {
          name: formName.trim(),
          category: formCategory,
          content: formContent.trim(),
        });
      } else {
        await api.post("/whatsapp/message-templates", {
          name: formName.trim(),
          category: formCategory,
          content: formContent.trim(),
        });
      }

      setShowModal(false);
      await fetchTemplates();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar modelo.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/whatsapp/message-templates/${id}`);
      await fetchTemplates();
    } catch {
      setError("Erro ao excluir modelo.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Modelos de Mensagem" breadcrumb={["Conversas", "Modelos"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => fetchTemplates()}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Modelos de Mensagem
          </h2>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nome ou conteudo..."
                className="w-full sm:w-64 pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Category filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">Todas categorias</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {/* New button */}
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus size={16} />
              Novo Modelo
            </button>
          </div>
        </div>

        {/* Table */}
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Nome
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">
                    Categoria
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">
                    Preview
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-28">
                    Acoes
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : templates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <FileText size={32} strokeWidth={1.5} />
                        <p>Nenhum modelo encontrado</p>
                        <button
                          onClick={openCreateModal}
                          className="text-blue-600 text-sm font-medium hover:underline"
                        >
                          Criar primeiro modelo
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  templates.map((tpl) => (
                    <tr
                      key={tpl.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {tpl.name}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {categoryLabel(tpl.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-md hidden sm:table-cell">
                        <p className="truncate">{tpl.content}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(tpl)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
                          >
                            <Pencil size={12} />
                            Editar
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Excluir o modelo "${tpl.name}"? Esta acao nao pode ser desfeita.`
                                )
                              ) {
                                handleDelete(tpl.id);
                              }
                            }}
                            disabled={deletingId === tpl.id}
                            className={clsx(
                              "inline-flex items-center gap-1 text-xs font-medium hover:underline",
                              deletingId === tpl.id
                                ? "text-gray-400 cursor-not-allowed"
                                : "text-red-600"
                            )}
                          >
                            <Trash2 size={12} />
                            {deletingId === tpl.id ? "..." : "Excluir"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingTemplate ? "Editar Modelo" : "Novo Modelo"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Boas-vindas Lead"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Conteudo da Mensagem
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={6}
                  placeholder="Ola {{nome}}, tudo bem? ..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Placeholders disponiveis:{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                    {"{{nome}}"}
                  </code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                    {"{{email}}"}
                  </code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                    {"{{telefone}}"}
                  </code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                    {"{{cidade}}"}
                  </code>{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600">
                    {"{{estado}}"}
                  </code>
                </p>
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle size={14} />
                  {formError}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formContent.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving
                  ? "Salvando..."
                  : editingTemplate
                  ? "Salvar Alteracoes"
                  : "Criar Modelo"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
