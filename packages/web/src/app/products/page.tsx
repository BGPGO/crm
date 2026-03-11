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
import { Plus, Search, Package } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

const products = [
  {
    id: "1",
    name: "Licença Software Pro",
    sku: "SW-PRO-001",
    price: 2490,
    status: "Ativo",
    category: "Software",
  },
  {
    id: "2",
    name: "Módulo Fiscal",
    sku: "MOD-FIS-002",
    price: 890,
    status: "Ativo",
    category: "Módulo",
  },
  {
    id: "3",
    name: "Consultoria por Hora",
    sku: "SVC-CONS-001",
    price: 350,
    status: "Ativo",
    category: "Serviço",
  },
  {
    id: "4",
    name: "Treinamento Corporativo",
    sku: "TRN-CORP-001",
    price: 4800,
    status: "Ativo",
    category: "Treinamento",
  },
  {
    id: "5",
    name: "Suporte Premium Anual",
    sku: "SUP-PREM-12",
    price: 7200,
    status: "Ativo",
    category: "Suporte",
  },
  {
    id: "6",
    name: "Integração API Customizada",
    sku: "INT-API-003",
    price: 3600,
    status: "Inativo",
    category: "Serviço",
  },
];

const categoryColors: Record<string, "blue" | "green" | "yellow" | "purple" | "orange" | "gray"> = {
  Software: "blue",
  Módulo: "purple",
  Serviço: "green",
  Treinamento: "yellow",
  Suporte: "orange",
};

export default function ProductsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Produtos" breadcrumb={["Catálogo", "Produtos"]} />

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
              placeholder="Buscar produtos..."
              className="pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <Button variant="primary" size="sm">
            <Plus size={14} />
            Novo Produto
          </Button>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Produto</TableHeader>
              <TableHeader>SKU</TableHeader>
              <TableHeader>Categoria</TableHeader>
              <TableHeader>Preço</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <Package size={16} />
                    </div>
                    <span className="font-medium text-gray-900">{product.name}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-500">{product.sku}</TableCell>
                <TableCell>
                  <Badge variant={categoryColors[product.category] || "gray"}>
                    {product.category}
                  </Badge>
                </TableCell>
                <TableCell className="font-semibold text-gray-900">
                  {formatCurrency(product.price)}
                </TableCell>
                <TableCell>
                  <Badge variant={product.status === "Ativo" ? "green" : "gray"}>
                    {product.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm">Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </main>
    </div>
  );
}
