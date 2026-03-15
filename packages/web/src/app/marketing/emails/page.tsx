"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Button from "@/components/ui/Button";
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
import { Plus, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: CampaignStatus;
  recipientCount: number;
  openRate: number | null;
  clickRate: number | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CampaignsResponse {
  data: Campaign[];
  meta: Meta;
}

const statusConfig: Record<
  CampaignStatus,
  { variant: "gray" | "blue" | "yellow" | "green" | "red"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  SCHEDULED: { variant: "blue", label: "Agendado" },
  SENDING: { variant: "yellow", label: "Enviando" },
  SENT: { variant: "green", label: "Enviado" },
  FAILED: { variant: "red", label: "Falhou" },
};

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [meta, setMeta] = useState<Meta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchCampaigns = useCallback(
    async (currentPage: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          limit: "20",
        });
        if (statusFilter) params.set("status", statusFilter);

        const result = await api.get<CampaignsResponse>(
          `/email-campaigns?${params.toString()}`
        );
        setCampaigns(result.data);
        setMeta(result.meta);
      } catch (err) {
        console.error("Erro ao buscar campanhas:", err);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchCampaigns(page);
  }, [page, fetchCampaigns]);

  useEffect(() => {
    setPage(1);
    fetchCampaigns(1);
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatRate = (rate: number | null) => {
    if (rate === null || rate === undefined) return "\u2014";
    return `${(rate * 100).toFixed(1)}%`;
  };

  const getDateDisplay = (campaign: Campaign) => {
    if (campaign.sentAt) return formatDate(campaign.sentAt);
    if (campaign.scheduledAt) return formatDate(campaign.scheduledAt);
    return formatDate(campaign.createdAt);
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Email Marketing" breadcrumb={["Marketing", "Emails"]} />
      <MarketingNav />

      <main className="flex-1 p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SCHEDULED">Agendado</option>
              <option value="SENDING">Enviando</option>
              <option value="SENT">Enviado</option>
              <option value="FAILED">Falhou</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/marketing/emails/templates">
              <Button variant="secondary" size="sm">
                Templates
              </Button>
            </Link>
            <Link href="/marketing/emails/new">
              <Button variant="primary" size="sm">
                <Plus size={14} />
                Nova Campanha
              </Button>
            </Link>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>
              <TableHeader>Assunto</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Destinatários</TableHeader>
              <TableHeader>Abertura</TableHeader>
              <TableHeader>Cliques</TableHeader>
              <TableHeader>Data</TableHeader>
              <TableHeader></TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-gray-100 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="py-10 text-center text-gray-400 text-sm">
                    Nenhuma campanha encontrada.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => {
                const config = statusConfig[campaign.status] ?? statusConfig.DRAFT;
                return (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        href={`/marketing/emails/${campaign.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600 max-w-xs truncate">
                      {campaign.subject}
                    </TableCell>
                    <TableCell>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {campaign.recipientCount ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {formatRate(campaign.openRate)}
                    </TableCell>
                    <TableCell className="text-gray-700">
                      {formatRate(campaign.clickRate)}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {getDateDisplay(campaign)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/marketing/emails/${campaign.id}`}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors inline-flex"
                        title="Ver detalhes"
                      >
                        <Eye size={14} />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && meta.total > 0 && (
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Mostrando {start}&ndash;{end} de {meta.total} campanhas
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={meta.page <= 1}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium">
                {meta.page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={meta.page >= meta.totalPages}
                className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
