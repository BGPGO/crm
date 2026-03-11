import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import { BarChart3, TrendingUp, Users, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

const reportCards = [
  {
    title: "Receita por Mês",
    icon: DollarSign,
    color: "text-green-600",
    bg: "bg-green-50",
    description: "Evolução da receita fechada nos últimos 6 meses",
  },
  {
    title: "Funil de Conversão",
    icon: TrendingUp,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "Taxa de conversão entre etapas do pipeline",
  },
  {
    title: "Desempenho por Vendedor",
    icon: Users,
    color: "text-purple-600",
    bg: "bg-purple-50",
    description: "Negociações e receita por membro da equipe",
  },
  {
    title: "Produtos Mais Vendidos",
    icon: BarChart3,
    color: "text-orange-600",
    bg: "bg-orange-50",
    description: "Ranking dos produtos com maior volume de vendas",
  },
];

const summaryStats = [
  { label: "Receita Total (ano)", value: formatCurrency(1284500) },
  { label: "Ticket Médio", value: formatCurrency(32800) },
  { label: "Ciclo Médio de Venda", value: "18 dias" },
  { label: "Deals Ganhos (ano)", value: "39" },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Relatórios" breadcrumb={["Analytics", "Relatórios"]} />

      <main className="flex-1 p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
            >
              <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
              <p className="text-xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reportCards.map((report) => {
            const Icon = report.icon;
            return (
              <Card key={report.title} padding="md">
                <div className="flex items-start gap-4 mb-4">
                  <div className={`${report.bg} ${report.color} p-2.5 rounded-xl`}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{report.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
                  </div>
                </div>
                <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <div className="text-center">
                    <Icon size={28} className="text-gray-300 mx-auto mb-1.5" />
                    <p className="text-xs text-gray-400">Gráfico em desenvolvimento</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
