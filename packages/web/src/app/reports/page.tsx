"use client";

import { useState, useEffect, useCallback } from "react";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import { Loader2, Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { api } from "@/lib/api";

interface ReportData {
  funnel: {
    totalLeads: number;
    reunioesMarcadas: number;
    propostasEnviadas: number;
    vendas: number;
  };
  summary: {
    wonCount: number;
    wonTotalValue: number;
    wonMonthlyValue: number;
    wonSetupValue: number;
    lostCount: number;
    lostValue: number;
    totalDealsInPeriod: number;
    conversionRate: number;
    ticketMedioGeral: number;
  };
  ticketMedio: Array<{ product: string; currentAvg: number; currentTotal: number; currentCount: number; lastMonthAvg: number }>;
  monthlyTrend: Array<{ month: string; totalMonthly: number; totalSetup: number }>;
  salesByClient: Array<{ dealId: string; clientName: string; products: string; monthlyValue: number; setupValue: number; totalValue: number }>;
  salesByCategory: Record<string, { monthlyTotal: number; setupTotal: number; count: number }>;
}

interface ApiUser { id: string; name: string; }

// ── Donut Chart ──────────────────────────────────────────────────────────────

function DonutChart({ percentage, color, size = 90 }: { percentage: number; color: string; size?: number }) {
  const r = (size / 2) - 5;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        className="transition-all duration-700" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        className="text-sm font-bold" fill="currentColor">{clamped.toFixed(0)}%</text>
    </svg>
  );
}

// ── Editable Meta Input ──────────────────────────────────────────────────────

function MetaInput({ metaKey, defaultValue, onSave }: { metaKey: string; defaultValue: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(defaultValue));

  if (!editing) {
    return (
      <button onClick={() => { setValue(String(defaultValue)); setEditing(true); }}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-blue-500 transition-colors">
        Meta: {formatCurrency(defaultValue)} <Pencil size={9} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-400">Meta:</span>
      <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
        className="w-20 text-[10px] border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus />
      <button onClick={() => { onSave(Number(value) || 0); setEditing(false); }} className="text-green-500 hover:text-green-700"><Check size={12} /></button>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
    </div>
  );
}

// ── Meta storage helpers ─────────────────────────────────────────────────────

function getMeta(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const saved = localStorage.getItem(`report_meta_${key}`);
  return saved ? Number(saved) : fallback;
}

function saveMeta(key: string, value: number) {
  localStorage.setItem(`report_meta_${key}`, String(value));
}

const SELECT_CLASS =
  "appearance-none text-sm bg-white border border-gray-200 rounded-md px-3 py-1.5 pr-7 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500";

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [userFilter, setUserFilter] = useState("all");

  // Date filter: default to this month
  const now = new Date();
  const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState("");

  const [metas, setMetas] = useState({
    vendasFechadas: 0,
    ticketMedio: 0,
    controladoria: 0,
    bi: 0,
  });

  useEffect(() => {
    setMetas({
      vendasFechadas: getMeta('vendasFechadas', 10000),
      ticketMedio: getMeta('ticketMedio', 1500),
      controladoria: getMeta('controladoria', 5000),
      bi: getMeta('bi', 3000),
    });
  }, []);

  const updateMeta = (key: string, value: number) => {
    saveMeta(key, value);
    setMetas(prev => ({ ...prev, [key]: value }));
  };

  // Fetch users
  useEffect(() => {
    api.get<{ data: ApiUser[] }>("/users?limit=100").then(res => setUsers(res.data ?? [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (userFilter !== 'all') params.set('userId', userFilter);
      const qs = params.toString();
      const res = await api.get<{ data: ReportData }>(`/reports/sales${qs ? `?${qs}` : ''}`);
      setData(res.data);
    } catch (err) {
      console.error("Erro ao carregar relatórios:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, userFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-auto">
        <Header title="Análises" breadcrumb={["Análises"]} />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-gray-400" />
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

  const { funnel, summary, ticketMedio, monthlyTrend, salesByClient, salesByCategory } = data;

  // ── Simplified funnel: 4 steps with % ─────────────────────────────────
  const funnelSteps = [
    { label: "Total", count: funnel.totalLeads, color: "#3B82F6" },
    { label: "Reunião Marcada", count: funnel.reunioesMarcadas, color: "#8B5CF6" },
    { label: "Proposta Enviada", count: funnel.propostasEnviadas, color: "#F59E0B" },
    { label: "Vendas", count: funnel.vendas, color: "#22C55E" },
  ];
  const funnelMax = funnelSteps[0].count || 1;

  // Monthly chart max
  const maxMonthly = Math.max(...monthlyTrend.map(m => m.totalMonthly + m.totalSetup), 1);

  // Category values
  const controladoriaValue = salesByCategory?.['Controladoria']?.monthlyTotal || 0;
  const biValue = salesByCategory?.['BI']?.monthlyTotal || 0;

  // Card data with metas
  const cards = [
    { key: 'vendasFechadas', label: 'Vendas Fechadas', value: summary.wonMonthlyValue, meta: metas.vendasFechadas, color: '#22C55E', sub: `${summary.wonCount} negociações` },
    { key: 'ticketMedio', label: 'Ticket Médio', value: summary.ticketMedioGeral || 0, meta: metas.ticketMedio, color: '#3B82F6', sub: `média mensal/deal` },
    { key: 'controladoria', label: 'Vendas Controladoria', value: controladoriaValue, meta: metas.controladoria, color: '#8B5CF6', sub: `${salesByCategory?.['Controladoria']?.count || 0} contratos` },
    { key: 'bi', label: 'Vendas BI', value: biValue, meta: metas.bi, color: '#F59E0B', sub: `${salesByCategory?.['BI']?.count || 0} contratos` },
  ];

  // Ticket médio max
  const maxTicket = Math.max(...ticketMedio.map(t => t.currentAvg), 1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Análises" breadcrumb={["Análises"]} />

      <main className="flex-1 px-4 sm:px-6 py-6 space-y-6">
        {/* ── Filters bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">De:</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="text-sm bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Até:</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="text-sm bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="relative">
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className={`${SELECT_CLASS} text-gray-600`}>
              <option value="all">Todos os responsáveis</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">&#9662;</span>
          </div>
          {(dateFrom !== defaultFrom || dateTo || userFilter !== 'all') && (
            <button onClick={() => { setDateFrom(defaultFrom); setDateTo(''); setUserFilter('all'); }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        {/* ── Row 1: Funnel + Monthly Chart ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Simplified funnel: 4 rows */}
          <Card padding="md">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Funil de Vendas</h3>
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const widthPct = funnelMax > 0 ? Math.max((step.count / funnelMax) * 100, 5) : 5;
                const pctOfTotal = funnelMax > 0 ? (step.count / funnelMax) * 100 : 0;
                const prevCount = i > 0 ? funnelSteps[i - 1].count : step.count;
                const pctOfPrev = prevCount > 0 ? (step.count / prevCount) * 100 : 0;
                return (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 font-medium">{step.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">{step.count}</span>
                        {i > 0 && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            pctOfPrev >= 50 ? 'bg-green-100 text-green-700' :
                            pctOfPrev >= 25 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {pctOfPrev.toFixed(0)}%
                          </span>
                        )}
                        {i > 0 && (
                          <span className="text-[10px] text-gray-400">
                            {pctOfTotal.toFixed(0)}% do total
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-7">
                      <div
                        className="h-full rounded-full transition-all duration-700 flex items-center px-2"
                        style={{ width: `${widthPct}%`, backgroundColor: step.color, minWidth: '32px' }}
                      >
                        <span className="text-xs font-bold text-white">{step.count}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Monthly chart + table */}
          <div className="lg:col-span-2">
            <Card padding="md">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Vendas por mês</h3>
              <div className="flex items-end gap-3 h-52">
                {monthlyTrend.map((m, i) => {
                  const total = m.totalMonthly + m.totalSetup;
                  const heightPct = maxMonthly > 0 ? (total / maxMonthly) * 100 : 0;
                  const monthlyPctBar = total > 0 ? (m.totalMonthly / total) * 100 : 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">
                        {total > 0 ? formatCurrency(total) : "—"}
                      </span>
                      <div className="w-full flex flex-col justify-end" style={{ height: '180px' }}>
                        <div className="w-full rounded-t-md overflow-hidden transition-all duration-700"
                          style={{ height: `${Math.max(heightPct, 3)}%` }}>
                          <div className="bg-blue-500 w-full" style={{ height: `${monthlyPctBar}%` }} />
                          <div className="bg-orange-400 w-full" style={{ height: `${100 - monthlyPctBar}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-500 capitalize">{m.month}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 mb-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-blue-500" />
                  <span className="text-[10px] text-gray-400">Mensal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-orange-400" />
                  <span className="text-[10px] text-gray-400">Setup</span>
                </div>
              </div>

              {/* Tabela detalhada */}
              <div className="overflow-x-auto border-t border-gray-100 pt-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Mês</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Mensal</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Setup</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrend.map((m, i) => {
                      const total = m.totalMonthly + m.totalSetup;
                      return (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-2 px-3 text-gray-800 capitalize">{m.month}</td>
                          <td className="py-2 px-3 text-right text-blue-600 font-medium">
                            {m.totalMonthly > 0 ? formatCurrency(m.totalMonthly) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right text-orange-500">
                            {m.totalSetup > 0 ? formatCurrency(m.totalSetup) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-gray-900">
                            {total > 0 ? formatCurrency(total) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>

        {/* ── Row 2: 4 Metric cards with meta ────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => {
            const pct = card.meta > 0 ? (card.value / card.meta) * 100 : 0;
            return (
              <Card key={card.key} padding="md">
                <div className="flex items-center gap-3">
                  <DonutChart percentage={pct} color={card.color} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 mb-0.5">{card.label}</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{formatCurrency(card.value)}</p>
                    <p className="text-[10px] text-gray-400 mb-1">{card.sub}</p>
                    <MetaInput metaKey={card.key} defaultValue={card.meta}
                      onSave={(v) => updateMeta(card.key, v)} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── Row 3: Ticket Médio por Produto ─────────────────────────── */}
        {ticketMedio.length > 0 && (
          <Card padding="md">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Ticket médio por produto</h3>
            <div className="space-y-4">
              {ticketMedio.map((t) => {
                const barPct = maxTicket > 0 ? Math.max((t.currentAvg / maxTicket) * 100, 3) : 0;
                return (
                  <div key={t.product}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{t.product}</span>
                        <span className="text-sm text-blue-600 font-bold">{formatCurrency(t.currentAvg)}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        Mês anterior: {formatCurrency(t.lastMonthAvg)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-6 relative overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full flex items-center justify-center transition-all duration-700"
                        style={{ width: `${barPct}%`, minWidth: '60px' }}>
                        <span className="text-[10px] font-bold text-white">{formatCurrency(t.currentAvg)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* ── Row 4: Vendas por Cliente ────────────────────────────────── */}
        {salesByClient.length > 0 && (
          <Card padding="md">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Vendas por Cliente</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Nome</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">Produto</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Mensal</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Setup</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByClient.map((sale) => (
                    <tr key={sale.dealId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-3 text-gray-800">{sale.clientName}</td>
                      <td className="py-2.5 px-3 text-gray-500">{sale.products}</td>
                      <td className="py-2.5 px-3 text-right text-gray-800">{formatCurrency(sale.monthlyValue)}</td>
                      <td className="py-2.5 px-3 text-right text-gray-400">{sale.setupValue > 0 ? formatCurrency(sale.setupValue) : "—"}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{formatCurrency(sale.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
