"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";
import {
  ClipboardList,
  Trash2,
  Eye,
  Loader2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SentDocument {
  id: string;
  autentiqueDocumentId: string;
  documentName: string;
  documentType: string;
  signerEmails: string;
  status: string;
  signedCount: number;
  totalSigners: number;
  lastCheckedAt: string | null;
  metadata: any;
  dealId: string | null;
  createdAt: string;
}

interface SignerDetail {
  name: string;
  email: string;
  action: string;
  signed: boolean;
  rejected: boolean;
  signed_at: string | null;
  rejected_at: string | null;
  viewed: boolean;
  link?: string;
}

interface SentDocumentsProps {
  dealId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSigners(metadata: any): SignerDetail[] {
  if (!metadata) return [];
  const signatures = metadata.signatures || metadata.signers || [];
  return signatures.map((s: any) => ({
    name: s.name || s.public_name || "—",
    email: s.email || "—",
    action: s.action?.name || s.action || "SIGN",
    signed: s.signed === true || false,
    rejected: s.rejected === true || false,
    signed_at: s.signed_at || null,
    rejected_at: s.rejected_at || null,
    viewed: s.viewed === true || false,
    link: s.link?.short_link || s.link || "",
  }));
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

function getActionLabel(action: string): string {
  if (action === "SIGN_AS_A_WITNESS") return "Testemunha";
  if (action === "SIGN") return "Assinante";
  return action;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SentDocuments({ dealId }: SentDocumentsProps) {
  const [documents, setDocuments] = useState<SentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<SentDocument | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const url = "/sent-documents" + (dealId ? `?dealId=${dealId}` : "");
      const res = await api.get<{ data: SentDocument[] }>(url);
      setDocuments(res.data ?? []);
    } catch (err: any) {
      setToast({ type: "error", message: "Erro ao carregar documentos" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  // ── Status refresh ─────────────────────────────────────────────────────────

  const handleRefreshStatus = async (doc: SentDocument) => {
    setRefreshing(doc.id);
    try {
      await api.post(`/sent-documents/${doc.id}/check-status`, {});
      // Reload list to get updated data
      const url = "/sent-documents" + (dealId ? `?dealId=${dealId}` : "");
      const res = await api.get<{ data: SentDocument[] }>(url);
      const updated = (res.data ?? []).find((d) => d.id === doc.id);
      if (updated) {
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? updated : d))
        );
        if (selectedDoc?.id === doc.id) setSelectedDoc(updated);
      }
      setToast({ type: "success", message: "Status atualizado" });
    } catch {
      setToast({ type: "error", message: "Erro ao atualizar status" });
    } finally {
      setRefreshing(null);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    let successCount = 0;
    for (const doc of documents) {
      try {
        await api.post(`/sent-documents/${doc.id}/check-status`, {});
        successCount++;
      } catch {
        // continue
      }
    }
    await fetchDocuments();
    setToast({
      type: "success",
      message: `${successCount}/${documents.length} documentos atualizados`,
    });
    setRefreshingAll(false);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmDeleteId(null);
    try {
      await api.delete(`/sent-documents/${id}`);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setToast({ type: "success", message: "Documento removido" });
    } catch {
      setToast({ type: "error", message: "Erro ao remover documento" });
    } finally {
      setDeleting(null);
    }
  };

  // ── Badge helpers ──────────────────────────────────────────────────────────

  const getStatusBadge = (doc: SentDocument) => {
    if (doc.status === "signed") {
      return <Badge variant="green">Assinado</Badge>;
    }
    if (doc.totalSigners > 0) {
      return (
        <Badge variant="yellow">
          {doc.signedCount}/{doc.totalSigners} assinaram
        </Badge>
      );
    }
    return <Badge variant="yellow">Pendente</Badge>;
  };

  const getDocTypeBadge = (type: string) => {
    const t = type?.toLowerCase();
    if (t === "aditivo") return <Badge variant="purple">{type}</Badge>;
    if (t === "distrato") return <Badge variant="red">{type}</Badge>;
    return <Badge variant="blue">{type || "Contrato"}</Badge>;
  };

  const getSignerStatusBadge = (signer: SignerDetail) => {
    if (signer.rejected) return <Badge variant="red">Recusou</Badge>;
    if (signer.signed) {
      return (
        <Badge variant="green">
          Assinou
          {signer.signed_at && (
            <span className="ml-1 opacity-70">
              {new Date(signer.signed_at).toLocaleDateString("pt-BR")}
            </span>
          )}
        </Badge>
      );
    }
    return <Badge variant="yellow">Pendente</Badge>;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const docToDelete = documents.find((d) => d.id === confirmDeleteId);

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <ClipboardList size={18} />
            Documentos Enviados
          </div>
          {documents.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshAll}
              disabled={refreshingAll}
            >
              {refreshingAll ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Atualizar Todos
            </Button>
          )}
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-gray-400 text-center py-8 text-sm">
              Nenhum documento enviado ainda.
            </p>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeader>Documento</TableHeader>
                  <TableHeader>Data de Envio</TableHeader>
                  <TableHeader>Tipo</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Última Verificação</TableHeader>
                  <TableHeader className="w-36">Ações</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {doc.documentName}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {doc.createdAt ? formatDateTime(doc.createdAt) : "—"}
                    </TableCell>
                    <TableCell>{getDocTypeBadge(doc.documentType)}</TableCell>
                    <TableCell>{getStatusBadge(doc)}</TableCell>
                    <TableCell className="text-xs text-gray-400 whitespace-nowrap">
                      {doc.lastCheckedAt ? timeAgo(doc.lastCheckedAt) : "Nunca"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {/* Refresh */}
                        <button
                          title="Atualizar status"
                          onClick={() => handleRefreshStatus(doc)}
                          disabled={refreshing === doc.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                          {refreshing === doc.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <RefreshCw size={15} />
                          )}
                        </button>

                        {/* View signers */}
                        <button
                          title="Ver assinantes"
                          onClick={() => setSelectedDoc(doc)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <Eye size={15} />
                        </button>

                        {/* Delete */}
                        <button
                          title="Remover"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          disabled={deleting === doc.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                        >
                          {deleting === doc.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Signers modal */}
      <Modal
        isOpen={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={`Assinantes — ${selectedDoc?.documentName ?? ""}`}
        size="md"
      >
        <div className="space-y-3">
          {/* Refresh button inside modal */}
          {selectedDoc && (
            <div className="flex justify-end mb-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleRefreshStatus(selectedDoc)}
                disabled={refreshing === selectedDoc.id}
              >
                {refreshing === selectedDoc.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Atualizar
              </Button>
            </div>
          )}

          {selectedDoc && parseSigners(selectedDoc.metadata).length > 0 ? (
            parseSigners(selectedDoc.metadata).map((signer, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200"
              >
                <div className="space-y-0.5 min-w-0 flex-1">
                  <p className="font-medium text-sm text-gray-800 truncate">
                    {signer.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{signer.email}</p>
                  <Badge variant="gray" className="mt-1">
                    {getActionLabel(signer.action)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {getSignerStatusBadge(signer)}
                  {signer.link && (
                    <a
                      href={signer.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Link de assinatura"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-center py-4 text-sm">
              Nenhum detalhe de assinante disponível. Clique em "Atualizar" para
              buscar.
            </p>
          )}

          {selectedDoc?.lastCheckedAt && (
            <p className="text-xs text-gray-400 text-center pt-2">
              Última verificação: {timeAgo(selectedDoc.lastCheckedAt)}
            </p>
          )}
        </div>
      </Modal>

      {/* Confirm delete modal */}
      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Remover documento?"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          O registro{" "}
          <span className="font-medium text-gray-800">
            "{docToDelete?.documentName}"
          </span>{" "}
          será removido permanentemente do sistema. Isso não cancela a assinatura
          no Autentique.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmDeleteId(null)}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
            loading={deleting === confirmDeleteId}
          >
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  );
}
