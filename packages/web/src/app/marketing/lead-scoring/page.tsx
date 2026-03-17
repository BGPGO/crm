"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import { Plus, Pencil, Trash2, RefreshCw, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

interface ScoringRule {
  id: string;
  name: string;
  field: string;
  operator: string;
  value: string;
  points: number;
}

interface ScoreDistribution {
  range: string;
  count: number;
}

interface RulesResponse {
  data: ScoringRule[];
}

interface DistributionResponse {
  data: ScoreDistribution[];
}

const fieldOptions = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Telefone" },
  { value: "position", label: "Cargo" },
  { value: "tags", label: "Tags" },
  { value: "engagementLevel", label: "Engajamento" },
  { value: "source", label: "Origem" },
  { value: "createdAt", label: "Data de criação" },
  { value: "lastActivity", label: "Última atividade" },
];

const operatorOptions = [
  { value: "equals", label: "Igual a" },
  { value: "not_equals", label: "Diferente de" },
  { value: "contains", label: "Contém" },
  { value: "not_contains", label: "Não contém" },
  { value: "greater_than", label: "Maior que" },
  { value: "less_than", label: "Menor que" },
  { value: "is_empty", label: "Está vazio" },
  { value: "is_not_empty", label: "Não está vazio" },
];

const emptyForm = {
  name: "",
  field: "email",
  operator: "equals",
  value: "",
  points: 0,
};

export default function LeadScoringPage() {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [distribution, setDistribution] = useState<ScoreDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<RulesResponse>("/lead-scores/rules");
      setRules(result.data);
    } catch (err) {
      console.error("Erro ao buscar regras:", err);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDistribution = useCallback(async () => {
    try {
      const result = await api.get<DistributionResponse>(
        "/lead-scores/distribution"
      );
      setDistribution(result.data);
    } catch {
      // distribution may not be available
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchDistribution();
  }, [fetchRules, fetchDistribution]);

  const openCreateModal = () => {
    setEditingRule(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (rule: ScoringRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      points: rule.points,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        field: form.field,
        operator: form.operator,
        value: form.value,
        points: Number(form.points),
      };

      if (editingRule) {
        await api.put(`/lead-scores/rules/${editingRule.id}`, payload);
      } else {
        await api.post("/lead-scores/rules", payload);
      }
      setModalOpen(false);
      fetchRules();
    } catch (err) {
      console.error("Erro ao salvar regra:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta regra?")) return;
    setDeletingId(id);
    try {
      await api.delete(`/lead-scores/rules/${id}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Erro ao excluir regra:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.post("/lead-scores/recalculate", {});
      fetchDistribution();
    } catch (err) {
      console.error("Erro ao recalcular scores:", err);
    } finally {
      setRecalculating(false);
    }
  };

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Lead Scoring" breadcrumb={["Marketing", "Lead Scoring"]} />
      <MarketingNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchRules()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        {/* Actions bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Configure regras de pontuação para qualificar seus leads automaticamente.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={recalculating}
              onClick={handleRecalculate}
            >
              <RefreshCw size={14} />
              Recalcular Scores
            </Button>
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              <Plus size={14} />
              Nova Regra
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Rules table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Nome</TableHeader>
                  <TableHeader className="hidden sm:table-cell">Campo</TableHeader>
                  <TableHeader className="hidden md:table-cell">Operador</TableHeader>
                  <TableHeader className="hidden lg:table-cell">Valor</TableHeader>
                  <TableHeader>Pontos</TableHeader>
                  <TableHeader></TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <div className="h-4 bg-gray-100 rounded animate-pulse" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="py-10 text-center text-gray-400 text-sm">
                        Nenhuma regra de scoring criada ainda.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => {
                    const fieldLabel =
                      fieldOptions.find((f) => f.value === rule.field)?.label ||
                      rule.field;
                    const opLabel =
                      operatorOptions.find((o) => o.value === rule.operator)
                        ?.label || rule.operator;
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium text-gray-900">
                          {rule.name}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-gray-600">
                          {fieldLabel}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-gray-600">{opLabel}</TableCell>
                        <TableCell className="hidden lg:table-cell text-gray-600">
                          {rule.value || "\u2014"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`font-semibold ${
                              rule.points >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {rule.points > 0 ? "+" : ""}
                            {rule.points}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(rule)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(rule.id)}
                              disabled={deletingId === rule.id}
                              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Score distribution */}
          <div>
            <Card padding="md">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Distribuição de Scores
                </h3>
              </div>
              {distribution.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Sem dados de distribuição.
                </p>
              ) : (
                <div className="space-y-3">
                  {distribution.map((item) => (
                    <div key={item.range}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">{item.range}</span>
                        <span className="text-gray-500 font-medium">
                          {item.count}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{
                            width: `${(item.count / maxCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>

      {/* Create/Edit Rule Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? "Editar Regra" : "Nova Regra de Scoring"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome da Regra *"
            placeholder="Ex: Tem email preenchido"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Select
            label="Campo"
            options={fieldOptions}
            value={form.field}
            onChange={(e) => setForm((f) => ({ ...f, field: e.target.value }))}
          />
          <Select
            label="Operador"
            options={operatorOptions}
            value={form.operator}
            onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}
          />
          {form.operator !== "is_empty" && form.operator !== "is_not_empty" && (
            <Input
              label="Valor"
              placeholder="Valor para comparação"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            />
          )}
          <Input
            label="Pontos *"
            type="number"
            placeholder="Ex: 10"
            value={String(form.points)}
            onChange={(e) =>
              setForm((f) => ({ ...f, points: Number(e.target.value) }))
            }
            required
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              {editingRule ? "Salvar" : "Criar Regra"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
