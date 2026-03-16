"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Card from "@/components/ui/Card";
import ConversasNav from "@/components/conversas/ConversasNav";
import { MessageSquare, Users, CalendarCheck, Clock, Send, Zap, Settings } from "lucide-react";
import { api } from "@/lib/api";

interface SummaryData {
  totalConversas: number;
  leadsAtivos: number;
  reunioesAgendadas: number;
  followupsPendentes: number;
}

export default function ConversasDashboardPage() {
  const [summary, setSummary] = useState<SummaryData>({
    totalConversas: 0,
    leadsAtivos: 0,
    reunioesAgendadas: 0,
    followupsPendentes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [conversasRes, leadsRes] = await Promise.allSettled([
        api.get<{ meta?: { total: number }; data?: unknown[] }>("/whatsapp/conversations?limit=1"),
        api.get<{ data: Array<{ status: string }> }>("/whatsapp/leads"),
      ]);

      const totalConversas =
        conversasRes.status === "fulfilled"
          ? (conversasRes.value.meta?.total ?? 0)
          : 0;

      let leadsAtivos = 0;
      let reunioesAgendadas = 0;
      let followupsPendentes = 0;

      if (leadsRes.status === "fulfilled" && leadsRes.value.data) {
        const leads = leadsRes.value.data;
        leadsAtivos = leads.filter((l) => l.status === "active").length;
        reunioesAgendadas = leads.filter((l) => l.status === "meetingBooked").length;
        followupsPendentes = leads.filter((l) => l.status === "needsHumanAttention").length;
      }

      setSummary({
        totalConversas,
        leadsAtivos,
        reunioesAgendadas,
        followupsPendentes,
      });
    } catch {
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const summaryCards = [
    {
      label: "Total Conversas",
      value: summary.totalConversas,
      icon: MessageSquare,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Leads Ativos",
      value: summary.leadsAtivos,
      icon: Users,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Reuniões Agendadas",
      value: summary.reunioesAgendadas,
      icon: CalendarCheck,
      color: "bg-purple-50 text-purple-600",
    },
    {
      label: "Follow-ups Pendentes",
      value: summary.followupsPendentes,
      icon: Clock,
      color: "bg-yellow-50 text-yellow-600",
    },
  ];

  const quickLinks = [
    {
      label: "Conversas",
      description: "Veja e responda mensagens do WhatsApp em tempo real",
      href: "/conversas/chat",
      icon: MessageSquare,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "Leads WhatsApp",
      description: "Gerencie leads capturados via WhatsApp",
      href: "/conversas/leads",
      icon: Users,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "Campanhas",
      description: "Envie mensagens em massa para seus contatos",
      href: "/conversas/campanhas",
      icon: Send,
      color: "bg-cyan-50 text-cyan-600",
    },
    {
      label: "Automações",
      description: "Configure follow-ups automáticos",
      href: "/conversas/automacoes",
      icon: Zap,
      color: "bg-yellow-50 text-yellow-600",
    },
    {
      label: "Configuração",
      description: "Conecte sua instância WhatsApp e configure o bot",
      href: "/conversas/configuracao",
      icon: Settings,
      color: "bg-gray-100 text-gray-600",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Conversas" breadcrumb={["Conversas"]} />
      <ConversasNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => fetchSummary()} className="text-sm text-red-600 font-medium hover:underline">Tentar novamente</button>
        </div>
      )}

      <main className="flex-1 p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
