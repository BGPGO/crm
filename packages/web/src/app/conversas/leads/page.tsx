"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import Card from "@/components/ui/Card";
import { Search, Link2, Check, X, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Lead {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  lastMessage: string | null;
  contactId: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  meetingBooked: "bg-blue-100 text-blue-700",
  needsHumanAttention: "bg-yellow-100 text-yellow-700",
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  meetingBooked: "Reunião Agendada",
  needsHumanAttention: "Atenção Humana",
};

export default function ConversasLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [contactIdInput, setContactIdInput] = useState("");
  const [linking, setLinking] = useState(false);
  const limit = 20;

  const fetchLeads = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<{ data: Lead[]; meta?: { total: number } }>(
        `/whatsapp/leads?page=${page}&limit=${limit}`
      );
      setLeads(res.data || []);
      setTotal(res.meta?.total ?? res.data?.length ?? 0);
    } catch {
      setError("Erro ao carregar leads.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = leads.filter((lead) => {
    const q = search.toLowerCase();
    return (
      (lead.name?.toLowerCase().includes(q) ?? false) ||
      lead.phone.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleLink = async (leadId: string) => {
    if (!contactIdInput.trim()) return;
    setLinking(true);
    try {
      await api.put(`/whatsapp/leads/${leadId}`, { contactId: contactIdInput.trim() });
      setModalOpen(null);
      setContactIdInput("");
      await fetchLeads();
    } catch {
      setError("Erro ao vincular lead.");
    } finally {
      setLinking(false);
    }
  };

  const handleDelete = async (leadId: string, leadName: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o lead "${leadName}"? Todas as mensagens e dados relacionados serão removidos.`)) {
      return;
    }
    try {
      await api.delete(`/whatsapp/leads/${leadId}`);
      await fetchLeads();
    } catch {
      setError("Erro ao excluir lead.");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Leads WhatsApp" breadcrumb={["Conversas", "Leads"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchLeads()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-6 space-y-4">
        {/* Search */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Última Mensagem</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">CRM</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                      Nenhum lead encontrado
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {lead.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          statusColors[lead.status] || "bg-gray-100 text-gray-600"
                        )}>
                          {statusLabels[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                        {lead.lastMessage || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(lead.createdAt)}</td>
                      <td className="px-4 py-3">
                        {lead.contactId ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <Check size={12} /> Vinculado
                          </span>
                        ) : (
                          <button
                            onClick={() => { setModalOpen(lead.id); setContactIdInput(""); }}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline"
                          >
                            <Link2 size={12} /> Vincular ao CRM
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(lead.id, lead.name || lead.phone)}
                          className="inline-flex items-center justify-center p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir lead"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Página {page} de {totalPages} ({total} leads)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Vincular ao CRM */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Vincular Lead ao CRM</h3>
              <button onClick={() => setModalOpen(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <label className="block text-sm text-gray-600 mb-1">ID do Contato no CRM</label>
            <input
              type="text"
              value={contactIdInput}
              onChange={(e) => setContactIdInput(e.target.value)}
              placeholder="Ex: abc123-def456..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleLink(modalOpen)}
                disabled={!contactIdInput.trim() || linking}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {linking ? "Vinculando..." : "Vincular"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
