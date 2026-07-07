"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Badge from "@/components/ui/Badge";
import MarketingNav from "@/components/marketing/MarketingNav";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import { ArrowLeft, Users, MailOpen, MousePointerClick, Percent } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

interface SlotMetric {
  slot: string;
  label: string;
  url: string;
  uniqueClicks: number;
  totalClicks: number;
}

interface EditionDetail {
  id: string;
  subject: string;
  status: "DRAFT" | "SENT";
  isTest: boolean;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string;
  metrics: {
    recipientCount: number;
    uniqueOpens: number;
    totalOpens: number;
    uniqueClicks: number;
    totalClicks: number;
    slots: SlotMetric[];
  };
  recentEvents: {
    id: string;
    type: "OPEN" | "CLICK";
    slot: string | null;
    email: string | null;
    createdAt: string;
  }[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wide">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function NewsletterDetailPage() {
  const params = useParams<{ id: string }>();
  const [edition, setEdition] = useState<EditionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEdition = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<{ data: EditionDetail }>(
        `/newsletters/${params.id}`
      );
      setEdition(result.data);
    } catch (err) {
      console.error("Erro ao buscar edição:", err);
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchEdition();
  }, [fetchEdition]);

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header
        title={edition?.subject || "Newsletter"}
        breadcrumb={["Marketing", "Newsletter", "Detalhe"]}
      />
      <MarketingNav />

      <main className="flex-1 p-4 sm:p-6 space-y-6">
        <Link
          href="/marketing/newsletter"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-petrol-600"
        >
          <ArrowLeft size={14} />
          Todas as edições
        </Link>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-red-700">{error}</span>
            <button
              onClick={fetchEdition}
              className="text-sm text-red-600 font-medium hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : edition ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={edition.status === "SENT" ? "green" : "gray"}>
                {edition.status === "SENT" ? "Enviada" : "Rascunho"}
              </Badge>
              {edition.isTest && <Badge variant="yellow">Teste</Badge>}
              <span className="text-sm text-gray-500">
                {edition.sentAt
                  ? `Enviada em ${formatDate(edition.sentAt)}`
                  : `Criada em ${formatDate(edition.createdAt)}`}
              </span>
            </div>

            {/* Cards resumo */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={Users}
                label="Destinatários"
                value={String(edition.metrics.recipientCount)}
              />
              <StatCard
                icon={MailOpen}
                label="Aberturas"
                value={String(edition.metrics.uniqueOpens)}
                hint={`${edition.metrics.totalOpens} no total · ${pct(
                  edition.metrics.uniqueOpens,
                  edition.metrics.recipientCount
                )} dos destinatários`}
              />
              <StatCard
                icon={MousePointerClick}
                label="Cliques (pessoas)"
                value={String(edition.metrics.uniqueClicks)}
                hint={`${edition.metrics.totalClicks} cliques no total`}
              />
              <StatCard
                icon={Percent}
                label="CTR"
                value={pct(edition.metrics.uniqueClicks, edition.metrics.recipientCount)}
                hint="pessoas que clicaram / destinatários"
              />
            </div>

            {/* Cliques por botão */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Cliques por botão
              </h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Botão</TableHeader>
                      <TableHeader className="hidden md:table-cell">Destino</TableHeader>
                      <TableHeader>Pessoas</TableHeader>
                      <TableHeader>Cliques</TableHeader>
                      <TableHeader className="hidden sm:table-cell">
                        % destinatários
                      </TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {edition.metrics.slots.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="py-6 text-center text-sm text-gray-500">
                            Nenhum clique registrado ainda.
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      edition.metrics.slots.map((slot) => (
                        <TableRow key={slot.slot}>
                          <TableCell>
                            <div className="font-medium text-gray-900">{slot.label}</div>
                            <div className="text-xs text-gray-400 font-mono">
                              {slot.slot}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {slot.url ? (
                              <a
                                href={slot.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-petrol-600 hover:underline break-all"
                              >
                                {slot.url.length > 60
                                  ? slot.url.slice(0, 60) + "…"
                                  : slot.url}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>{slot.uniqueClicks}</TableCell>
                          <TableCell>{slot.totalClicks}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {pct(slot.uniqueClicks, edition.metrics.recipientCount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            {/* Últimos eventos */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Últimos eventos
              </h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Tipo</TableHeader>
                      <TableHeader>Botão</TableHeader>
                      <TableHeader className="hidden sm:table-cell">Email</TableHeader>
                      <TableHeader>Quando</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {edition.recentEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="py-6 text-center text-sm text-gray-500">
                            Nenhum evento ainda — aberturas e cliques aparecem aqui em
                            tempo real.
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      edition.recentEvents.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell>
                            <Badge variant={ev.type === "CLICK" ? "blue" : "gray"}>
                              {ev.type === "CLICK" ? "Clique" : "Abertura"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {ev.slot ? (
                              <span className="text-xs font-mono text-gray-600">
                                {ev.slot}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-gray-600">
                            {ev.email || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatDate(ev.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
