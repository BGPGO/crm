"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import { Plus, Search, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api";

type Recurrence = "MONTHLY" | "ANNUAL" | "ONE_TIME" | null;

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sku: string | null;
  isActive: boolean;
  recurrence: Recurrence;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ProductsResponse {
  data: Product[];
  meta: Meta;
}

interface ProductForm {
  name: string;
  price: string;
  sku: string;
  description: string;
  recurrence: string;
}

const recurrenceLabels: Record<string, string> = {
  MONTHLY: "Mensal",
  ANNUAL: "Anual",
  ONE_TIME: "Único",
};

const RECURRENCE_OPTIONS = [
  { value: "", label: "Sem recorrência" },
  { value: "MONTHLY", label: "Mensal" },
  { value: "ANNUAL", label: "Anual" },
  { value: "ONE_TIME", label: "Pagamento único" },
];

const emptyForm: ProductForm = {
  name: "",
  price: "",
  sku: "",
  description: "",
  recurrence: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = useCallback(async (currentPage: number, searchTerm: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (searchTerm) params.set("search", searchTerm);
      const result = await api.get<ProductsResponse>(`/products?${params.toString()}`);
      setProducts(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar produtos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(page, search);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchProducts(1, value);
    }, 300);
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setCreateModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: String(product.price),
      sku: product.sku || "",
      description: product.description || "",
      recurrence: product.recurrence || "",
    });
    setEditModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/products", {
        name: form.name,
        price: parseFloat(form.price),
        sku: form.sku || undefined,
        description: form.description || undefined,
        recurrence: form.recurrence || undefined,
      });
      setCreateModalOpen(false);
      fetchProducts(page, search);
    } catch (err) {
      console.error("Erro ao criar produto:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSubmitting(true);
    try {
      await api.put(`/products/${editingProduct.id}`, {
        name: form.name,
        price: parseFloat(form.price),
        sku: form.sku || undefined,
        description: form.description || undefined,
        recurrence: form.recurrence || undefined,
      });
      setEditModalOpen(false);
      setEditingProduct(null);
      fetchProducts(page, search);
    } catch (err) {
      console.error("Erro ao editar produto:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  const ProductFormFields = () => (
    <>
      <Input
        label="Nome *"
        placeholder="Nome do produto ou serviço"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        required
      />
      <Input
        label="Preço (R$) *"
        type="number"
        min="0"
        step="0.01"
        placeholder="0,00"
        value={form.price}
        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        required
      />
      <Input
        label="SKU"
        placeholder="Ex: SW-PRO-001"
        value={form.sku}
        onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
      />
      <Input
        label="Descrição"
        placeholder="Descrição do produto..."
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Recorrência</label>
        <select
          value={form.recurrence}
          onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Produtos" breadcrumb={["Catálogo", "Produtos"]} />

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button variant="primary" size="sm" onClick={openCreateModal}>
            <Plus size={14} />
            Novo Produto
          </Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Produto</TableHeader>
              <TableHeader className="hidden md:table-cell">SKU</TableHeader>
              <TableHeader>Preço</TableHeader>
              <TableHeader className="hidden sm:table-cell">Recorrência</TableHeader>
              <TableHeader className="hidden sm:table-cell">Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhum produto encontrado.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Package size={16} />
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{product.name}</span>
                        {product.description && (
                          <p className="text-xs text-gray-400 truncate max-w-xs">{product.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs text-gray-500">
                    {product.sku || "—"}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {product.recurrence ? (
                      <Badge variant="blue">
                        {recurrenceLabels[product.recurrence] || product.recurrence}
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={product.isActive ? "green" : "gray"}>
                      {product.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(product)}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
            <span>
              Mostrando {start}–{end} de {meta.total} produtos
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={meta.page <= 1}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium">
                {meta.page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={meta.page >= meta.totalPages}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Create Product Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Novo Produto">
        <form onSubmit={handleCreate} className="space-y-4">
          <ProductFormFields />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              Criar Produto
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal isOpen={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingProduct(null); }} title="Editar Produto">
        <form onSubmit={handleEdit} className="space-y-4">
          <ProductFormFields />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setEditModalOpen(false); setEditingProduct(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
