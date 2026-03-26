"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import { Loader2, TrendingDown, Trophy, DollarSign, Wrench } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api";

interface ReportData {
  funnel: {
    total: number;
    byStage: Record<string, number>;
    stages: Array<{ id: string; name: string; order: number }>;
  };
  summary: {
    wonCount: number;
    wonTotalValue: number;
    wonMonthlyValue: number;
    wonSetupValue: number;
    lostCount: number;
    lostValue: number;
    totalDealsThisMonth: number;
    conversionRate: number;
  };
  ticketMedio: Array<{
    product: string;
    currentAvg: number;
    currentTotal: number;
    currentCount: number;
    lastMonthAvg: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    totalMonthly: number;
    totalSetup: number;
  }>;
  salesByClient: Array<{
    dealId: string;
    clientName: string;
    products: string;
    monthlyValue: number;
    setupValue: number;
    totalValue: number;
  }>;
}

// ── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ percentage, color, size = 80 }: { percentage: number; color: string; size?: number }) {
  const r = (size / 2) - 4;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#374151" strokeWidth="5" opacity="0.2" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        className="transition-all duration-700" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="text-xs font-bold" fill="#f1f5f9">{percentage.toFixed(0)}%</text>
    </svg>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ReportData }>("/reports/sales");
      setData(res.data);
    } catch (err) {
      console.error("Erro ao carregar relatórios:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Análises" breadcrumb={["Análises"]} />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
            <span className="text-sm">Carregando análises...</span>
          </div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Análises" breadcrumb={["Análises"]} />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">Nenhum dado disponível</p>
        </main>
      </div>
    );
  }

  const { funnel, summary, ticketMedio, monthlyTrend, salesByClient } = data;

  // Key stage counts
  const reuniaoCount = funnel.byStage["Reunião Marcada"] || funnel.byStage["Reuniao Marcada"] || 0;
  const propostaCount = funnel.byStage["Proposta Enviada"] || 0;
  const vendasCount = summary.wonCount;

  // Monthly chart max
  const maxMonthly = Math.max(...monthlyTrend.map(m => m.totalMonthly + m.totalSetup), 1);

  // Ticket médio max for bar sizing
  const maxTicket = Math.max(...ticketMedio.map(t => t.currentAvg), 1);

  // Percentages for summary cards
  const totalWonLost = summary.wonCount + summary.lostCount;
  const lostPct = totalWonLost > 0 ? (summary.lostCount / totalWonLost) * 100 : 0;
  const wonPct = summary.conversionRate;
  const monthlyPct = summary.wonTotalValue > 0 ? (summary.wonMonthlyValue / summary.wonTotalValue) * 100 : 0;
  const setupPct = summary.wonTotalValue > 0 ? (summary.wonSetupValue / summary.wonTotalValue) * 100 : 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Análises" breadcrumb={["Análises"]} />

      <main className="flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* ── Row 1: Funnel + Monthly Chart ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funnel numbers */}
          <div className="space-y-3">
            <div className="bg-gray-900 rounded-xl p-5">
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total</p>
              <p className="text-4xl font-bold text-white mt-1">{funnel.total}</p>
            </div>
            {[
              { label: "Reunião Marcada", count: reuniaoCount, color: "#3B82F6" },
              { label: "Proposta Enviada", count: propostaCount, color: "#F59E0B" },
              { label: "Vendas", count: vendasCount, color: "#22C55E" },
            ].map(item => (
              <div key={item.label} className="bg-gray-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400">{item.label}</p>
                  <p className="text-2xl font-bold text-white">{item.count}</p>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${funnel.total > 0 ? Math.max((item.count / funnel.total) * 100, 2) : 0}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Monthly chart */}
          <div className="lg:col-span-2 bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Vendas por mês</h3>
            <div className="flex items-end gap-3 h-52">
              {monthlyTrend.map((m, i) => {
                const total = m.totalMonthly + m.totalSetup;
                const heightPct = maxMonthly > 0 ? (total / maxMonthly) * 100 : 0;
                const monthlyPctBar = total > 0 ? (m.totalMonthly / total) * 100 : 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-gray-300 font-medium">
                      {total > 0 ? formatCurrency(total) : "—"}
                    </span>
                    <div className="w-full flex flex-col justify-end" style={{ height: '180px' }}>
                      <div
                        className="w-full rounded-t-md overflow-hidden transition-all duration-700"
                        style={{ height: `${Math.max(heightPct, 3)}%` }}
                      >
                        <div className="bg-blue-500 w-full" style={{ height: `${monthlyPctBar}%` }} />
                        <div className="bg-orange-400 w-full" style={{ height: `${100 - monthlyPctBar}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 capitalize">{m.month}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-[10px] text-gray-400">Mensal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-orange-400" />
                <span className="text-[10px] text-gray-400">Setup</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 2: Four summary cards ────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Vendas Perdidas", value: formatCurrency(summary.lostValue), count: `${summary.lostCount} negociações`, pct: lostPct, color: "#EF4444", icon: TrendingDown },
            { label: "Vendas Fechadas", value: formatCurrency(summary.wonTotalValue), count: `${summary.wonCount} negociações`, pct: wonPct, color: "#22C55E", icon: Trophy },
            { label: "Mensal Contratado", value: formatCurrency(summary.wonMonthlyValue), count: `${summary.wonCount} contratos`, pct: monthlyPct, color: "#3B82F6", icon: DollarSign },
            { label: "Setup", value: formatCurrency(summary.wonSetupValue), count: `receita única`, pct: setupPct, color: "#F59E0B", icon: Wrench },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="bg-gray-900 rounded-xl p-4 flex items-center gap-4">
                <DonutChart percentage={card.pct} color={card.color} />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{card.label}</p>
                  <p className="text-lg font-bold text-white truncate">{card.value}</p>
                  <p className="text-[10px] text-gray-500">{card.count}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Row 3: Ticket Médio por Produto ─────────────────────────── */}
        {ticketMedio.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Ticket médio</h3>
            <div className="space-y-4">
              {ticketMedio.map((t) => {
                const barPct = maxTicket > 0 ? Math.max((t.currentAvg / maxTicket) * 100, 3) : 0;
                return (
                  <div key={t.product}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{t.product}</span>
                        <span className="text-sm text-blue-400 font-bold">{formatCurrency(t.currentAvg)}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        Mês anterior: {formatCurrency(t.lastMonthAvg)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full flex items-center justify-center transition-all duration-700"
                        style={{ width: `${barPct}%`, minWidth: '60px' }}
                      >
                        <span className="text-[10px] font-bold text-white">{formatCurrency(t.currentAvg)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Row 4: Vendas por Cliente ────────────────────────────────── */}
        {salesByClient.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Vendas por Cliente</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400">Nome</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-400">Produto</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400">Mensal</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400">Setup</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByClient.map((sale, i) => (
                    <tr key={sale.dealId} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                      <td className="py-2.5 px-3 text-gray-200">{sale.clientName}</td>
                      <td className="py-2.5 px-3 text-gray-400">{sale.products}</td>
                      <td className="py-2.5 px-3 text-right text-gray-200">{formatCurrency(sale.monthlyValue)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-400">{sale.setupValue > 0 ? formatCurrency(sale.setupValue) : "—"}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-white">{formatCurrency(sale.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
