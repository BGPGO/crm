"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Plus, Search, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { formatDate, formatCNPJ } from "@/lib/formatters";
import { api } from "@/lib/api";

interface Organization {
  id: string;
  name: string;
  cnpj: string | null;
  segment: string | null;
  phone: string | null;
  website: string | null;
  _count: {
    contacts: number;
    deals: number;
  };
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface OrganizationsResponse {
  data: Organization[];
  meta: Meta;
}

interface NewOrgForm {
  name: string;
  cnpj: string;
  segment: string;
  phone: string;
  website: string;
  instagram: string;
}

const segmentColors: Record<string, "blue" | "green" | "yellow" | "purple" | "orange" | "gray"> = {
  Tecnologia: "blue",
  Indústria: "gray",
  Logística: "orange",
  Comércio: "green",
  Varejo: "yellow",
  Consultoria: "purple",
};

const SEGMENTS = ["Tecnologia", "Indústria", "Logística", "Comércio", "Varejo", "Consultoria", "Serviços", "Saúde", "Educação", "Outro"];

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<NewOrgForm>({
    name: "",
    cnpj: "",
    segment: "",
    phone: "",
    website: "",
    instagram: "",
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOrganizations = useCallback(async (currentPage: number, searchTerm: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (searchTerm) params.set("search", searchTerm);
      const result = await api.get<OrganizationsResponse>(`/organizations?${params.toString()}`);
      setOrganizations(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar empresas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations(page, search);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchOrganizations(1, value);
    }, 300);
  };

  const openModal = () => {
    setForm({ name: "", cnpj: "", segment: "", phone: "", website: "", instagram: "" });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/organizations", {
        name: form.name,
        cnpj: form.cnpj || undefined,
        segment: form.segment || undefined,
        phone: form.phone || undefined,
        website: form.website || undefined,
        instagram: form.instagram || undefined,
      });
      setModalOpen(false);
      fetchOrganizations(page, search);
    } catch (err) {
      console.error("Erro ao criar empresa:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Empresas" breadcrumb={["CRM", "Empresas"]} />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Buscar empresas..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button variant="primary" size="sm" onClick={openModal}>
            <Plus size={14} />
            Nova Empresa
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Empresa</TableHeader>
              <TableHeader>CNPJ</TableHeader>
              <TableHeader>Segmento</TableHeader>
              <TableHeader>Contatos</TableHeader>
              <TableHeader>Negociações</TableHeader>
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
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma empresa encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow
                  key={org.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/organizations/${org.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} />
                      </div>
                      <span className="font-medium text-gray-900">{org.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-500 font-mono text-xs">
                    {org.cnpj ? formatCNPJ(org.cnpj) : "—"}
                  </TableCell>
                  <TableCell>
                    {org.segment ? (
                      <Badge variant={segmentColors[org.segment] || "gray"}>
                        {org.segment}
                      </Badge>
                    ) : (
                      <span className="text-gray-400 text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600">{org._count.contacts} contatos</TableCell>
                  <TableCell className="text-gray-600">{org._count.deals} negociações</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Link
                      href={`/organizations/${org.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Ver
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Mostrando {start}–{end} de {meta.total} empresas
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

      {/* New Organization Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nova Empresa">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome *"
            placeholder="Razão social ou nome fantasia"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="CNPJ"
            placeholder="00.000.000/0000-00"
            value={form.cnpj}
            onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Segmento</label>
            <select
              value={form.segment}
              onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              <option value="">Selecione um segmento</option>
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <Input
            label="Telefone"
            placeholder="(11) 99999-9999"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <Input
            label="Website"
            placeholder="https://www.exemplo.com.br"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />
          <Input
            label="Instagram"
            placeholder="@empresa"
            value={form.instagram}
            onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              Criar Empresa
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
