"use client";

import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { AlertTriangle, Loader2 } from "lucide-react";

interface LostReason {
  id: string;
  name: string;
}

interface LostReasonsResponse {
  data: LostReason[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  count: number;
  onConfirm: (lostReasonId: string) => Promise<void>;
}

export default function BatchLostModal({ isOpen, onClose, count, onConfirm }: Props) {
  const [lostReasons, setLostReasons] = useState<LostReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load lost reasons on first open
  const loadReasons = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await api.get<LostReasonsResponse>("/lost-reasons?limit=100");
      setLostReasons(res.data ?? []);
      setLoaded(true);
    } catch {
      // silent
    }
  }, [loaded]);

  useEffect(() => {
    if (isOpen) {
      loadReasons();
      setSelectedReasonId("");
      setError(null);
    }
  }, [isOpen, loadReasons]);

  const handleConfirm = async () => {
    if (!selectedReasonId) {
      setError("Selecione um motivo de perda.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConfirm(selectedReasonId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao encerrar negociações.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Encerrar Negociações" size="md">
      <div className="space-y-4">
        {/* Confirmation warning */}
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Tem certeza que deseja encerrar {count} negociação(ões)?
            </p>
            <p className="text-xs text-red-600 mt-1">
              Todas as negociações selecionadas serão marcadas como <strong>Perdidas</strong>.
              Esta ação pode ser revertida individualmente depois.
            </p>
          </div>
        </div>

        {/* Lost reason selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Motivo de Perda <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedReasonId}
            onChange={(e) => {
              setSelectedReasonId(e.target.value);
              setError(null);
            }}
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Selecione o motivo...</option>
            {lostReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !selectedReasonId}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Encerrar {count} negociação(ões)
          </button>
        </div>
      </div>
    </Modal>
  );
}
