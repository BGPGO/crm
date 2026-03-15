"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import MarketingNav from "@/components/marketing/MarketingNav";
import { Users, Filter, TrendingUp, Upload, Mail, Zap } from "lucide-react";
import { api } from "@/lib/api";

interface SummaryData {
  totalLeads: number;
  activeSegments: number;
  averageScore: number;
}

export default function MarketingDashboardPage() {
  const [summary, setSummary] = useState<SummaryData>({
    totalLeads: 0,
    activeSegments: 0,
    averageScore: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const [contactsRes, segmentsRes, scoresRes] = await Promise.allSettled([
          api.get<{ meta: { total: number } }>("/contacts?limit=1"),
          api.get<{ data: unknown[] }>("/segments"),
          api.get<{ averageScore: number }>("/lead-scores/summary"),
        ]);

        setSummary({
          totalLeads:
            contactsRes.status === "fulfilled" ? contactsRes.value.meta.total : 0,
          activeSegments:
            segmentsRes.status === "fulfilled" ? segmentsRes.value.data.length : 0,
          averageScore:
            scoresRes.status === "fulfilled" ? scoresRes.value.averageScore : 0,
        });
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    }

    fetchSummary();
  }, []);

  const summaryCards = [
    {
      label: "Total de Leads",
      value: summary.totalLeads,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Segmentos Ativos",
      value: summary.activeSegments,
      icon: Filter,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Score Médio",
      value: summary.averageScore,
      icon: TrendingUp,
      color: "bg-green-50 text-green-600",
    },
  ];

  const quickLinks = [
    {
      label: "Leads",
      description: "Visualize e gerencie seus leads com filtros avançados",
      href: "/marketing/leads",
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Importar Leads",
      description: "Importe contatos via arquivo CSV",
      href: "/marketing/leads/import",
      icon: Upload,
      color: "bg-orange-50 text-orange-600",
    },
    {
      label: "Segmentos",
      description: "Crie segmentos dinâmicos de contatos",
      href: "/marketing/segments",
      icon: Filter,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Lead Scoring",
      description: "Configure regras de pontuação de leads",
      href: "/marketing/lead-scoring",
      icon: TrendingUp,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Emails",
      description: "Campanhas e templates de email",
      href: "/marketing/emails",
      icon: Mail,
      color: "bg-cyan-50 text-cyan-600",
    },
    {
      label: "Automações",
      description: "Fluxos automáticos de nutrição",
      href: "/marketing/automations",
      icon: Zap,
      color: "bg-yellow-50 text-yellow-600",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Marketing" breadcrumb={["Marketing"]} />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} padding="md">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${card.color}`}>
                    <Icon size={22} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{card.label}</p>
                    {loading ? (
                      <div className="h-7 w-16 bg-gray-100 rounded animate-pulse mt-1" />
                    ) : (
                      <p className="text-2xl font-semibold text-gray-900">
                        {card.value}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Quick links */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Acesso rápido</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}>
                  <Card
                    padding="md"
                    className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl flex-shrink-0 ${link.color}`}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {link.label}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {link.description}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
