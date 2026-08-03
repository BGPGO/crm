"use client";

/**
 * Anúncios WhatsApp (CTWA) — clicks nas campanhas × conversas iniciadas.
 *
 * Fontes: Meta Insights (via API interna do ContIA) + conversas do CRM cuja
 * 1ª mensagem trouxe referral de anúncio (ground truth, com contato vinculado).
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, MousePointerClick, MessageCircle, Users, Wallet, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime, formatPhone } from "@/lib/formatters";

interface CrmConversation {
  conversationId: string;
  startedAt: string;
  adId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

interface CtwaAd {
  adId: string;
  adName: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversationsStarted: number;
}

interface CtwaCampaign {
  campaignId: string;
  campaignName: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversationsStarted: number;
  ads: CtwaAd[];
  crmConversations: CrmConversation[];
}

interface CtwaReport {
  from: string;
  to: string;
  metaAvailable: boolean;
  totals: {
    spend: number;
    clicks: number;
    linkClicks: number;
    conversationsStartedMeta: number;
    conversationsInCrm: number;
  };
  campaigns: CtwaCampaign[];
  conversationsWithoutMatch: CrmConversation[];
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub?: string }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-petrol-50 dark:bg-petrol-900/30 text-petrol-600 dark:text-petrol-400">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate">{value}</p>
          {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function ContactList({ conversations }: { conversations: CrmConversation[] }) {
  if (conversations.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {conversations.map((c) => (
        <div key={c.conversationId} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <MessageCircle size={12} className="text-green-500 shrink-0" />
          {c.contactId ? (
            <Link href={`/contacts/${c.contactId}`} className="font-medium text-petrol-600 dark:text-petrol-400 hover:underline">
              {c.contactName || "Sem nome"}
            </Link>
          ) : (
            <span className="font-medium">{c.contactName || "Contato não vinculado"}</span>
          )}
          {c.contactPhone && <span className="text-gray-400">{formatPhone(c.contactPhone)}</span>}
          <span className="text-gray-400 ml-auto shrink-0">{formatDateTime(c.startedAt)}</span>
        </div>
      ))}
    </div>
  );
}

export default function WabaAnunciosPage() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(today());
  const [report, setReport] = useState<CtwaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true);
    try {
      const res = await api.get<{ data: CtwaReport }>(`/reports/ctwa-campaigns?from=${f}&to=${t}`);
      setReport(res.data);
    } catch (err) {
      console.error("Erro ao carregar relatório CTWA:", err);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campaigns = (report?.campaigns ?? []).filter(
    (c) => c.conversationsStarted > 0 || c.crmConversations.length > 0 || c.objective.toUpperCase().includes("MESSAGES")
  );
  const outras = (report?.campaigns ?? []).filter((c) => !campaigns.includes(c));

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      {/* Filtro de período */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5" />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5" />
        </div>
        <button onClick={() => load(from, to)}
          className="px-4 py-1.5 text-sm font-medium rounded-lg bg-petrol-600 text-white hover:bg-petrol-700 transition-colors">
          Aplicar
        </button>
        {report && !report.metaAvailable && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Meta Insights indisponível — mostrando só as conversas registradas no CRM
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-petrol-500" size={28} />
        </div>
      ) : !report ? (
        <Card padding="lg" className="text-center text-sm text-gray-500">Erro ao carregar o relatório. Tente novamente.</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard icon={Wallet} label="Investimento" value={formatCurrency(report.totals.spend)} />
            <KpiCard icon={MousePointerClick} label="Cliques (total)" value={report.totals.clicks.toLocaleString("pt-BR")} />
            <KpiCard icon={MousePointerClick} label="Cliques no link" value={report.totals.linkClicks.toLocaleString("pt-BR")} />
            <KpiCard icon={MessageCircle} label="Conversas iniciadas · Meta" value={report.totals.conversationsStartedMeta.toLocaleString("pt-BR")} sub="métrica da Meta (7 dias)" />
            <KpiCard icon={Users} label="Conversas no CRM" value={report.totals.conversationsInCrm.toLocaleString("pt-BR")} sub="1ª mensagem veio de anúncio" />
          </div>

          {/* Campanhas com conversa */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Campanhas de WhatsApp</h2>
              <p className="text-[11px] text-gray-400">Clique na campanha para ver anúncios e quem iniciou conversa</p>
            </div>
            {campaigns.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">Nenhuma campanha com conversa iniciada no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-gray-700">
                      <th className="px-4 py-2 font-medium">Campanha</th>
                      <th className="px-3 py-2 font-medium text-right">Investimento</th>
                      <th className="px-3 py-2 font-medium text-right">Cliques</th>
                      <th className="px-3 py-2 font-medium text-right">Cliques no link</th>
                      <th className="px-3 py-2 font-medium text-right">Conversas · Meta</th>
                      <th className="px-3 py-2 font-medium text-right">Conversas no CRM</th>
                      <th className="px-3 py-2 font-medium text-right">Custo/conversa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const isOpen = !!expanded[c.campaignId];
                      const custoConversa = c.conversationsStarted > 0 ? c.spend / c.conversationsStarted : null;
                      return (
                        <CampaignRows key={c.campaignId} campaign={c} isOpen={isOpen} custoConversa={custoConversa}
                          onToggle={() => setExpanded((p) => ({ ...p, [c.campaignId]: !p[c.campaignId] }))} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Conversas de anúncio sem match nas campanhas do período */}
          {report.conversationsWithoutMatch.length > 0 && (
            <Card padding="sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Conversas de anúncio sem campanha no período ({report.conversationsWithoutMatch.length})
              </h3>
              <p className="text-[11px] text-gray-400 mb-2">
                Chegaram de anúncio (referral da Meta), mas o anúncio não aparece nos insights do período — ex.: clique antigo ou campanha pausada.
              </p>
              <ContactList conversations={report.conversationsWithoutMatch} />
            </Card>
          )}

          {/* Outras campanhas (sem conversa) — contexto */}
          {outras.length > 0 && (
            <details className="text-xs text-gray-400 px-1">
              <summary className="cursor-pointer">Outras campanhas ativas no período sem conversa de WhatsApp ({outras.length})</summary>
              <ul className="mt-2 space-y-0.5 pl-4 list-disc">
                {outras.map((c) => (
                  <li key={c.campaignId}>{c.campaignName} — {formatCurrency(c.spend)} · {c.clicks.toLocaleString("pt-BR")} cliques</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function CampaignRows({ campaign: c, isOpen, custoConversa, onToggle }: {
  campaign: CtwaCampaign; isOpen: boolean; custoConversa: number | null; onToggle: () => void;
}) {
  return (
    <>
      <tr onClick={onToggle}
        className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-gray-100">
            {isOpen ? <ChevronDown size={14} className="shrink-0 text-gray-400" /> : <ChevronRight size={14} className="shrink-0 text-gray-400" />}
            {c.campaignName}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(c.spend)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{c.clicks.toLocaleString("pt-BR")}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{c.linkClicks.toLocaleString("pt-BR")}</td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-green-600 dark:text-green-400">{c.conversationsStarted.toLocaleString("pt-BR")}</td>
        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{c.crmConversations.length.toLocaleString("pt-BR")}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{custoConversa != null ? formatCurrency(custoConversa) : "—"}</td>
      </tr>
      {isOpen && (
        <tr className="border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
          <td colSpan={7} className="px-6 py-3">
            {/* Anúncios da campanha */}
            <div className="space-y-1">
              {c.ads.map((ad) => (
                <div key={ad.adId} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <ExternalLink size={11} className="text-gray-400 shrink-0" />
                  <span className="truncate">{ad.adName}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-gray-400">
                    {formatCurrency(ad.spend)} · {ad.linkClicks.toLocaleString("pt-BR")} cliques no link ·{" "}
                    <span className="text-green-600 dark:text-green-400 font-medium">{ad.conversationsStarted} conversas</span>
                  </span>
                </div>
              ))}
            </div>
            {/* Quem iniciou conversa (CRM) */}
            {c.crmConversations.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  Iniciaram conversa no CRM ({c.crmConversations.length})
                </p>
                <ContactList conversations={c.crmConversations} />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
