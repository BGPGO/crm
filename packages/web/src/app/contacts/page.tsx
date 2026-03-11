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
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, formatPhone } from "@/lib/formatters";

const contacts = [
  {
    id: "1",
    name: "Carlos Souza",
    email: "carlos.souza@logiexpress.com.br",
    phone: "11987654321",
    company: "LogiTrans Express",
    status: "Ativo",
    createdAt: "2024-11-15",
  },
  {
    id: "2",
    name: "Mariana Lima",
    email: "mariana@techsolutions.com",
    phone: "21912345678",
    company: "Tech Solutions",
    status: "Ativo",
    createdAt: "2024-12-01",
  },
  {
    id: "3",
    name: "Roberto Alves",
    email: "r.alves@indnorte.ind.br",
    phone: "31998887766",
    company: "Indústrias Norte S.A.",
    status: "Ativo",
    createdAt: "2024-12-10",
  },
  {
    id: "4",
    name: "Fernanda Costa",
    email: "fernanda.costa@abc.com",
    phone: "41933221100",
    company: "Empresa ABC Ltda",
    status: "Ativo",
    createdAt: "2025-01-05",
  },
  {
    id: "5",
    name: "Paulo Ferreira",
    email: "paulo@xyz-corp.com.br",
    phone: "11944556677",
    company: "Empresa XYZ",
    status: "Inativo",
    createdAt: "2025-01-20",
  },
  {
    id: "6",
    name: "Ana Beatriz",
    email: "ana.beatriz@enterprise.com",
    phone: "21966778899",
    company: "Enterprise Corp",
    status: "Ativo",
    createdAt: "2025-02-03",
  },
  {
    id: "7",
    name: "Ricardo Nunes",
    email: "rnunes@consultoria.com.br",
    phone: "31955443322",
    company: "Consultoria Premium",
    status: "Ativo",
    createdAt: "2025-02-14",
  },
];

export default function ContactsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Contatos" breadcrumb={["CRM", "Contatos"]} />

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
              placeholder="Buscar contatos..."
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button variant="primary" size="sm">
            <Plus size={14} />
            Novo Contato
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>Email</TableHeader>
              <TableHeader>Telefone</TableHeader>
              <TableHeader>Empresa</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Criado em</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {contacts.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {contact.name.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-900">{contact.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-gray-600">{contact.email}</TableCell>
                <TableCell className="text-gray-600">{formatPhone(contact.phone)}</TableCell>
                <TableCell className="text-gray-600">{contact.company}</TableCell>
                <TableCell>
                  <Badge variant={contact.status === "Ativo" ? "green" : "gray"}>
                    {contact.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-500">{formatDate(contact.createdAt)}</TableCell>
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
          <span>Mostrando 1–{contacts.length} de {contacts.length} contatos</span>
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
