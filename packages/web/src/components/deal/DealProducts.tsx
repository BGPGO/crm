"use client";

import { Trash2, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

export interface DealProduct {
  id: string;
  name: string;
  recurrence: string;
  price: number;
  quantity: number;
}

interface DealProductsProps {
  products: DealProduct[];
  onAdd?: () => void;
  onRemove?: (id: string) => void;
}

export default function DealProducts({ products, onAdd, onRemove }: DealProductsProps) {
  const total = products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-3">Produtos</h3>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Produto</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Recorrência</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Valor</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Qtd</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Subtotal</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-800">{p.name}</td>
                <td className="px-3 py-2 text-gray-500">{p.recurrence}</td>
                <td className="px-3 py-2 text-right text-gray-700">{formatCurrency(p.price)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{p.quantity}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-800">
                  {formatCurrency(p.price * p.quantity)}
                </td>
                <td className="px-2 py-2 text-right">
                  {onRemove && (
                    <button
                      onClick={() => onRemove(p.id)}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-gray-700 text-right">
                Total
              </td>
              <td className="px-3 py-2 text-right text-base font-bold text-blue-600">
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        onClick={onAdd}
        className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
      >
        <Plus size={14} />
        Adicionar produto
      </button>
    </div>
  );
}
