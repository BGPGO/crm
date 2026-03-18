"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface NodeConfigProps {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

interface LostReason {
  id: string;
  name: string;
}

export default function MarkLostNode({ config, onChange }: NodeConfigProps) {
  const [reasons, setReasons] = useState<LostReason[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReasons() {
      try {
        const res = await api.get<{ data: LostReason[] }>("/lost-reasons");
        setReasons(res.data || []);
      } catch {
        // API might not be ready
      } finally {
        setLoading(false);
      }
    }
    loadReasons();
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Motivo da perda
        </label>
        {loading ? (
          <div className="h-9 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <select
            value={config.lostReasonId || ""}
            onChange={(e) =>
              onChange({ ...config, lostReasonId: e.target.value })
            }
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
          >
            <option value="">Selecionar motivo...</option>
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Ou motivo livre
        </label>
        <input
          type="text"
          value={config.reason || ""}
          onChange={(e) => onChange({ ...config, reason: e.target.value })}
          placeholder="Descreva o motivo..."
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
