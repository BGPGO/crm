"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ChevronLeft, ChevronRight, Eye, CalendarClock, Send, Loader2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatters";

interface NewsletterConfig {
  enabled: boolean;
  recipients: string[];
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

interface Edition {
  id: string;
  subject: string;
  status: "DRAFT" | "SENT";
  isTest: boolean;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string;
  uniqueOpens: number;
  uniqueClicks: number;
  openRate: number | null;
  clickRate: number | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface EditionsResponse {
  data: Edition[];
  meta: Meta;
}

const statusConfig: Record<
  Edition["status"],
  { variant: "gray" | "green"; label: string }
> = {
  DRAFT: { variant: "gray", label: "Rascunho" },
  SENT: { variant: "green", label: "Enviada" },
};

function AutomationPanel({ onEditionCreated }: { onEditionCreated: () => void }) {
  const [config, setConfig] = useState<NewsletterConfig | null>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<"test" | "full" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .get<{ data: NewsletterConfig }>("/newsletters/config")
      .then((r) => {
        setConfig(r.data);
        setRecipientsText((r.data.recipients || []).join("\n"));
      })
      .catch(() => setMessage({ ok: false, text: "Erro ao carregar a automação." }));
  }, []);

  const parseRecipients = () =>
    recipientsText
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

  const save = async (patch: { enabled?: boolean; recipients?: string[] }) => {
    setSaving(true);
    setMessage(null);
    try {
      const r = await api.put<{ data: NewsletterConfig }>("/newsletters/config", patch);
      setConfig(r.data);
      setRecipientsText((r.data.recipients || []).join("\n"));
      setMessage({ ok: true, text: "Configuração salva." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar.";
      setMessage({ ok: false, text: msg });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (mode: "test" | "full") => {
    if (mode === "test" && !testEmail.trim()) {
      setMessage({ ok: false, text: "Informe o email de teste." });
      return;
    }
    if (
      mode === "full" &&
      !window.confirm(
        `Montar a edição AGORA e enviar pra lista (${config?.recipients.length || 0} destinatários)?`
      )
    ) {
      return;
    }
    setRunning(mode);
    setMessage(null);
    try {
      await api.post(
        "/newsletters/run-now",
        mode === "test" ? { testEmail: testEmail.trim() } : {}
      );
      setMessage({
        ok: true,
        text:
          mode === "test"
            ? `Edição de teste montada e enviada pra ${testEmail.trim()}.`
            : "Edição montada e enviada pra lista.",
      });
      onEditionCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao executar.";
      setMessage({ ok: false, text: msg });
    } finally {
      setRunning(null);
    }
  };

  if (!config) {
    return <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-petrol-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Envio automático — toda segunda às 5h
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Monta a edição sozinho (notícias dos portais + posts do BGP Academy) e envia
              pra lista abaixo, com tracking por botão.
              {config.lastRunAt && (
                <>
                  {" "}Última execução: {formatDate(config.lastRunAt)}
                  {config.lastRunStatus ? ` — ${config.lastRunStatus}` : ""}
                </>
              )}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span
            className={`text-xs font-medium ${config.enabled ? "text-green-600" : "text-gray-400"}`}
          >
            {config.enabled ? "Ativa" : "Pausada"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            disabled={saving}
            onClick={() => save({ enabled: !config.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? "bg-petrol-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Destinatários ({parseRecipients().length}) — um email por linha
          </label>
          <textarea
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            rows={4}
            placeholder={"cliente1@empresa.com.br\ncliente2@empresa.com.br"}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-500 font-mono"
          />
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => save({ recipients: parseRecipients() })}
            >
              Salvar lista
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Testar agora (monta a edição desta semana e envia só pra você)
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="seu@email.com.br"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-petrol-500"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={running !== null}
                onClick={() => runNow("test")}
              >
                {running === "test" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Teste
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              A montagem leva ~30s (feeds + curadoria por IA).
            </p>
          </div>

          <Button
            variant="primary"
            size="sm"
            disabled={running !== null || config.recipients.length === 0}
            onClick={() => runNow("full")}
          >
            {running === "full" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Montar e enviar pra lista agora
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            message.ok
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}

export default function NewsletterPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fetchEditions = useCallback(async (currentPage: number) => {
    setError(null);
    setLoading(true);
    try {
      const result = await api.get<EditionsResponse>(
        `/newsletters?page=${currentPage}&limit=20`
      );
      setEditions(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error("Erro ao buscar edições:", err);
      setError("Erro ao carregar dados. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEditions(page);
  }, [page, fetchEditions]);

  const formatRate = (rate: number | null) => {
    if (rate === null || rate === undefined) return "—";
    return `${(rate * 100).toFixed(1)}%`;
  };

  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Header title="Newsletter" breadcrumb={["Marketing", "Newsletter"]} />
      <MarketingNav />

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={() => fetchEditions(page)}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <main className="flex-1 p-4 sm:p-6 space-y-4">
        <AutomationPanel onEditionCreated={() => fetchEditions(1)} />

        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Assunto</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="hidden md:table-cell">Destinatários</TableHeader>
                <TableHeader className="hidden lg:table-cell">Abertura</TableHeader>
                <TableHeader className="hidden lg:table-cell">Cliques</TableHeader>
                <TableHeader className="hidden md:table-cell">Data</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : editions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-8 text-center text-sm text-gray-500">
                      Nenhuma edição ainda. A primeira aparece aqui assim que for
                      criada ou enviada.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                editions.map((edition) => {
                  const status = statusConfig[edition.status] || statusConfig.DRAFT;
                  return (
                    <TableRow key={edition.id}>
                      <TableCell>
                        <Link
                          href={`/marketing/newsletter/${edition.id}`}
                          className="font-medium text-gray-900 hover:text-petrol-600"
                        >
                          {edition.subject}
                        </Link>
                        {edition.isTest && (
                          <span className="ml-2 text-xs text-gray-400">(teste)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {edition.recipientCount}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatRate(edition.openRate)}
                        <span className="text-xs text-gray-400 ml-1">
                          ({edition.uniqueOpens})
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {formatRate(edition.clickRate)}
                        <span className="text-xs text-gray-400 ml-1">
                          ({edition.uniqueClicks})
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDate(edition.sentAt || edition.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/marketing/newsletter/${edition.id}`}
                          className="text-gray-400 hover:text-petrol-600"
                          aria-label="Ver detalhes"
                        >
                          <Eye size={16} />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {start}–{end} de {meta.total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="p-1.5 rounded border border-gray-300 text-gray-500 disabled:opacity-40"
                aria-label="Próxima página"
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
