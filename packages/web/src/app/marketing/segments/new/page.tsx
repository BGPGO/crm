"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import MarketingNav from "@/components/marketing/MarketingNav";
import SegmentFilterBuilder, {
  SegmentFilter,
} from "@/components/marketing/SegmentFilterBuilder";
import Button from "@/components/ui/Button";
import { ArrowLeft, Save } from "lucide-react";
import { api } from "@/lib/api";

export default function NewSegmentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome do segmento é obrigatório.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/segments", {
        name: name.trim(),
        description: description.trim() || undefined,
        filters,
        isActive,
      });
      router.push("/marketing/segments");
    } catch (err) {
      console.error("Erro ao criar segmento:", err);
      setError("Erro ao criar segmento. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title="Novo Segmento"
        breadcrumb={["Marketing", "Segmentos", "Novo"]}
      />
      <MarketingNav />

      <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Back link */}
          <button
            onClick={() => router.push("/marketing/segments")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Voltar para Segmentos
          </button>

          {/* Card */}
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6"
          >
            <h2 className="text-lg font-semibold text-gray-900">
              Criar Segmento
            </h2>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Nome *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Leads engajados últimos 30 dias"
                required
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Descrição
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o objetivo deste segmento..."
                rows={3}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white resize-none"
              />
            </div>

            {/* Filters */}
            <div>
              <SegmentFilterBuilder filters={filters} onChange={setFilters} />
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setIsActive(!isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isActive ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isActive ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">
                Segmento ativo
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => router.push("/marketing/segments")}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
                disabled={!name.trim()}
              >
                <Save size={14} />
                Criar Segmento
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
