"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import ConversasNav from "@/components/conversas/ConversasNav";
import AutomationCard from "@/components/automations/AutomationCard";
import AutomationCreateModal from "@/components/automations/AutomationCreateModal";
import EnrollmentsPanel from "@/components/automations/EnrollmentsPanel";
import Button from "@/components/ui/Button";
import { Plus, Zap } from "lucide-react";
import { api } from "@/lib/api";

interface Automation {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  triggerType: string;
  triggerConfig?: any;
  _count?: { steps: number; enrollments: number };
  createdAt: string;
}

export default function ConversasAutomacoesPage() {
  const router = useRouter();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewEnrollments, setViewEnrollments] = useState<{ id: string; name: string } | null>(null);

  const fetchAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Automation[] }>("/automations");
      setAutomations(res.data || []);
    } catch {
      setError("Erro ao carregar automações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutomations();
  }, [fetchAutomations]);

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/automations/${id}/activate`, {});
      await fetchAutomations();
    } catch {
      setError("Erro ao ativar automação.");
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.post(`/automations/${id}/pause`, {});
      await fetchAutomations();
    } catch {
      setError("Erro ao pausar automação.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta automação?")) return;
    try {
      await api.delete(`/automations/${id}`);
      await fetchAutomations();
    } catch {
      setError("Erro ao excluir automação.");
    }
  };

  const handleCreated = (automation: any) => {
    setShowCreateModal(false);
    if (automation?.id) {
      router.push(`/conversas/automacoes/${automation.id}`);
    } else {
      fetchAutomations();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Automações" breadcrumb={["Conversas", "Automações"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-900">Automações WhatsApp</h2>
            {!loading && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                {automations.length}
              </span>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            Nova Automação
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          /* Loading skeleton */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                    <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                  <div className="h-7 w-full bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : automations.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Zap size={32} className="text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              Nenhuma automação criada
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              Crie automações para enviar mensagens automáticas quando leads mudam de etapa, recebem tags ou são criados.
            </p>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Criar primeira automação
            </Button>
          </div>
        ) : (
          /* Automation grid — cadências primeiro, depois automações regulares */
          (() => {
            const cadences = automations.filter(
              (a) => (a.triggerConfig as any)?.isCadence === true
            );
            const regularAutomations = automations.filter(
              (a) => (a.triggerConfig as any)?.isCadence !== true
            );

            return (
              <div className="space-y-8">
                {/* Cadências */}
                {cadences.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wider">
                        Cadências de Follow-up
                      </h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        {cadences.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {cadences.map((automation) => (
                        <div key={automation.id} className="relative cursor-pointer" onClick={() => setViewEnrollments({ id: automation.id, name: automation.name })}>
                          {/* Badge Cadência sobreposto no canto superior esquerdo */}
                          <div className="absolute top-3 left-3 z-10 pointer-events-none">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                              Cadência
                            </span>
                          </div>
                          <div className="ring-2 ring-purple-200 rounded-xl">
                            <AutomationCard
                              automation={automation}
                              onActivate={handleActivate}
                              onPause={handlePause}
                              onDelete={handleDelete}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Separador se houver os dois grupos */}
                {cadences.length > 0 && regularAutomations.length > 0 && (
                  <div className="border-t border-gray-200" />
                )}

                {/* Automações regulares */}
                {regularAutomations.length > 0 && (
                  <div className="space-y-4">
                    {cadences.length > 0 && (
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                          Automações
                        </h3>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {regularAutomations.length}
                        </span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {regularAutomations.map((automation) => (
                        <div key={automation.id} onClick={() => setViewEnrollments({ id: automation.id, name: automation.name })} className="cursor-pointer">
                          <AutomationCard
                            automation={automation}
                            onActivate={handleActivate}
                            onPause={handlePause}
                            onDelete={handleDelete}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </main>

      {/* Create modal */}
      <AutomationCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {viewEnrollments && (
        <EnrollmentsPanel
          automationId={viewEnrollments.id}
          automationName={viewEnrollments.name}
          onClose={() => setViewEnrollments(null)}
        />
      )}
    </div>
  );
}
