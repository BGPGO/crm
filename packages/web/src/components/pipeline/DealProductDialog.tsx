"use client";

import { useEffect, useState } from "react";
import { X, Package, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Product {
  id: string;
  name: string;
  price?: number | string | null;
  recurrence?: string | null;
}

interface DealProductDialogProps {
  dealTitle: string;
  contactName: string;
  onConfirm: (data: {
    productId: string;
    unitPrice: number;
    setupPrice: number;
    recurrence: string;
  }) => Promise<void>;
  onCancel: () => void;
}

/**
 * Pede o produto ao mover a negociação para "Proposta enviada".
 *
 * Existe porque proposta sem produto deixa o funil sem saber o que foi ofertado
 * — e era isso que fazia a maioria dos deals chegar ao ganho sem produto, o que
 * quebra qualquer relatório de BI vs Controladoria. O momento de perguntar é
 * aqui, quando a informação está fresca na cabeça de quem mandou a proposta.
 *
 * Cancelar não move a negociação, igual ao dialog de reunião.
 */
export default function DealProductDialog({
  dealTitle,
  contactName,
  onConfirm,
  onCancel,
}: DealProductDialogProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [setupPrice, setSetupPrice] = useState("");
  const [recurrence, setRecurrence] = useState("MENSAL");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    api
      .get<{ data: Product[] }>("/products?limit=200&isActive=true")
      .then((res) => {
        if (!ativo) return;
        setProducts(res.data ?? []);
      })
      .catch(() => {
        if (ativo) setErro("Não foi possível carregar os produtos.");
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Ao escolher o produto, sugere o preço de tabela — quem manda a proposta
  // costuma ajustar, então é sugestão e não travamento.
  const handleProduct = (id: string) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p?.price != null && unitPrice === "") {
      setUnitPrice(String(Number(p.price)));
    }
    if (p?.recurrence) setRecurrence(p.recurrence);
  };

  const handleSubmit = async () => {
    if (!productId) {
      setErro("Escolha o produto da proposta.");
      return;
    }
    const valor = Number(String(unitPrice).replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Informe o valor mensal da proposta.");
      return;
    }
    const setup = Number(String(setupPrice || "0").replace(",", "."));
    if (!Number.isFinite(setup) || setup < 0) {
      setErro("Valor de setup inválido.");
      return;
    }
    setErro(null);
    setSaving(true);
    try {
      await onConfirm({ productId, unitPrice: valor, setupPrice: setup, recurrence });
    } catch {
      setErro("Erro ao salvar o produto. A negociação não foi movida.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Produto da proposta</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {dealTitle}
              {contactName ? ` — ${contactName}` : ""}
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Carregando produtos…
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Package size={12} /> Produto
              </span>
              <select
                value={productId}
                onChange={(e) => handleProduct(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-petrol-500"
                autoFocus
              >
                <option value="">Selecione…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Valor mensal (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0,00"
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-petrol-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Setup (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={setupPrice}
                  onChange={(e) => setSetupPrice(e.target.value)}
                  placeholder="0,00"
                  className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-petrol-500"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Recorrência</span>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-petrol-500"
              >
                <option value="MENSAL">Mensal</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
                <option value="UNICO">Pagamento único</option>
              </select>
            </label>

            {erro && <p className="text-xs text-red-600">{erro}</p>}

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={onCancel}
                disabled={saving}
                className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="text-sm bg-petrol-600 hover:bg-petrol-700 text-white rounded-md px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Salvar e mover
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
