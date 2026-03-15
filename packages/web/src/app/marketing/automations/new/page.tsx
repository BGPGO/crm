"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import MarketingNav from "@/components/marketing/MarketingNav";
import TriggerConfig from "@/components/marketing/TriggerConfig";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";

const TRIGGER_TYPES = [
  { value: "TAG_ADDED", label: "Tag adicionada" },
  { value: "TAG_REMOVED", label: "Tag removida" },
  { value: "STAGE_CHANGED", label: "Etapa alterada" },
  { value: "CONTACT_CREATED", label: "Contato criado" },
  { value: "FIELD_UPDATED", label: "Campo atualizado" },
  { value: "DATE_BASED", label: "Baseado em data" },
];

interface CreateAutomationPayload {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: any;
}

interface AutomationResponse {
  id: string;
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const selectClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function NewAutomationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("TAG_ADDED");
  const [triggerConfig, setTriggerConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload: CreateAutomationPayload = {
        name: name.trim(),
        description: description.trim(),
        triggerType,
        triggerConfig,
      };
      const result = await api.post<AutomationResponse>(
        "/automations",
        payload
      );
      router.push(`/marketing/automations/${result.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao criar automação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Nova Automação"
        breadcrumb={["Marketing", "Automações", "Nova"]}
      />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-6 max-w-2xl">
        <Link
          href="/marketing/automations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={14} />
          Voltar para Automações
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Informações Básicas
            </h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Nome *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Boas-vindas novos leads"
                  className={inputClass}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Descrição
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o objetivo desta automação..."
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          </Card>

          {/* Trigger */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Gatilho
            </h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Tipo de Gatilho
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => {
                    setTriggerType(e.target.value);
                    setTriggerConfig({});
                  }}
                  className={selectClass}
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Configuração do Gatilho
                </h3>
                <TriggerConfig
                  triggerType={triggerType}
                  config={triggerConfig}
                  onChange={setTriggerConfig}
                />
              </div>
            </div>
          </Card>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={saving}>
              Criar Automação
            </Button>
            <Link href="/marketing/automations">
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
