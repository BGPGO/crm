"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Merge, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface ContactInfo {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  deal: { title: string; stage: { name: string } } | null;
}

interface DuplicateAlertData {
  id: string;
  contactA: ContactInfo | null;
  contactB: ContactInfo | null;
  reason: string;
  status: string;
  createdAt: string;
}

export default function DuplicateAlerts() {
  const [alerts, setAlerts] = useState<DuplicateAlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<{ data: DuplicateAlertData[] }>("/duplicate-alerts?status=PENDING");
      setAlerts(res.data || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleMerge = async (alertId: string) => {
    setActing(alertId);
    try {
      await api.post(`/duplicate-alerts/${alertId}/merge`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      alert("Erro ao mesclar contatos");
    } finally {
      setActing(null);
    }
  };

  const handleDismiss = async (alertId: string) => {
    setActing(alertId);
    try {
      await api.post(`/duplicate-alerts/${alertId}/dismiss`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch {
      alert("Erro ao ignorar alerta");
    } finally {
      setActing(null);
    }
  };

  if (loading || alerts.length === 0) return null;

  return (
    <div className="mb-4 mx-4 sm:mx-6">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            {alerts.length} possível(is) duplicata(s)
          </span>
        </div>
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-amber-100 dark:border-amber-800"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {a.contactA?.name || "?"}
                  </span>
                  <span className="text-gray-400">↔</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {a.contactB?.name || "?"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
                  {a.contactA?.deal && (
                    <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0 rounded">
                      {a.contactA.deal.stage.name}
                    </span>
                  )}
                  {a.contactB?.deal && (
                    <span className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0 rounded">
                      {a.contactB.deal.stage.name}
                    </span>
                  )}
                  <span className="truncate">{a.reason}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleMerge(a.id)}
                  disabled={acting === a.id}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  title="Mesclar contatos (mantém o mais avançado)"
                >
                  {acting === a.id ? <Loader2 size={12} className="animate-spin" /> : <Merge size={12} />}
                  Mesclar
                </button>
                <button
                  onClick={() => handleDismiss(a.id)}
                  disabled={acting === a.id}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="São contatos diferentes"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
