"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Drawer from "@/components/ui/Drawer";
import {
  Phone,
  Mail,
  MessageCircle,
  MessageSquare,
  Building2,
  User as UserIcon,
  Circle,
  Clock,
  ExternalLink,
  Send,
  Package,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { openWhatsAppChat } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/formatters";
import { normalizeDueDate, formatTaskDate } from "@/lib/taskDateTime";

interface DealDetail {
  id: string;
  title: string;
  value: string | number | null;
  status: "OPEN" | "WON" | "LOST";
  pipelineId: string;
  stageId: string;
  stage: { id: string; name: string; color: string | null } | null;
  pipeline: { id: string; name: string } | null;
  user: { id: string; name: string } | null;
  closer: { id: string; name: string } | null;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  organization: { id: string; name: string } | null;
  products: Array<{
    quantity: number;
    unitPrice: string | number;
    recurrenceValue?: string | number | null;
    product: { name: string };
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    dueDateFormat?: string;
  }>;
  activities: Array<{
    id: string;
    type: string;
    content: string;
    createdAt: string;
    user: { name: string } | null;
  }>;
}

interface Stage {
  id: string;
  name: string;
  color: string | null;
}

interface DealDrawerProps {
  dealId: string;
  onClose: () => void;
  onOpenConversation: (args: { dealId: string; contactName: string; contactPhone: string }) => void;
  /** Chamado após qualquer mutação (concluir tarefa, mudar etapa) pra central atualizar */
  onChanged?: () => void;
}

const statusBadge: Record<DealDetail["status"], { label: string; cls: string }> = {
  OPEN: { label: "Em aberto", cls: "bg-blue-50 text-blue-700" },
  WON: { label: "Ganho", cls: "bg-green-50 text-green-700" },
  LOST: { label: "Perdido", cls: "bg-red-50 text-red-600" },
};

export default function DealDrawer({ dealId, onClose, onOpenConversation, onChanged }: DealDrawerProps) {
  const { user: authUser } = useAuth();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchDeal = useCallback(async () => {
    try {
      const res = await api.get<{ data: DealDetail }>(`/deals/${dealId}`);
      setDeal(res.data);
      if (res.data?.pipelineId) {
        const st = await api.get<{ data: Stage[] }>(
          `/pipeline-stages?pipelineId=${res.data.pipelineId}&limit=100`
        );
        setStages(st.data || []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const changeStage = async (stageId: string) => {
    if (!deal || stageId === deal.stageId) return;
    setChangingStage(true);
    try {
      await api.patch(`/deals/${deal.id}/stage`, { stageId });
      await fetchDeal();
      onChanged?.();
    } catch (err) {
      console.error("Erro ao mudar etapa:", err);
    } finally {
      setChangingStage(false);
    }
  };

  const completeTask = async (taskId: string) => {
    setTogglingTaskId(taskId);
    try {
      await api.put(`/tasks/${taskId}`, { status: "COMPLETED" });
      window.dispatchEvent(new Event("tasks-changed"));
      await fetchDeal();
      onChanged?.();
    } catch (err) {
      console.error("Erro ao concluir tarefa:", err);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const saveNote = async () => {
    const content = note.trim();
    if (!content || !deal || !authUser?.id || savingNote) return;
    setSavingNote(true);
    try {
      await api.post("/activities", {
        type: "NOTE",
        content,
        dealId: deal.id,
        contactId: deal.contact?.id,
        userId: authUser.id,
      });
      setNote("");
      await fetchDeal();
    } catch (err) {
      console.error("Erro ao salvar nota:", err);
    } finally {
      setSavingNote(false);
    }
  };

  const productsTotal = (deal?.products || []).reduce(
    (sum, p) => sum + Number(p.unitPrice) * p.quantity,
    0
  );
  const dealValue = deal?.value != null ? Number(deal.value) : productsTotal;

  const pendingTasks = (deal?.tasks || []).filter((t) => t.status === "PENDING");

  const fmtActivityDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Drawer
      title={loading ? "Carregando..." : deal?.title || "Negociação"}
      subtitle={
        deal
          ? [deal.organization?.name, deal.contact?.name].filter(Boolean).join(" · ") || undefined
          : undefined
      }
      onClose={onClose}
      footer={
        deal && (
          <Link
            href={`/pipeline/${deal.id}`}
            className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-petrol-700 hover:bg-petrol-50 transition-colors"
          >
            <ExternalLink size={15} />
            Abrir página completa
          </Link>
        )
      }
    >
      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !deal ? (
        <div className="p-10 text-center text-sm text-gray-500">Negociação não encontrada</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {/* Valor + status + etapa */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(dealValue)}</p>
                <p className="text-[11px] text-gray-400">
                  {deal.value != null ? "Valor da negociação" : "Soma dos produtos"}
                </p>
              </div>
              <span
                className={clsx(
                  "text-xs font-medium px-2.5 py-1 rounded-full",
                  statusBadge[deal.status]?.cls || "bg-gray-100 text-gray-600"
                )}
              >
                {statusBadge[deal.status]?.label || deal.status}
              </span>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Etapa {deal.pipeline ? `· ${deal.pipeline.name}` : ""}
              </label>
              <select
                value={deal.stageId}
                onChange={(e) => changeStage(e.target.value)}
                disabled={changingStage || deal.status !== "OPEN"}
                className="mt-1 w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-petrol-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {(deal.user || deal.closer) && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <UserIcon size={12} className="text-gray-400" />
                {deal.user?.name}
                {deal.closer && deal.closer.id !== deal.user?.id && ` · Closer: ${deal.closer.name}`}
              </p>
            )}
          </div>

          {/* Contato */}
          {deal.contact && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Contato
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deal.contact.name}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {deal.contact.phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone size={11} /> {deal.contact.phone}
                      </p>
                    )}
                    {deal.contact.email && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                        <Mail size={11} /> {deal.contact.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {deal.contact.phone && (
                    <button
                      onClick={() => openWhatsAppChat(deal.contact!.phone!)}
                      title="Abrir WhatsApp"
                      className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <MessageCircle size={17} />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      onOpenConversation({
                        dealId: deal.id,
                        contactName: deal.contact!.name,
                        contactPhone: deal.contact!.phone || "",
                      })
                    }
                    title="Abrir conversa (WABA)"
                    className="p-2 rounded-lg text-petrol-600 hover:bg-petrol-50 transition-colors"
                  >
                    <MessageSquare size={17} />
                  </button>
                  {deal.contact.email && (
                    <a
                      href={`mailto:${deal.contact.email}`}
                      title="Enviar e-mail"
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      <Mail size={17} />
                    </a>
                  )}
                </div>
              </div>
              {deal.organization && (
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                  <Building2 size={11} /> {deal.organization.name}
                </p>
              )}
            </div>
          )}

          {/* Produtos */}
          {deal.products.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Produtos
              </p>
              <div className="space-y-1.5">
                {deal.products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 flex items-center gap-1.5 min-w-0">
                      <Package size={12} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">
                        {p.product.name}
                        {p.quantity > 1 && ` ×${p.quantity}`}
                      </span>
                    </span>
                    <span className="text-gray-900 font-medium flex-shrink-0 ml-2">
                      {formatCurrency(Number(p.unitPrice) * p.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tarefas pendentes */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Tarefas pendentes ({pendingTasks.length})
            </p>
            {pendingTasks.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma tarefa pendente</p>
            ) : (
              <div className="space-y-2">
                {pendingTasks.map((t) => {
                  const due = normalizeDueDate(t);
                  const overdue = due ? due < new Date() : false;
                  return (
                    <div key={t.id} className="flex items-center gap-2">
                      <button
                        onClick={() => completeTask(t.id)}
                        disabled={togglingTaskId === t.id}
                        title="Concluir"
                        className="flex-shrink-0 text-gray-300 hover:text-green-600 transition-colors disabled:opacity-50"
                      >
                        {togglingTaskId === t.id ? (
                          <Clock size={16} className="animate-spin text-gray-400" />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                      <span className="text-sm text-gray-800 truncate flex-1">{t.title}</span>
                      {t.dueDate && (
                        <span
                          className={clsx(
                            "text-[11px] flex-shrink-0",
                            overdue ? "text-red-500 font-medium" : "text-gray-400"
                          )}
                        >
                          {formatTaskDate(t)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nota rápida */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Nota rápida
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveNote()}
                placeholder="Anotar algo sobre essa negociação..."
                className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-petrol-500"
              />
              <button
                onClick={saveNote}
                disabled={!note.trim() || savingNote}
                className="p-2 rounded-lg bg-petrol-600 text-white hover:bg-petrol-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Salvar nota"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          {/* Histórico recente */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Histórico recente
            </p>
            {deal.activities.length === 0 ? (
              <p className="text-xs text-gray-400">Sem atividades</p>
            ) : (
              <div className="space-y-2.5">
                {deal.activities.slice(0, 10).map((a) => (
                  <div key={a.id} className="text-xs">
                    <p className="text-gray-700 leading-snug">{a.content}</p>
                    <p className="text-gray-400 mt-0.5">
                      {fmtActivityDate(a.createdAt)}
                      {a.user?.name && ` · ${a.user.name}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
