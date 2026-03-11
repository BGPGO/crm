import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
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

const organizations = [
  {
    id: "1",
    name: "Tech Solutions",
    cnpj: "12345678000195",
    segment: "Tecnologia",
    contacts: 4,
    status: "Ativa",
    createdAt: "2024-11-01",
  },
  {
    id: "2",
    name: "Indústrias Norte S.A.",
    cnpj: "98765432000111",
    segment: "Indústria",
    contacts: 7,
    status: "Ativa",
    createdAt: "2024-11-20",
  },
  {
    id: "3",
    name: "LogiTrans Express",
    cnpj: "11223344000156",
    segment: "Logística",
    contacts: 3,
    status: "Ativa",
    createdAt: "2024-12-05",
  },
  {
    id: "4",
    name: "Empresa ABC Ltda",
    cnpj: "55667788000190",
    segment: "Comércio",
    contacts: 2,
    status: "Ativa",
    createdAt: "2025-01-10",
  },
  {
    id: "5",
    name: "Comércio Sul Ltda",
    cnpj: "99887766000133",
    segment: "Varejo",
    contacts: 5,
    status: "Inativa",
    createdAt: "2025-01-25",
  },
  {
    id: "6",
    name: "Consultoria Premium",
    cnpj: "33445566000177",
    segment: "Consultoria",
    contacts: 3,
    status: "Ativa",
    createdAt: "2025-02-08",
  },
];

const segmentColors: Record<string, "blue" | "green" | "yellow" | "purple" | "orange" | "gray"> = {
  Tecnologia: "blue",
  Indústria: "gray",
  Logística: "orange",
  Comércio: "green",
  Varejo: "yellow",
  Consultoria: "purple",
};

export default function OrganizationsPage() {
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
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button variant="primary" size="sm">
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
              <TableHeader>Status</TableHeader>
              <TableHeader>Criado em</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {organizations.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} />
                    </div>
                    <span className="font-medium text-gray-900">{org.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-gray-500 font-mono text-xs">
                  {formatCNPJ(org.cnpj)}
                </TableCell>
                <TableCell>
                  <Badge variant={segmentColors[org.segment] || "gray"}>
                    {org.segment}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-600">{org.contacts} contatos</TableCell>
                <TableCell>
                  <Badge variant={org.status === "Ativa" ? "green" : "gray"}>
                    {org.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-500">{formatDate(org.createdAt)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Mostrando 1–{organizations.length} de {organizations.length} empresas</span>
          <div className="flex items-center gap-1">
            <button
              disabled
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium">
              1
            </span>
            <button
              disabled
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
