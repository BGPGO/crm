"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  Plus,
  Loader2,
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  Eye,
  Send,
  CheckCircle2,
  BookOpen,
  XCircle,
  Users,
  Radio,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BroadcastStatus =
  | "WA_DRAFT"
  | "WA_SCHEDULED"
  | "WA_SENDING"
  | "WA_PAUSED"
  | "WA_COMPLETED";

interface BroadcastTemplate {
  id: string;
  name: string;
  body: string;
  category: string;
  status: string;
}

interface Broadcast {
  id: string;
  name: string;
  status: BroadcastStatus;
  template: BroadcastTemplate | null;
  segment: { id: string; name: string } | null;
  stage: { id: string; name: string } | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalContacts: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
}

interface BroadcastContact {
  id: string;
  phone: string;
  name?: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  error: string | null;
}

interface Template {
  id: string;
  name: string;
  body: string;
  category: string;
  status: string;
}

interface Segment {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={clsx("animate-spin text-gray-400", className)} />;
}

const statusConfig: Record<BroadcastStatus, { label: string; variant: "gray" | "blue" | "yellow" | "green" | "red" | "purple" | "orange" }> = {
  WA_DRAFT: { label: "Rascunho", variant: "gray" },
  WA_SCHEDULED: { label: "Agendado", variant: "blue" },
  WA_SENDING: { label: "Enviando", variant: "yellow" },
  WA_PAUSED: { label: "Pausado", variant: "orange" },
  WA_COMPLETED: { label: "Concluido", variant: "green" },
};

function StatusBadge({ status }: { status: BroadcastStatus }) {
  const cfg = statusConfig[status] ?? { label: status, variant: "gray" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function pct(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "---";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const p = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className={clsx("w-full bg-gray-100 rounded-full h-2", className)}>
      <div
        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Modal
// ---------------------------------------------------------------------------

function CreateBroadcastModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [audienceType, setAudienceType] = useState<"segment" | "stage">("segment");
  const [segmentId, setSegmentId] = useState("");
  const [stageId, setStageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(true);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingOpts(true);
    Promise.allSettled([
      api.get<{ data: Template[] }>("/whatsapp/cloud/templates?status=APPROVED"),
      api.get<{ data: Segment[] }>("/segments"),
      api.get<{ data: Stage[] }>("/pipeline-stages"),
    ]).then(([tplRes, segRes, stgRes]) => {
      if (tplRes.status === "fulfilled") setTemplates(tplRes.value.data);
      if (segRes.status === "fulfilled") setSegments(segRes.value.data);
      if (stgRes.status === "fulfilled") setStages(stgRes.value.data);
      setLoadingOpts(false);
    });
  }, [isOpen]);

  const reset = () => {
    setName("");
    setTemplateId("");
    setAudienceType("segment");
    setSegmentId("");
    setStageId("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Informe o nome do broadcast");
      return;
    }
    if (!templateId) {
      setError("Selecione um template");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { name: name.trim(), templateId };
      if (audienceType === "segment" && segmentId) body.segmentId = segmentId;
      if (audienceType === "stage" && stageId) body.stageId = stageId;
      await api.post("/wa/broadcasts", body);
      reset();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar broadcast";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Novo Broadcast" size="lg">
      <div className="space-y-4">
        {loadingOpts ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <Input
              label="Nome"
              placeholder="Ex: Campanha Janeiro"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <Select
              label="Template (aprovados)"
              placeholder="Selecione um template"
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            />

            {selectedTemplate && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Preview do template</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTemplate.body}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Audiencia</p>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="radio"
                    name="audienceType"
                    checked={audienceType === "segment"}
                    onChange={() => setAudienceType("segment")}
                    className="accent-blue-600"
                  />
                  <Users size={14} />
                  Segmento
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                  <input
                    type="radio"
                    name="audienceType"
                    checked={audienceType === "stage"}
                    onChange={() => setAudienceType("stage")}
                    className="accent-blue-600"
                  />
                  <Radio size={14} />
                  Etapa do Pipeline
                </label>
              </div>
              {audienceType === "segment" ? (
                <Select
                  placeholder="Selecione um segmento"
                  options={segments.map((s) => ({ value: s.id, label: s.name }))}
                  value={segmentId}
                  onChange={(e) => setSegmentId(e.target.value)}
                />
              ) : (
                <Select
                  placeholder="Selecione uma etapa"
                  options={stages.map((s) => ({ value: s.id, label: s.name }))}
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                />
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} loading={saving}>
                <Plus size={14} />
                Criar Broadcast
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail View
// ---------------------------------------------------------------------------

function BroadcastDetail({
  broadcastId,
  onBack,
  onRefresh,
}: {
  broadcastId: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [contacts, setContacts] = useState<BroadcastContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, cRes] = await Promise.allSettled([
        api.get<{ data: Broadcast }>(`/wa/broadcasts/${broadcastId}`),
        api.get<{ data: BroadcastContact[] }>(`/wa/broadcasts/${broadcastId}/contacts`),
      ]);
      if (bRes.status === "fulfilled") setBroadcast(bRes.value.data);
      if (cRes.status === "fulfilled") setContacts(cRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [broadcastId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAction = async (action: "start" | "pause") => {
    setActionLoading(true);
    try {
      await api.post(`/wa/broadcasts/${broadcastId}/${action}`, {});
      await fetchDetail();
      onRefresh();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!broadcast) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} />
          Voltar
        </Button>
        <p className="text-sm text-gray-500 mt-4">Broadcast nao encontrado.</p>
      </div>
    );
  }

  const { totalContacts, sentCount, deliveredCount, readCount, failedCount } = broadcast;

  const statCards = [
    { label: "Total", value: totalContacts, icon: Users, color: "bg-blue-50 text-blue-600" },
    { label: "Enviados", value: sentCount, icon: Send, color: "bg-yellow-50 text-yellow-600" },
    { label: "Entregues", value: deliveredCount, pct: pct(deliveredCount, sentCount), icon: CheckCircle2, color: "bg-green-50 text-green-600" },
    { label: "Lidos", value: readCount, pct: pct(readCount, sentCount), icon: BookOpen, color: "bg-purple-50 text-purple-600" },
    { label: "Falhas", value: failedCount, pct: pct(failedCount, totalContacts), icon: XCircle, color: "bg-red-50 text-red-600" },
  ];

  const contactStatusVariant = (s: string) => {
    switch (s) {
      case "sent": return "yellow" as const;
      case "delivered": return "green" as const;
      case "read": return "purple" as const;
      case "failed": return "red" as const;
      default: return "gray" as const;
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto flex-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={14} />
            Voltar
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{broadcast.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={broadcast.status} />
              {broadcast.template && (
                <span className="text-xs text-gray-500">Template: {broadcast.template.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {broadcast.status === "WA_DRAFT" && (
            <Button size="sm" onClick={() => handleAction("start")} loading={actionLoading}>
              <Play size={14} />
              Iniciar Envio
            </Button>
          )}
          {broadcast.status === "WA_SENDING" && (
            <Button size="sm" variant="secondary" onClick={() => handleAction("pause")} loading={actionLoading}>
              <Pause size={14} />
              Pausar
            </Button>
          )}
          {broadcast.status === "WA_PAUSED" && (
            <Button size="sm" onClick={() => handleAction("start")} loading={actionLoading}>
              <Play size={14} />
              Retomar
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} padding="sm">
            <div className="flex items-center gap-3">
              <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center", s.color)}>
                <s.icon size={18} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-lg font-bold text-gray-900">
                  {s.value}
                  {"pct" in s && s.pct && (
                    <span className="text-xs font-normal text-gray-400 ml-1">{s.pct}</span>
                  )}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <Card padding="sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">Progresso de envio</p>
          <p className="text-sm text-gray-500">
            {sentCount}/{totalContacts} ({pct(sentCount, totalContacts)})
          </p>
        </div>
        <ProgressBar value={sentCount} max={totalContacts} />
      </Card>

      {/* Contacts Table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Contatos ({contacts.length})</h3>
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum contato vinculado.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Telefone</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Enviado</TableHeader>
                <TableHeader>Entregue</TableHeader>
                <TableHeader>Lido</TableHeader>
                <TableHeader>Erro</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                  <TableCell>
                    <Badge variant={contactStatusVariant(c.status)}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(c.sentAt)}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.deliveredAt)}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.readAt)}</TableCell>
                  <TableCell className="text-xs text-red-500">{c.error ?? "---"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page — List View
// ---------------------------------------------------------------------------

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchBroadcasts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Broadcast[] }>("/wa/broadcasts");
      setBroadcasts(res.data);
    } catch {
      setError("Erro ao carregar broadcasts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este broadcast?")) return;
    setDeleting(id);
    try {
      await api.delete(`/wa/broadcasts/${id}`);
      fetchBroadcasts();
    } finally {
      setDeleting(null);
    }
  };

  const handleStart = async (id: string) => {
    await api.post(`/wa/broadcasts/${id}/start`, {});
    fetchBroadcasts();
  };

  const handlePause = async (id: string) => {
    await api.post(`/wa/broadcasts/${id}/pause`, {});
    fetchBroadcasts();
  };

  // Detail view
  if (selectedId) {
    return (
      <BroadcastDetail
        broadcastId={selectedId}
        onBack={() => setSelectedId(null)}
        onRefresh={fetchBroadcasts}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto flex-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Broadcasts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Envie mensagens em massa via WhatsApp Cloud API
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Novo Broadcast
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Card padding="lg">
          <div className="text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={fetchBroadcasts}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      ) : broadcasts.length === 0 ? (
        <Card padding="lg">
          <div className="text-center py-8">
            <Send size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-700">Nenhum broadcast criado</p>
            <p className="text-xs text-gray-500 mt-1">
              Crie seu primeiro broadcast para enviar mensagens em massa.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus size={14} />
              Criar Broadcast
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {broadcasts.map((b) => {
            const deliveryRate = pct(b.deliveredCount, b.sentCount);
            const readRate = pct(b.readCount, b.sentCount);
            return (
              <Card key={b.id} padding="none">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {b.name}
                        </h3>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {b.template && <span>Template: {b.template.name}</span>}
                        {b.segment && <span>Segmento: {b.segment.name}</span>}
                        {b.stage && <span>Etapa: {b.stage.name}</span>}
                        <span>{formatDate(b.startedAt || b.createdAt)}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-gray-600 flex-shrink-0">
                      <div className="text-center">
                        <p className="font-semibold text-gray-900">{b.sentCount}/{b.totalContacts}</p>
                        <p>Enviados</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-green-600">{deliveryRate}</p>
                        <p>Entrega</p>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-purple-600">{readRate}</p>
                        <p>Leitura</p>
                      </div>
                      {b.failedCount > 0 && (
                        <div className="text-center">
                          <p className="font-semibold text-red-600">{b.failedCount}</p>
                          <p>Falhas</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(b.id)}>
                        <Eye size={14} />
                      </Button>
                      {b.status === "WA_DRAFT" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStart(b.id)}>
                          <Play size={14} className="text-green-600" />
                        </Button>
                      )}
                      {b.status === "WA_SENDING" && (
                        <Button variant="ghost" size="sm" onClick={() => handlePause(b.id)}>
                          <Pause size={14} className="text-yellow-600" />
                        </Button>
                      )}
                      {b.status === "WA_PAUSED" && (
                        <Button variant="ghost" size="sm" onClick={() => handleStart(b.id)}>
                          <Play size={14} className="text-green-600" />
                        </Button>
                      )}
                      {(b.status === "WA_DRAFT" || b.status === "WA_COMPLETED") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(b.id)}
                          disabled={deleting === b.id}
                        >
                          {deleting === b.id ? (
                            <Spinner />
                          ) : (
                            <Trash2 size={14} className="text-red-500" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {b.totalContacts > 0 && (
                    <div className="mt-3">
                      <ProgressBar value={b.sentCount} max={b.totalContacts} />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateBroadcastModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchBroadcasts}
      />
    </div>
  );
}
