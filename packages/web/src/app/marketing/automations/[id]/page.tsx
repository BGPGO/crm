"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import MarketingNav from "@/components/marketing/MarketingNav";
import FlowBuilder from "@/components/marketing/FlowBuilder";
import { Step } from "@/components/marketing/FlowStepCard";
import {
  ArrowLeft,
  Play,
  Pause,
  Save,
  Users,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

type AutomationStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

interface Automation {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: any;
  status: AutomationStatus;
  steps: Step[];
  activeEnrollments: number;
  completedEnrollments: number;
  failedEnrollments: number;
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<
  AutomationStatus,
  { variant: "gray" | "green" | "yellow" | "red"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  ACTIVE: { variant: "green", label: "Ativa" },
  PAUSED: { variant: "yellow", label: "Pausada" },
  ARCHIVED: { variant: "red", label: "Arquivada" },
};

const TRIGGER_LABELS: Record<string, string> = {
  TAG_ADDED: "Tag adicionada",
  TAG_REMOVED: "Tag removida",
  STAGE_CHANGED: "Etapa alterada",
  CONTACT_CREATED: "Contato criado",
  FIELD_UPDATED: "Campo atualizado",
  DATE_BASED: "Baseado em data",
};

export default function AutomationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fetchAutomation = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{ data: Automation }>(`/automations/${id}`);
      setAutomation(result.data);
      setSteps(result.data.steps ?? []);
    } catch (err) {
      console.error("Erro ao buscar automação:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAutomation();
  }, [fetchAutomation]);

  const handleSaveSteps = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.put(`/automations/${id}/steps`, { steps });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao salvar passos.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!automation) return;
    const newStatus = automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await api.patch(`/automations/${id}`, { status: newStatus });
      setAutomation((prev) => (prev ? { ...prev, status: newStatus } : prev));
    } catch (err) {
      console.error("Erro ao alterar status:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Automação" breadcrumb={["Marketing", "Automações", "..."]} />
        <MarketingNav />
        <main className="flex-1 p-6">
          <div className="space-y-4">
            <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Automação" breadcrumb={["Marketing", "Automações"]} />
        <MarketingNav />
        <main className="flex-1 p-6">
          <Card padding="md">
            <p className="text-sm text-gray-500">Automação não encontrada.</p>
          </Card>
        </main>
      </div>
    );
  }

  const status = statusConfig[automation.status] ?? statusConfig.DRAFT;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title={automation.name}
        breadcrumb={["Marketing", "Automações", automation.name]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-6">
        {/* Back link */}
        <Link
          href="/marketing/automations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para Automações
        </Link>

        {/* Header card */}
        <Card padding="md">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {automation.name}
                </h2>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              {automation.description && (
                <p className="text-sm text-gray-600">
                  {automation.description}
                </p>
              )}
              <p className="text-sm text-gray-500">
                Gatilho:{" "}
                <span className="font-medium text-gray-700">
                  {TRIGGER_LABELS[automation.triggerType] ??
                    automation.triggerType}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/marketing/automations/${id}/enrollments`}>
                <Button variant="secondary" size="sm">
                  <Users size={14} />
                  Inscrições
                </Button>
              </Link>
              <Button
                variant={
                  automation.status === "ACTIVE" ? "secondary" : "primary"
                }
                size="sm"
                onClick={handleToggleStatus}
              >
                {automation.status === "ACTIVE" ? (
                  <>
                    <Pause size={14} />
                    Pausar
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Ativar
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50 text-blue-600">
                <Users size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {automation.activeEnrollments ?? 0}
                </p>
                <p className="text-xs text-gray-500">Inscrições ativas</p>
              </div>
            </div>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-50 text-green-600">
                <CheckCircle size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {automation.completedEnrollments ?? 0}
                </p>
                <p className="text-xs text-gray-500">Concluídas</p>
              </div>
            </div>
          </Card>
          <Card padding="md">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-50 text-red-600">
                <XCircle size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {automation.failedEnrollments ?? 0}
                </p>
                <p className="text-xs text-gray-500">Falharam</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Flow Builder */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-gray-900">
              Fluxo da Automação
            </h3>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-sm text-green-600 font-medium">
                  Salvo com sucesso!
                </span>
              )}
              {error && (
                <span className="text-sm text-red-600">{error}</span>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveSteps}
                loading={saving}
              >
                <Save size={14} />
                Salvar Passos
              </Button>
            </div>
          </div>
          <FlowBuilder steps={steps} onChange={setSteps} />
        </Card>
      </main>
    </div>
  );
}
