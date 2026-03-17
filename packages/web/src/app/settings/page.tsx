"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
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
  Tag,
  Copy,
  Check,
  Pencil,
  Trash2,
  Plus,
  X,
  Loader2,
  Bell,
  Mail,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import TagBadge from "@/components/marketing/TagBadge";

type TabKey =
  | "profile"
  | "team"
  | "pipeline"
  | "custom-fields"
  | "lost-reasons"
  | "sources"
  | "tags"
  | "webhooks"
  | "products"
  | "notifications";

const tabs: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "profile",       label: "Perfil",                  icon: User },
  { key: "team",          label: "Equipe",                  icon: Users },
  { key: "pipeline",      label: "Pipeline",                icon: Kanban },
  { key: "custom-fields", label: "Campos Personalizados",   icon: Sliders },
  { key: "lost-reasons",  label: "Motivos de Perda",        icon: XCircle },
  { key: "sources",       label: "Fontes",                  icon: Radio },
  { key: "tags",          label: "Tags",                    icon: Tag },
  { key: "webhooks",      label: "Webhooks",                icon: Globe },
  { key: "products",      label: "Produtos",                icon: Package },
  { key: "notifications", label: "Notificações",            icon: Bell },
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function Spinner() {
  return <Loader2 size={16} className="animate-spin text-gray-400" />;
}

function FeedbackMsg({ msg }: { msg: { type: "success" | "error"; text: string } | null }) {
  if (!msg) return null;
  return (
    <span className={clsx("text-xs", msg.type === "success" ? "text-green-600" : "text-red-600")}>
      {msg.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProfileTab
// ---------------------------------------------------------------------------
type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  team?: { id: string; name: string } | null;
};

function ProfileTab() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.get<ApiUser>("/auth/me")
      .then((u) => {
        // API may return { data: user } or user directly
        const userData = (u as unknown as { data: ApiUser }).data ?? u;
        setUser(userData);
        setName(userData.name);
        setEmail(userData.email);
        setPhone(userData.phone ?? "");
      })
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar perfil." }))
      .finally(() => setLoading(false));
  }, [authUser]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.put(`/users/${user.id}`, { name, email, phone: phone || undefined });
      setFeedback({ type: "success", text: "Alterações salvas." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange() {
    setPwFeedback(null);
    if (!newPassword) {
      setPwFeedback({ type: "error", text: "Informe a nova senha." });
      return;
    }
    if (newPassword.length < 6) {
      setPwFeedback({ type: "error", text: "A senha deve ter pelo menos 6 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwFeedback({ type: "error", text: "As senhas não coincidem." });
      return;
    }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPwFeedback({ type: "success", text: "Senha alterada com sucesso." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao alterar senha.";
      setPwFeedback({ type: "error", text: msg });
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </Card>
    );
  }

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrador",
    MANAGER: "Gestor",
    SELLER: "Vendedor",
  };

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Informações Pessoais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Telefone"
            type="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Perfil</label>
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
              {roleLabel[user?.role ?? ""] ?? user?.role ?? "—"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <FeedbackMsg msg={feedback} />
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Salvar alterações
          </Button>
        </div>
      </Card>

      <Card padding="lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Alterar Senha</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <Input
            label="Senha atual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <div />
          <Input
            label="Nova senha"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          <FeedbackMsg msg={pwFeedback} />
          <Button variant="primary" onClick={handlePasswordChange} disabled={pwSaving}>
            {pwSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Atualizar senha
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamTab
// ---------------------------------------------------------------------------
type RoleKey = "ADMIN" | "MANAGER" | "SELLER";

const roleBadge: Record<RoleKey, "blue" | "purple" | "green"> = {
  ADMIN: "blue",
  MANAGER: "purple",
  SELLER: "green",
};

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  MANAGER: "Gestor",
  SELLER: "Vendedor",
};

function TeamTab() {
  const [members, setMembers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleKey>("SELLER");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<ApiUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<RoleKey>("SELLER");
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadMembers = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiUser[] }>("/users")
      .then((res) => setMembers(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar equipe." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  function openEdit(u: ApiUser) {
    setEditUser(u);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPhone(u.phone ?? "");
    setEditRole((u.role as RoleKey) || "SELLER");
    setEditFeedback(null);
    setEditOpen(true);
  }

  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteFeedback({ type: "error", text: "Nome e e-mail são obrigatórios." });
      return;
    }
    setInviteSaving(true);
    setInviteFeedback(null);
    try {
      await api.post("/users", { name: inviteName, email: inviteEmail, role: inviteRole });
      setInviteOpen(false);
      setInviteName(""); setInviteEmail(""); setInviteRole("SELLER");
      loadMembers();
      setFeedback({ type: "success", text: "Membro convidado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao convidar.";
      setInviteFeedback({ type: "error", text: msg });
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editUser) return;
    setEditSaving(true);
    setEditFeedback(null);
    try {
      await api.put(`/users/${editUser.id}`, {
        name: editName,
        email: editEmail,
        phone: editPhone || undefined,
        role: editRole,
      });
      setEditOpen(false);
      loadMembers();
      setFeedback({ type: "success", text: "Membro atualizado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setEditFeedback({ type: "error", text: msg });
    } finally {
      setEditSaving(false);
    }
  }

  const roleOptions = [
    { value: "ADMIN", label: "Admin" },
    { value: "MANAGER", label: "Gestor" },
    { value: "SELLER", label: "Vendedor" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            {loading ? "Carregando..." : `${members.length} membros na equipe`}
          </p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setInviteFeedback(null); setInviteOpen(true); }}>
          Convidar membro
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="px-5 py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && members.map((m) => (
            <div key={m.id} className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={roleBadge[(m.role as RoleKey)] ?? "gray"}>
                  {roleLabel[m.role] ?? m.role}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>Editar</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Invite Modal */}
      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Convidar membro">
        <div className="space-y-4">
          <Input label="Nome completo" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          <Input label="E-mail" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <Select
            label="Perfil"
            options={roleOptions}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as RoleKey)}
          />
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={inviteFeedback} />
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleInvite} disabled={inviteSaving}>
              {inviteSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Convidar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar membro">
        <div className="space-y-4">
          <Input label="Nome completo" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input label="E-mail" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          <Input label="Telefone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
          <Select
            label="Perfil"
            options={roleOptions}
            value={editRole}
            onChange={(e) => setEditRole(e.target.value as RoleKey)}
          />
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={editFeedback} />
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineTab
// ---------------------------------------------------------------------------
type ApiStage = {
  id: string;
  name: string;
  order: number;
  color: string;
  _count?: { deals: number };
};

type ApiPipeline = {
  id: string;
  name: string;
};

const PRESET_COLORS = [
  "#3B82F6", "#06B6D4", "#8B5CF6", "#F59E0B",
  "#F97316", "#EF4444", "#EC4899", "#22C55E",
  "#6366F1", "#14B8A6", "#84CC16", "#F43F5E",
];

function PipelineTab() {
  const [stages, setStages] = useState<ApiStage[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState("#3B82F6");
  const [addSaving, setAddSaving] = useState(false);
  const [addFeedback, setAddFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editStage, setEditStage] = useState<ApiStage | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadStages = useCallback(async (pid: string) => {
    try {
      const res = await api.get<{ data: ApiStage[] }>(`/pipeline-stages?pipelineId=${pid}`);
      setStages(res.data.sort((a, b) => a.order - b.order));
    } catch {
      setFeedback({ type: "error", text: "Erro ao carregar etapas." });
    }
  }, []);

  useEffect(() => {
    api.get<{ data: ApiPipeline[] }>("/pipelines")
      .then((res) => {
        const pid = res.data[0]?.id;
        if (pid) {
          setPipelineId(pid);
          return loadStages(pid);
        }
      })
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar pipeline." }))
      .finally(() => setLoading(false));
  }, [loadStages]);

  function openEdit(s: ApiStage) {
    setEditStage(s);
    setEditName(s.name);
    setEditColor(s.color || "#3B82F6");
    setEditFeedback(null);
    setEditOpen(true);
  }

  async function handleAdd() {
    if (!addName.trim() || !pipelineId) {
      setAddFeedback({ type: "error", text: "Nome é obrigatório." });
      return;
    }
    setAddSaving(true);
    setAddFeedback(null);
    try {
      await api.post("/pipeline-stages", {
        name: addName,
        pipelineId,
        color: addColor,
        order: stages.length + 1,
      });
      setAddOpen(false);
      setAddName(""); setAddColor("#3B82F6");
      await loadStages(pipelineId);
      setFeedback({ type: "success", text: "Etapa adicionada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setAddFeedback({ type: "error", text: msg });
    } finally {
      setAddSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editStage) return;
    setEditSaving(true);
    setEditFeedback(null);
    try {
      await api.put(`/pipeline-stages/${editStage.id}`, { name: editName, color: editColor });
      setEditOpen(false);
      if (pipelineId) await loadStages(pipelineId);
      setFeedback({ type: "success", text: "Etapa atualizada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setEditFeedback({ type: "error", text: msg });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId || !pipelineId) return;
    setDeleteSaving(true);
    try {
      await api.delete(`/pipeline-stages/${deleteId}`);
      setDeleteId(null);
      await loadStages(pipelineId);
      setFeedback({ type: "success", text: "Etapa removida." });
    } catch (err) {
      setDeleteId(null);
      const msg = err instanceof ApiError && err.status === 409
        ? "Esta etapa possui negociações ativas e não pode ser removida."
        : err instanceof ApiError ? err.message : "Erro ao remover.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setDeleteSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">Etapas do funil de vendas</p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="secondary" size="sm" onClick={() => { setAddFeedback(null); setAddOpen(true); }}>
          Adicionar etapa
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="px-5 py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && stages.map((stage) => (
            <div key={stage.id} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stage.color || "#ccc" }}
                />
                <span className="text-xs text-gray-400 font-mono w-4">{stage.order}</span>
                <p className="text-sm font-medium text-gray-900">{stage.name}</p>
                {stage._count && stage._count.deals > 0 && (
                  <span className="text-xs text-gray-400">({stage._count.deals} negoc.)</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(stage)}>
                  <Pencil size={13} className="mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-600"
                  onClick={() => setDeleteId(stage.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Add Modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Adicionar etapa">
        <div className="space-y-4">
          <Input label="Nome da etapa" value={addName} onChange={(e) => setAddName(e.target.value)} autoFocus />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAddColor(c)}
                  className={clsx(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    addColor === c ? "border-gray-700 scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={addFeedback} />
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleAdd} disabled={addSaving}>
              {addSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar etapa">
        <div className="space-y-4">
          <Input label="Nome da etapa" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={clsx(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    editColor === c ? "border-gray-700 scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={editFeedback} />
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Confirmar exclusão" size="sm">
        <p className="text-sm text-gray-600 mb-6">
          Tem certeza que deseja remover esta etapa? A operação não pode ser desfeita.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700 border-red-600"
            onClick={handleDelete}
            disabled={deleteSaving}
          >
            {deleteSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Remover
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Fields Tab
// ---------------------------------------------------------------------------
type ApiCustomField = {
  id: string;
  name: string;
  fieldType: string;
  entity: string;
};

const fieldTypeBadge: Record<string, "blue" | "purple" | "gray" | "green"> = {
  TEXT: "gray",
  NUMBER: "blue",
  DATE: "purple",
  BOOLEAN: "green",
  SELECT: "purple",
};

const entityBadge: Record<string, "blue" | "green" | "orange"> = {
  DEAL: "blue",
  CONTACT: "green",
  COMPANY: "orange",
};

function CustomFieldsTab() {
  const [fields, setFields] = useState<ApiCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("TEXT");
  const [addEntity, setAddEntity] = useState("DEAL");
  const [addSaving, setAddSaving] = useState(false);
  const [addFeedback, setAddFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadFields = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiCustomField[] }>("/custom-fields")
      .then((res) => setFields(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar campos." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFields(); }, [loadFields]);

  async function handleAdd() {
    if (!addName.trim()) {
      setAddFeedback({ type: "error", text: "Nome é obrigatório." });
      return;
    }
    setAddSaving(true);
    setAddFeedback(null);
    try {
      await api.post("/custom-fields", { name: addName, fieldType: addType, entity: addEntity });
      setAddOpen(false);
      setAddName(""); setAddType("TEXT"); setAddEntity("DEAL");
      loadFields();
      setFeedback({ type: "success", text: "Campo adicionado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setAddFeedback({ type: "error", text: msg });
    } finally {
      setAddSaving(false);
    }
  }

  const fieldTypeOptions = [
    { value: "TEXT", label: "Texto" },
    { value: "NUMBER", label: "Número" },
    { value: "DATE", label: "Data" },
    { value: "BOOLEAN", label: "Sim/Não" },
    { value: "SELECT", label: "Seleção" },
  ];

  const entityOptions = [
    { value: "DEAL", label: "Negociação" },
    { value: "CONTACT", label: "Contato" },
    { value: "COMPANY", label: "Empresa" },
  ];

  const entityLabel: Record<string, string> = { DEAL: "Negociação", CONTACT: "Contato", COMPANY: "Empresa" };
  const fieldTypeLabel: Record<string, string> = {
    TEXT: "Texto", NUMBER: "Número", DATE: "Data", BOOLEAN: "Sim/Não", SELECT: "Seleção",
  };

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </Card>
    );
  }

  if (!loading && fields.length === 0 && !feedback) {
    return (
      <Card padding="lg">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sliders size={36} className="text-gray-300 mb-3" />
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Campos Personalizados</h3>
          <p className="text-xs text-gray-400 max-w-xs mb-4">
            Adicione campos livres às negociações, contatos e empresas.
          </p>
          <Button variant="primary" size="sm" onClick={() => { setAddFeedback(null); setAddOpen(true); }}>
            <Plus size={14} className="mr-1" />
            Adicionar campo
          </Button>
        </div>

        <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Adicionar campo">
          <div className="space-y-4">
            <Input label="Nome do campo" value={addName} onChange={(e) => setAddName(e.target.value)} autoFocus />
            <Select label="Tipo" options={fieldTypeOptions} value={addType} onChange={(e) => setAddType(e.target.value)} />
            <Select label="Entidade" options={entityOptions} value={addEntity} onChange={(e) => setAddEntity(e.target.value)} />
            <div className="flex items-center justify-end gap-3 pt-2">
              <FeedbackMsg msg={addFeedback} />
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={handleAdd} disabled={addSaving}>
                {addSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Adicionar
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">{fields.length} campos cadastrados</p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setAddFeedback(null); setAddOpen(true); }}>
          <Plus size={14} className="mr-1" />
          Adicionar campo
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {fields.map((f) => (
            <div key={f.id} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sliders size={14} className="text-gray-400 flex-shrink-0" />
                <p className="text-sm font-medium text-gray-900">{f.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={entityBadge[f.entity] ?? "gray"}>
                  {entityLabel[f.entity] ?? f.entity}
                </Badge>
                <Badge variant={fieldTypeBadge[f.fieldType] ?? "gray"}>
                  {fieldTypeLabel[f.fieldType] ?? f.fieldType}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Adicionar campo">
        <div className="space-y-4">
          <Input label="Nome do campo" value={addName} onChange={(e) => setAddName(e.target.value)} autoFocus />
          <Select label="Tipo" options={fieldTypeOptions} value={addType} onChange={(e) => setAddType(e.target.value)} />
          <Select label="Entidade" options={entityOptions} value={addEntity} onChange={(e) => setAddEntity(e.target.value)} />
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={addFeedback} />
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleAdd} disabled={addSaving}>
              {addSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LostReasonsTab
// ---------------------------------------------------------------------------
type ApiLostReason = {
  id: string;
  name: string;
  _count?: { deals: number };
};

function LostReasonsTab() {
  const [reasons, setReasons] = useState<ApiLostReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const loadReasons = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiLostReason[] }>("/lost-reasons")
      .then((res) => setReasons(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar motivos." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReasons(); }, [loadReasons]);

  async function handleAdd() {
    if (!newValue.trim()) return;
    setSavingNew(true);
    setFeedback(null);
    try {
      await api.post("/lost-reasons", { name: newValue.trim() });
      setNewValue("");
      setAdding(false);
      loadReasons();
      setFeedback({ type: "success", text: "Motivo adicionado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingNew(false);
    }
  }

  async function handleRemove(id: string, dealCount: number) {
    if (dealCount > 0) {
      setFeedback({ type: "error", text: "Este motivo está em uso e não pode ser removido." });
      return;
    }
    setFeedback(null);
    try {
      await api.delete(`/lost-reasons/${id}`);
      loadReasons();
      setFeedback({ type: "success", text: "Motivo removido." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao remover.";
      setFeedback({ type: "error", text: msg });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            {loading ? "Carregando..." : `${reasons.length} motivos cadastrados`}
          </p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setAdding(true); setFeedback(null); }}>
          <Plus size={14} className="mr-1" />
          Adicionar motivo
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="px-5 py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && reasons.map((reason) => (
            <div key={reason.id} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-sm text-gray-800">{reason.name}</p>
                {reason._count && reason._count.deals > 0 && (
                  <span className="text-xs text-gray-400">({reason._count.deals} negoc.)</span>
                )}
              </div>
              <button
                onClick={() => handleRemove(reason.id, reason._count?.deals ?? 0)}
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
              <Button size="sm" variant="primary" onClick={handleAdd} disabled={savingNew}>
                {savingNew ? <Loader2 size={13} className="animate-spin" /> : "Salvar"}
              </Button>
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
type ApiSource = {
  id: string;
  name: string;
  _count?: { contacts: number; deals: number };
};

function SourcesTab() {
  const [sources, setSources] = useState<ApiSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [savingNew, setSavingNew] = useState(false);

  const loadSources = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiSource[] }>("/sources")
      .then((res) => setSources(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar fontes." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  async function handleAdd() {
    if (!newValue.trim()) return;
    setSavingNew(true);
    setFeedback(null);
    try {
      await api.post("/sources", { name: newValue.trim() });
      setNewValue("");
      setAdding(false);
      loadSources();
      setFeedback({ type: "success", text: "Fonte adicionada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingNew(false);
    }
  }

  async function handleRemove(id: string, useCount: number) {
    if (useCount > 0) {
      setFeedback({ type: "error", text: "Esta fonte está em uso e não pode ser removida." });
      return;
    }
    setFeedback(null);
    try {
      await api.delete(`/sources/${id}`);
      loadSources();
      setFeedback({ type: "success", text: "Fonte removida." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao remover.";
      setFeedback({ type: "error", text: msg });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            {loading ? "Carregando..." : `${sources.length} fontes cadastradas`}
          </p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setAdding(true); setFeedback(null); }}>
          <Plus size={14} className="mr-1" />
          Adicionar fonte
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="px-5 py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && sources.map((source) => {
            const useCount = (source._count?.contacts ?? 0) + (source._count?.deals ?? 0);
            return (
              <div key={source.id} className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Radio size={14} className="text-blue-400 flex-shrink-0" />
                  <p className="text-sm text-gray-800">{source.name}</p>
                  {useCount > 0 && (
                    <span className="text-xs text-gray-400">({useCount} uso{useCount !== 1 ? "s" : ""})</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(source.id, useCount)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                  title="Remover"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}

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
              <Button size="sm" variant="primary" onClick={handleAdd} disabled={savingNew}>
                {savingNew ? <Loader2 size={13} className="animate-spin" /> : "Salvar"}
              </Button>
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
// TagsTab
// ---------------------------------------------------------------------------
type ApiTag = {
  id: string;
  name: string;
  color: string;
  _count?: { contacts: number };
};

function TagsTab() {
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Inline add form
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [savingNew, setSavingNew] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTag, setEditTag] = useState<ApiTag | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Delete confirm modal
  const [deleteTag, setDeleteTag] = useState<ApiTag | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadTags = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiTag[] }>("/tags?limit=100")
      .then((res) => setTags(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar tags." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);

  function openEdit(t: ApiTag) {
    setEditTag(t);
    setEditName(t.name);
    setEditColor(t.color || "#3B82F6");
    setEditFeedback(null);
    setEditOpen(true);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setSavingNew(true);
    setFeedback(null);
    try {
      await api.post("/tags", { name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor("#3B82F6");
      setAdding(false);
      loadTags();
      setFeedback({ type: "success", text: "Tag adicionada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setSavingNew(false);
    }
  }

  async function handleEditSave() {
    if (!editTag) return;
    setEditSaving(true);
    setEditFeedback(null);
    try {
      await api.put(`/tags/${editTag.id}`, { name: editName, color: editColor });
      setEditOpen(false);
      loadTags();
      setFeedback({ type: "success", text: "Tag atualizada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setEditFeedback({ type: "error", text: msg });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTag) return;
    setDeleteSaving(true);
    try {
      await api.delete(`/tags/${deleteTag.id}`);
      setDeleteTag(null);
      loadTags();
      setFeedback({ type: "success", text: "Tag removida." });
    } catch (err) {
      setDeleteTag(null);
      const msg = err instanceof ApiError ? err.message : "Erro ao remover.";
      setFeedback({ type: "error", text: msg });
    } finally {
      setDeleteSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            {loading ? "Carregando..." : `${tags.length} tags cadastradas`}
          </p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setAdding(true); setFeedback(null); }}>
          <Plus size={14} className="mr-1" />
          Nova Tag
        </Button>
      </div>

      <Card padding="none">
        <div className="divide-y divide-gray-100">
          {loading && (
            <div className="px-5 py-6 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && tags.map((tag) => (
            <div key={tag.id} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TagBadge name={tag.name} color={tag.color} />
                {tag._count && tag._count.contacts > 0 && (
                  <span className="text-xs text-gray-400">
                    ({tag._count.contacts} contato{tag._count.contacts !== 1 ? "s" : ""})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(tag)}>
                  <Pencil size={13} className="mr-1" />
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-600"
                  onClick={() => setDeleteTag(tag)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}

          {adding && (
            <div className="px-5 py-4 space-y-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                    if (e.key === "Escape") { setAdding(false); setNewName(""); setNewColor("#3B82F6"); }
                  }}
                  placeholder="Nome da tag..."
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {newName && (
                  <TagBadge name={newName} color={newColor} />
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={clsx(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      newColor === c ? "border-gray-700 scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={handleAdd} disabled={savingNew}>
                  {savingNew ? <Loader2 size={13} className="animate-spin" /> : "Salvar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewColor("#3B82F6"); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar tag">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              label="Nome da tag"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            {editName && (
              <div className="pt-5 flex-shrink-0">
                <TagBadge name={editName} color={editColor} />
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Cor</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={clsx(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    editColor === c ? "border-gray-700 scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={editFeedback} />
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal isOpen={!!deleteTag} onClose={() => setDeleteTag(null)} title="Remover tag" size="sm">
        <p className="text-sm text-gray-600 mb-2">
          Tem certeza que deseja remover a tag{" "}
          {deleteTag && <TagBadge name={deleteTag.name} color={deleteTag.color} />}?
        </p>
        {deleteTag?._count && deleteTag._count.contacts > 0 && (
          <p className="text-xs text-amber-600 mb-4">
            Esta tag está associada a {deleteTag._count.contacts} contato{deleteTag._count.contacts !== 1 ? "s" : ""} e será desvinculada.
          </p>
        )}
        <div className="flex items-center justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={() => setDeleteTag(null)}>Cancelar</Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700 border-red-600"
            onClick={handleDelete}
            disabled={deleteSaving}
          >
            {deleteSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            Remover
          </Button>
        </div>
      </Modal>
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
type ApiWebhook = {
  id: string;
  name: string;
  url: string;
  type: "INCOMING" | "OUTGOING";
  isActive: boolean;
  events?: string[];
  secret?: string | null;
};

const AVAILABLE_EVENTS = [
  "deal.created", "deal.updated", "deal.won", "deal.lost",
  "contact.created", "contact.updated",
];

function WebhooksTab() {
  const [incoming, setIncoming] = useState<ApiWebhook[]>([]);
  const [outgoing, setOutgoing] = useState<ApiWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Detail panel
  const [selectedWh, setSelectedWh] = useState<ApiWebhook | null>(null);
  const [whLogs, setWhLogs] = useState<Array<{ id: string; type: string; content: string; createdAt: string; metadata: any }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // New webhook modal
  const [newOpen, setNewOpen] = useState(false);
  const [newType, setNewType] = useState<"INCOMING" | "OUTGOING">("INCOMING");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [newSecret, setNewSecret] = useState("");
  const [newSaving, setNewSaving] = useState(false);
  const [newFeedback, setNewFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        api.get<{ data: ApiWebhook[] }>("/webhook-configs?type=INCOMING"),
        api.get<{ data: ApiWebhook[] }>("/webhook-configs?type=OUTGOING"),
      ]);
      setIncoming(inc.data);
      setOutgoing(out.data);
    } catch {
      setFeedback({ type: "error", text: "Erro ao carregar webhooks." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);

  function openNew(type: "INCOMING" | "OUTGOING") {
    setNewType(type);
    setNewName(""); setNewUrl(""); setNewEvents([]); setNewSecret("");
    setNewFeedback(null);
    setNewOpen(true);
  }

  async function handleNew() {
    if (!newName.trim() || !newUrl.trim()) {
      setNewFeedback({ type: "error", text: "Nome e URL são obrigatórios." });
      return;
    }
    setNewSaving(true);
    setNewFeedback(null);
    try {
      await api.post("/webhook-configs", {
        name: newName,
        url: newUrl,
        type: newType,
        events: newEvents,
        secret: newSecret || undefined,
      });
      setNewOpen(false);
      loadWebhooks();
      setFeedback({ type: "success", text: "Webhook criado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao criar.";
      setNewFeedback({ type: "error", text: msg });
    } finally {
      setNewSaving(false);
    }
  }

  async function handleToggle(wh: ApiWebhook) {
    try {
      await api.put(`/webhook-configs/${wh.id}`, { isActive: !wh.isActive });
      loadWebhooks();
    } catch {
      setFeedback({ type: "error", text: "Erro ao atualizar status." });
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/webhook-configs/${id}`);
      loadWebhooks();
      setFeedback({ type: "success", text: "Webhook removido." });
    } catch {
      setFeedback({ type: "error", text: "Erro ao remover webhook." });
    }
  }

  async function openDetails(wh: ApiWebhook) {
    setSelectedWh(wh);
    setWhLogs([]);
    setLogsLoading(true);
    try {
      const res = await api.get<{ data: Array<{ id: string; type: string; content: string; createdAt: string; metadata: any }> }>(`/activities?limit=100&type=WEBHOOK_RECEIVED`);
      const all = res.data || [];
      const nameLower = wh.name.toLowerCase();
      const filtered = all.filter(log => {
        // Match by webhookConfigId in metadata (new format)
        if (log.metadata?.webhookConfigId === wh.id) return true;
        if (log.metadata?.webhookName === wh.name) return true;
        // Match by name in content
        if (log.content?.toLowerCase().includes(nameLower)) return true;
        // Match Landing Pages by "greatpages" source or "GreatPages" in content
        if (nameLower.includes("landing") && (log.metadata?.source === "greatpages" || log.content?.includes("GreatPages"))) return true;
        // Match Autentique by name
        if (nameLower.includes("autentique") && (log.metadata?.source === "contract-signed" || log.content?.toLowerCase().includes("autentique"))) return true;
        return false;
      });
      setWhLogs(filtered.slice(0, 20));
    } catch {
      setWhLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }

  function toggleEvent(evt: string) {
    setNewEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="flex justify-end">
          <FeedbackMsg msg={feedback} />
        </div>
      )}

      {/* Webhooks de Entrada */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Webhooks de Entrada</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Receba leads automaticamente via formulários externos
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => openNew("INCOMING")}>
            <Plus size={14} className="mr-1" />
            Novo webhook de entrada
          </Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
          Configure o URL gerado na sua landing page (GreatPages, etc.) para receber leads automaticamente no CRM.
        </div>

        <Card padding="none">
          <div className="divide-y divide-gray-100">
            {loading && (
              <div className="px-5 py-6 flex justify-center">
                <Spinner />
              </div>
            )}
            {!loading && incoming.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">
                Nenhum webhook de entrada configurado.
              </p>
            )}
            {!loading && incoming.map((wh) => (
              <div key={wh.id} className="px-5 py-4 space-y-2 hover:bg-gray-50/50 cursor-pointer transition-colors" onClick={() => openDetails(wh)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{wh.name}</span>
                    <Badge variant={wh.isActive ? "green" : "gray"}>
                      {wh.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Toggle enabled={wh.isActive} onChange={() => handleToggle(wh)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(wh.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 font-mono flex-1 truncate">{wh.url}</span>
                  <CopyButton value={wh.url} />
                </div>
                {wh.events && wh.events.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">Eventos:</span>
                    {(wh.events as string[]).map((evt) => (
                      <span key={evt} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-mono">{evt}</span>
                    ))}
                  </div>
                )}
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
          <Button variant="primary" size="sm" onClick={() => openNew("OUTGOING")}>
            <Plus size={14} className="mr-1" />
            Novo webhook de saída
          </Button>
        </div>

        <Card padding="none">
          <div className="divide-y divide-gray-100">
            {loading && (
              <div className="px-5 py-6 flex justify-center">
                <Spinner />
              </div>
            )}
            {!loading && outgoing.length === 0 && (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">
                Nenhum webhook de saída configurado.
              </p>
            )}
            {!loading && outgoing.map((wh) => (
              <div key={wh.id} className="px-5 py-4 space-y-2 hover:bg-gray-50/50 cursor-pointer transition-colors" onClick={() => openDetails(wh)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Globe size={15} className="text-purple-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-900">{wh.name}</span>
                    <Badge variant={wh.isActive ? "green" : "gray"}>
                      {wh.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Toggle enabled={wh.isActive} onChange={() => handleToggle(wh)} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(wh.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-600 font-mono flex-1 truncate">{wh.url}</span>
                  <CopyButton value={wh.url} />
                </div>
                {wh.events && wh.events.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">Eventos:</span>
                    {(wh.events as string[]).map((evt) => (
                      <span key={evt} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-mono">{evt}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Webhook Detail Modal */}
      <Modal
        isOpen={!!selectedWh}
        onClose={() => setSelectedWh(null)}
        title={selectedWh?.name || "Detalhes do Webhook"}
      >
        {selectedWh && (
          <div className="space-y-4">
            {/* Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={selectedWh.type === "INCOMING" ? "blue" : "purple"}>
                  {selectedWh.type === "INCOMING" ? "Entrada" : "Saída"}
                </Badge>
                <Badge variant={selectedWh.isActive ? "green" : "gray"}>
                  {selectedWh.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">URL</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs text-gray-700 bg-white border border-gray-200 rounded px-2 py-1 flex-1 break-all">{selectedWh.url}</code>
                    <CopyButton value={selectedWh.url} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase">ID</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-xs text-gray-500 font-mono">{selectedWh.id}</code>
                    <CopyButton value={selectedWh.id} />
                  </div>
                </div>
                {selectedWh.secret && (
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Secret</span>
                    <code className="text-xs text-gray-500 font-mono block mt-0.5">••••••••{selectedWh.secret.slice(-6)}</code>
                  </div>
                )}
                {selectedWh.events && (selectedWh.events as string[]).length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase">Eventos</span>
                    <div className="flex gap-1 flex-wrap mt-0.5">
                      {(selectedWh.events as string[]).map(evt => (
                        <span key={evt} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-mono">{evt}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedWh.type === "INCOMING" && (() => {
                  const fullUrl = selectedWh.url.startsWith("http")
                    ? selectedWh.url
                    : `http://opjlp6hp5ejuctjmck9dzd7b.187.77.238.125.sslip.io/api/webhooks/incoming/${selectedWh.id}`;
                  return (
                    <div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">URL Completa para Configurar</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 flex-1 break-all">
                          {fullUrl}
                        </code>
                        <CopyButton value={fullUrl} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Logs */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Últimos logs</h4>
              {logsLoading ? (
                <div className="flex justify-center py-4"><Spinner /></div>
              ) : whLogs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum log encontrado</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {whLogs.map(log => (
                    <div key={log.id} className="bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700">{log.type}</span>
                        <span className="text-[10px] text-gray-400">{new Date(log.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-xs text-gray-600">{log.content}</p>
                      {log.metadata && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">Payload</summary>
                          <pre className="text-[10px] text-gray-500 mt-1 bg-white border border-gray-200 rounded p-2 overflow-x-auto max-h-32">{JSON.stringify(log.metadata, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* New Webhook Modal */}
      <Modal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        title={newType === "INCOMING" ? "Novo webhook de entrada" : "Novo webhook de saída"}
      >
        <div className="space-y-4">
          <Input label="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input
            label="URL"
            type="url"
            placeholder="https://..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          {newType === "OUTGOING" && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Eventos</label>
              <div className="space-y-1.5">
                {AVAILABLE_EVENTS.map((evt) => (
                  <label key={evt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEvents.includes(evt)}
                      onChange={() => toggleEvent(evt)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-mono text-gray-700">{evt}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Input
            label="Secret (opcional)"
            type="password"
            placeholder="Chave secreta para validar a origem"
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
          />
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={newFeedback} />
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleNew} disabled={newSaving}>
              {newSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Criar webhook
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductsTab
// ---------------------------------------------------------------------------
type Recurrence = "mensal" | "anual" | "avulso";

const recurrenceBadge: Record<string, "blue" | "purple" | "gray"> = {
  mensal: "blue",
  anual: "purple",
  avulso: "gray",
  MONTHLY: "blue",
  ANNUAL: "purple",
  ONE_TIME: "gray",
};

const recurrenceLabel: Record<string, string> = {
  mensal: "Mensal",
  anual: "Anual",
  avulso: "Avulso",
  MONTHLY: "Mensal",
  ANNUAL: "Anual",
  ONE_TIME: "Avulso",
};

type ApiProduct = {
  id: string;
  name: string;
  price: number;
  sku?: string | null;
  isActive: boolean;
  recurrence?: string | null;
};

function ProductsTab() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addSku, setAddSku] = useState("");
  const [addRecurrence, setAddRecurrence] = useState("mensal");
  const [addSaving, setAddSaving] = useState(false);
  const [addFeedback, setAddFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ApiProduct | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadProducts = useCallback(() => {
    setLoading(true);
    api.get<{ data: ApiProduct[] }>("/products")
      .then((res) => setProducts(res.data))
      .catch(() => setFeedback({ type: "error", text: "Erro ao carregar produtos." }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function openEdit(p: ApiProduct) {
    setEditProduct(p);
    setEditName(p.name);
    setEditPrice(String(p.price));
    setEditActive(p.isActive);
    setEditFeedback(null);
    setEditOpen(true);
  }

  async function handleAdd() {
    if (!addName.trim() || !addPrice) {
      setAddFeedback({ type: "error", text: "Nome e preço são obrigatórios." });
      return;
    }
    setAddSaving(true);
    setAddFeedback(null);
    try {
      await api.post("/products", {
        name: addName,
        price: parseFloat(addPrice),
        sku: addSku || undefined,
        recurrence: addRecurrence,
      });
      setAddOpen(false);
      setAddName(""); setAddPrice(""); setAddSku(""); setAddRecurrence("mensal");
      loadProducts();
      setFeedback({ type: "success", text: "Produto adicionado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao adicionar.";
      setAddFeedback({ type: "error", text: msg });
    } finally {
      setAddSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editProduct) return;
    setEditSaving(true);
    setEditFeedback(null);
    try {
      await api.put(`/products/${editProduct.id}`, {
        name: editName,
        price: parseFloat(editPrice),
        isActive: editActive,
      });
      setEditOpen(false);
      loadProducts();
      setFeedback({ type: "success", text: "Produto atualizado." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao salvar.";
      setEditFeedback({ type: "error", text: msg });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setFeedback(null);
    try {
      await api.delete(`/products/${id}`);
      loadProducts();
      setFeedback({ type: "success", text: "Produto removido." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao remover.";
      setFeedback({ type: "error", text: msg });
    }
  }

  const recurrenceOptions = [
    { value: "mensal", label: "Mensal" },
    { value: "anual", label: "Anual" },
    { value: "avulso", label: "Avulso" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-600">
            {loading ? "Carregando..." : `${products.length} produtos cadastrados`}
          </p>
          <FeedbackMsg msg={feedback} />
        </div>
        <Button variant="primary" size="sm" onClick={() => { setAddFeedback(null); setAddOpen(true); }}>
          <Plus size={14} className="mr-1" />
          Novo Produto
        </Button>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="px-5 py-6 flex justify-center">
            <Spinner />
          </div>
        ) : (
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
                    <Badge variant={recurrenceBadge[product.recurrence ?? "avulso"] ?? "gray"}>
                      {recurrenceLabel[product.recurrence ?? "avulso"] ?? product.recurrence}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right text-gray-700 font-semibold">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <Badge variant={product.isActive ? "green" : "gray"}>
                      {product.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add Modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Novo produto">
        <div className="space-y-4">
          <Input label="Nome" value={addName} onChange={(e) => setAddName(e.target.value)} autoFocus />
          <Input
            label="Preço (R$)"
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={addPrice}
            onChange={(e) => setAddPrice(e.target.value)}
          />
          <Input label="SKU (opcional)" value={addSku} onChange={(e) => setAddSku(e.target.value)} />
          <Select
            label="Recorrência"
            options={recurrenceOptions}
            value={addRecurrence}
            onChange={(e) => setAddRecurrence(e.target.value)}
          />
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={addFeedback} />
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleAdd} disabled={addSaving}>
              {addSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Adicionar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar produto">
        <div className="space-y-4">
          <Input label="Nome" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <Input
            label="Preço (R$)"
            type="number"
            step="0.01"
            min="0"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="edit-active"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="edit-active" className="text-sm text-gray-700 cursor-pointer">
              Produto ativo
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <FeedbackMsg msg={editFeedback} />
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationsTab
// ---------------------------------------------------------------------------
function NotificationsTab() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    api.get<{ data: Record<string, string> }>("/notification-config")
      .then(res => setConfig(res.data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const emails = (config.deal_won_emails || "").split(",").map(e => e.trim()).filter(Boolean);
  const enabled = config.deal_won_enabled !== "false";

  const save = async (updates: Record<string, string>) => {
    setSaving(true);
    setMsg(null);
    try {
      const merged = { ...config, ...updates };
      const res = await api.put<{ data: Record<string, string> }>("/notification-config", merged);
      setConfig(res.data || merged);
      setMsg({ type: "success", text: "Salvo!" });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ type: "error", text: "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    const email = newEmail.trim();
    if (!email || !email.includes("@")) return;
    if (emails.includes(email)) return;
    save({ deal_won_emails: [...emails, email].join(",") });
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    save({ deal_won_emails: emails.filter(e => e !== email).join(",") });
  };

  if (loading) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Notificações de Venda</h2>
        <p className="text-sm text-gray-500">Configure os emails que recebem notificação quando um contrato é assinado e uma venda é fechada.</p>
      </div>

      {/* Enable/Disable toggle */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", enabled ? "bg-green-50" : "bg-gray-100")}>
              <Mail size={20} className={enabled ? "text-green-600" : "text-gray-400"} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Email de venda fechada</p>
              <p className="text-xs text-gray-500">Envia email automático quando todas as partes assinam o contrato</p>
            </div>
          </div>
          <button
            onClick={() => save({ deal_won_enabled: enabled ? "false" : "true" })}
            className={clsx(
              "relative w-11 h-6 rounded-full transition-colors",
              enabled ? "bg-green-500" : "bg-gray-300"
            )}
          >
            <span className={clsx(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
              enabled ? "left-5.5 translate-x-0" : "left-0.5"
            )} style={{ left: enabled ? '22px' : '2px' }} />
          </button>
        </div>
      </Card>

      {/* Email recipients */}
      <Card>
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Destinatários</h3>
            <p className="text-xs text-gray-500">Quem recebe o email quando uma venda é fechada</p>
          </div>

          <div className="space-y-2">
            {emails.map(email => (
              <div key={email} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700">{email}</span>
                </div>
                <button onClick={() => removeEmail(email)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
            {emails.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">Nenhum email configurado</p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              placeholder="novo@email.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={addEmail}
              disabled={!newEmail.trim() || !newEmail.includes("@")}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </Card>

      {/* Subject template */}
      <Card>
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Assunto do Email</h3>
            <p className="text-xs text-gray-500">Use {"{{cliente}}"} para inserir o nome do cliente automaticamente</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.deal_won_subject || ""}
              onChange={e => setConfig(prev => ({ ...prev, deal_won_subject: e.target.value }))}
              placeholder="Contrato Assinado — {{cliente}}"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => save({ deal_won_subject: config.deal_won_subject || "" })}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
            </button>
          </div>
        </div>
      </Card>

      {/* Test email button */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Testar envio de email</p>
            <p className="text-xs text-gray-500">Envia um email de teste para todos os destinatários configurados</p>
          </div>
          <button
            onClick={async () => {
              setMsg(null);
              try {
                await api.post("/notification-config/test-email", {});
                setMsg({ type: "success", text: `Email de teste enviado para ${emails.join(", ")}` });
              } catch {
                setMsg({ type: "error", text: "Erro ao enviar email de teste" });
              }
              setTimeout(() => setMsg(null), 5000);
            }}
            className="px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors"
          >
            Enviar Teste
          </button>
        </div>
      </Card>

      {/* WhatsApp notification */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Notificação WhatsApp de Venda</h2>
        <p className="text-sm text-gray-500 mb-4">Envia mensagem no WhatsApp quando uma venda é fechada.</p>
      </div>

      <Card>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", (config.deal_won_whatsapp_enabled ?? "true") === "true" ? "bg-green-50" : "bg-gray-100")}>
              <Bell size={20} className={(config.deal_won_whatsapp_enabled ?? "true") === "true" ? "text-green-600" : "text-gray-400"} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">WhatsApp de venda fechada</p>
              <p className="text-xs text-gray-500">Formato: VENDA! R$ [valor] ! [Produto] - [Cliente]</p>
            </div>
          </div>
          <button
            onClick={() => save({ deal_won_whatsapp_enabled: (config.deal_won_whatsapp_enabled ?? "true") === "true" ? "false" : "true" })}
            className={clsx(
              "relative w-11 h-6 rounded-full transition-colors",
              (config.deal_won_whatsapp_enabled ?? "true") === "true" ? "bg-green-500" : "bg-gray-300"
            )}
          >
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ left: (config.deal_won_whatsapp_enabled ?? "true") === "true" ? '22px' : '2px' }} />
          </button>
        </div>
      </Card>

      <Card>
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Número do WhatsApp</h3>
            <p className="text-xs text-gray-500">Número que recebe a notificação (com código do país, sem +)</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.deal_won_whatsapp_phone || "5551937111140"}
              onChange={e => setConfig(prev => ({ ...prev, deal_won_whatsapp_phone: e.target.value }))}
              placeholder="5551937111140"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => save({ deal_won_whatsapp_phone: config.deal_won_whatsapp_phone || "5551937111140" })}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
            </button>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Formato da Mensagem</h3>
            <p className="text-xs text-gray-500 mb-2">Placeholders: {"{{valor}}"}, {"{{produto}}"}, {"{{cliente}}"}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.deal_won_whatsapp_format || "🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}"}
                onChange={e => setConfig(prev => ({ ...prev, deal_won_whatsapp_format: e.target.value }))}
                placeholder="🎉 *VENDA!* R$ {{valor}} ! {{produto}} - {{cliente}}"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => save({ deal_won_whatsapp_format: config.deal_won_whatsapp_format || "" })}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Test WhatsApp button */}
      <Card>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Testar envio de WhatsApp</p>
            <p className="text-xs text-gray-500">Envia uma mensagem de teste para o número configurado</p>
          </div>
          <button
            onClick={async () => {
              setMsg(null);
              try {
                await api.post("/notification-config/test-whatsapp", {});
                setMsg({ type: "success", text: `WhatsApp de teste enviado para ${config.deal_won_whatsapp_phone || "5551937111140"}` });
              } catch {
                setMsg({ type: "error", text: "Erro ao enviar WhatsApp de teste. Verifique se o WhatsApp está conectado." });
              }
              setTimeout(() => setMsg(null), 5000);
            }}
            className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
          >
            Enviar Teste
          </button>
        </div>
      </Card>

      <FeedbackMsg msg={msg} />
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

            {/* Integrations section */}
            <div className="mt-4">
              <p className="px-3 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Integrações</p>
              <Card padding="sm">
                <nav className="space-y-0.5">
                  <Link
                    href="/settings/calendly"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Calendly
                  </Link>
                </nav>
              </Card>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === "profile"       && <ProfileTab />}
            {activeTab === "team"          && <TeamTab />}
            {activeTab === "pipeline"      && <PipelineTab />}
            {activeTab === "custom-fields" && <CustomFieldsTab />}
            {activeTab === "lost-reasons"  && <LostReasonsTab />}
            {activeTab === "sources"       && <SourcesTab />}
            {activeTab === "tags"          && <TagsTab />}
            {activeTab === "webhooks"      && <WebhooksTab />}
            {activeTab === "products"      && <ProductsTab />}
            {activeTab === "notifications" && <NotificationsTab />}
          </div>
        </div>
      </main>
    </div>
  );
}
