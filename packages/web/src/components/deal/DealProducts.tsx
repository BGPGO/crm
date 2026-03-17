"use client";

import { Trash2, Plus, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

export interface DealProduct {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  discountMonths: number | null;
  setupPrice: number | null;
  setupInstallments: number | null;
  recurrenceValue: number | null;
}

interface DealProductsProps {
  products: DealProduct[];
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
}

export default function DealProducts({ products, onAdd, onEdit, onRemove }: DealProductsProps) {
  const totalRecurrence = products.reduce((sum, p) => {
    const base = (p.recurrenceValue ?? p.unitPrice) * p.quantity;
    return sum + base;
  }, 0);

  const totalSetup = products.reduce((sum, p) => sum + (p.setupPrice ?? 0), 0);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Produtos e Serviços</h3>

      {products.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Nenhum produto adicionado.
          <br />
          <button onClick={onAdd} className="text-blue-600 hover:text-blue-700 font-medium mt-2 inline-flex items-center gap-1">
            <Plus size={14} /> Adicionar produto
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {products.map((p) => {
              const recurrence = p.recurrenceValue ?? p.unitPrice;
              const hasDiscount = p.discount > 0;
              const discountedRecurrence = recurrence * (1 - p.discount / 100);

              return (
                <div key={p.id} className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                        {p.quantity > 1 && (
                          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">x{p.quantity}</span>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {/* Recorrência */}
                        <div>
                          <span className="text-gray-400">Recorrência: </span>
                          {hasDiscount ? (
                            <>
                              <span className="line-through text-gray-300">{formatCurrency(recurrence)}</span>
                              {" "}
                              <span className="text-green-600 font-medium">{formatCurrency(discountedRecurrence)}</span>
                              <span className="text-gray-400">
                                {" "}(-{p.discount}%{p.discountMonths ? ` por ${p.discountMonths} meses` : ""})
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-700 font-medium">{formatCurrency(recurrence)}</span>
                          )}
                        </div>

                        {/* Setup */}
                        {p.setupPrice != null && p.setupPrice > 0 && (
                          <div>
                            <span className="text-gray-400">Setup: </span>
                            <span className="text-gray-700 font-medium">{formatCurrency(p.setupPrice)}</span>
                            {p.setupInstallments && p.setupInstallments > 1 && (
                              <span className="text-gray-400"> ({p.setupInstallments}x de {formatCurrency(p.setupPrice / p.setupInstallments)})</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(p.id)}
                          className="p-1 text-gray-300 hover:text-blue-500 transition-colors rounded"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onRemove && (
                        <button
                          onClick={() => onRemove(p.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totais */}
          <div className="mt-3 border-t border-gray-200 pt-3 space-y-1">
            {totalSetup > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Setup total</span>
                <span className="font-medium text-gray-700">{formatCurrency(totalSetup)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Recorrência mensal</span>
              <span className="font-bold text-blue-600">{formatCurrency(totalRecurrence)}</span>
            </div>
          </div>

          <button
            onClick={onAdd}
            className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <Plus size={14} />
            Adicionar produto
          </button>
        </>
      )}
    </div>
  );
}
