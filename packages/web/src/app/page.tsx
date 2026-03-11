import Header from "@/components/layout/Header";
import Card, { CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import FunnelChart, { FunnelStage } from "@/components/dashboard/FunnelChart";
import RecentActivities, { Activity } from "@/components/dashboard/RecentActivities";
import {
  TrendingUp,
  DollarSign,
  Trophy,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";

const metrics = [
  {
    title: "Negociações em Andamento",
    value: "47",
    sub: "deals ativos",
    change: "+12%",
    trend: "up",
    icon: TrendingUp,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    title: "Valor Total no Pipeline",
    value: formatCurrency(284500),
    sub: "em aberto",
    change: "+8.3%",
    trend: "up",
    icon: DollarSign,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    title: "Vendas Fechadas no Mês",
    value: "12",
    sub: formatCurrency(138000),
    change: "-2 vs. mês anterior",
    trend: "down",
    icon: Trophy,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  {
    title: "Taxa de Conversão",
    value: "24.8%",
    sub: "ganhos vs. total",
    change: "+3.1%",
    trend: "up",
    icon: Percent,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
];

const funnelStages: FunnelStage[] = [
  { name: "Lead",                   color: "#3B82F6", count: 94,  value: 0 },
  { name: "Contato Feito",          color: "#06B6D4", count: 68,  value: 52000 },
  { name: "Marcar Reunião",         color: "#8B5CF6", count: 51,  value: 89000 },
  { name: "Reunião Marcada",        color: "#F59E0B", count: 38,  value: 124000 },
  { name: "Proposta Enviada",       color: "#F97316", count: 27,  value: 198000 },
  { name: "Aguardando Dados",       color: "#EF4444", count: 16,  value: 145000 },
  { name: "Aguardando Assinatura",  color: "#EC4899", count: 9,   value: 97000 },
  { name: "Ganho Fechado",          color: "#22C55E", count: 12,  value: 138000 },
];

const recentActivities: Activity[] = [
  {
    id: "1",
    type: "stage_change",
    text: "João moveu 'Lead - Empresa X' para Proposta Enviada",
    deal: "Empresa X Ltda",
    dealId: "deal-001",
    time: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "2",
    type: "new_lead",
    text: "Novo lead recebido via webhook: Maria Silva",
    deal: "Maria Silva",
    time: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
  {
    id: "3",
    type: "won",
    text: "Ana marcou 'Contrato TechCorp' como Venda Fechada",
    deal: "TechCorp",
    dealId: "deal-002",
    time: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
  {
    id: "4",
    type: "call",
    text: "Ligação realizada com Carlos Souza — 18 minutos",
    deal: "Empresa ABC Ltda",
    dealId: "deal-003",
    time: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
  },
  {
    id: "5",
    type: "email",
    text: "E-mail de proposta enviado para Mariana Lima",
    deal: "Tech Solutions",
    dealId: "deal-004",
    time: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: "6",
    type: "task",
    text: "Tarefa concluída: Enviar contrato assinado",
    deal: "Indústrias Norte S.A.",
    dealId: "deal-005",
    time: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
  },
  {
    id: "7",
    type: "note",
    text: "Nota adicionada: Cliente pediu prazo até dia 20",
    deal: "Comércio Sul Ltda",
    dealId: "deal-006",
    time: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
  {
    id: "8",
    type: "stage_change",
    text: "Pedro moveu 'LogiTrans Express' para Aguardando Assinatura",
    deal: "LogiTrans Express",
    dealId: "deal-007",
    time: new Date(Date.now() - 1000 * 60 * 60 * 33).toISOString(),
  },
  {
    id: "9",
    type: "new_lead",
    text: "Novo lead recebido via GreatPages: Roberto Alves",
    deal: "Roberto Alves",
    time: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
  },
  {
    id: "10",
    type: "email",
    text: "Follow-up automático enviado para lista de prospects",
    time: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
  },
];

const topDeals = [
  { id: "1", name: "Indústrias Norte S.A.", value: 85000, stage: "Aguardando Assinatura", owner: "João" },
  { id: "2", name: "Tech Solutions",        value: 62000, stage: "Proposta Enviada",       owner: "Ana" },
  { id: "3", name: "Comércio Sul Ltda",     value: 48500, stage: "Reunião Marcada",        owner: "Pedro" },
  { id: "4", name: "LogiTrans Express",     value: 35000, stage: "Aguardando Assinatura",  owner: "João" },
  { id: "5", name: "Empresa ABC Ltda",      value: 28000, stage: "Proposta Enviada",       owner: "Ana" },
];

const stageBadge: Record<string, "blue" | "green" | "yellow" | "orange" | "purple" | "red" | "gray"> = {
  "Lead":                   "blue",
  "Contato Feito":          "blue",
  "Marcar Reunião":         "purple",
  "Reunião Marcada":        "yellow",
  "Proposta Enviada":       "orange",
  "Aguardando Dados":       "red",
  "Aguardando Assinatura":  "purple",
  "Ganho Fechado":          "green",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Dashboard" />

      <main className="flex-1 p-6 space-y-6">
        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            const isUp = metric.trend === "up";
            return (
              <Card key={metric.title} padding="md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">{metric.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    {metric.sub && (
                      <p className="text-xs text-gray-400 mt-0.5">{metric.sub}</p>
                    )}
                    <div
                      className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
                        isUp ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      <span>{metric.change} vs. mês anterior</span>
                    </div>
                  </div>
                  <div className={`${metric.bg} ${metric.color} p-2.5 rounded-xl`}>
                    <Icon size={22} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Funil de Vendas */}
          <div className="xl:col-span-2">
            <Card padding="md">
              <CardHeader>
                <CardTitle>Funil de Vendas</CardTitle>
                <span className="text-xs text-gray-400">Últimos 30 dias</span>
              </CardHeader>
              <FunnelChart stages={funnelStages} />
            </Card>
          </div>

          {/* Maiores Negociações */}
          <Card padding="md">
            <CardHeader>
              <CardTitle>Top 5 Negociações</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {topDeals.map((deal, i) => (
                <div key={deal.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{deal.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant={stageBadge[deal.stage] ?? "gray"}>
                          {deal.stage}
                        </Badge>
                        <span className="text-xs text-gray-400">{deal.owner}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-blue-600 flex-shrink-0">
                    {formatCurrency(deal.value)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Atividades Recentes */}
        <Card padding="md">
          <CardHeader>
            <CardTitle>Últimas Atividades</CardTitle>
            <button className="text-xs text-blue-600 hover:underline">Ver todas</button>
          </CardHeader>
          <RecentActivities activities={recentActivities} />
        </Card>
      </main>
    </div>
  );
}
