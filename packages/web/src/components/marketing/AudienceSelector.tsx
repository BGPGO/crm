"use client";

import { useState, useEffect } from "react";
import { Users, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface Segment {
  id: string;
  name: string;
  contactCount: number;
}

interface SegmentsResponse {
  data: Segment[];
}

interface AudienceSelectorProps {
  selectedSegmentId: string | null;
  onChange: (segmentId: string | null) => void;
}

export default function AudienceSelector({
  selectedSegmentId,
  onChange,
}: AudienceSelectorProps) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [segResult, contactResult] = await Promise.all([
          api.get<SegmentsResponse>("/segments"),
          api.get<{ meta: { total: number } }>("/contacts?limit=1"),
        ]);
        setSegments(segResult.data);
        setTotalContacts(contactResult.meta.total);
      } catch (err) {
        console.error("Erro ao buscar segmentos:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" />
        Carregando segmentos...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* All contacts option */}
      <label
        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          selectedSegmentId === null
            ? "border-blue-500 bg-blue-50"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <input
          type="radio"
          name="audience"
          checked={selectedSegmentId === null}
          onChange={() => onChange(null)}
          className="text-blue-600 focus:ring-blue-500"
        />
        <Users size={16} className="text-gray-400" />
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900">
            Todos os contatos
          </span>
          {totalContacts !== null && (
            <span className="ml-2 text-xs text-gray-500">
              ({totalContacts} contatos)
            </span>
          )}
        </div>
      </label>

      {/* Segment options */}
      {segments.map((segment) => (
        <label
          key={segment.id}
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            selectedSegmentId === segment.id
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <input
            type="radio"
            name="audience"
            checked={selectedSegmentId === segment.id}
            onChange={() => onChange(segment.id)}
            className="text-blue-600 focus:ring-blue-500"
          />
          <Users size={16} className="text-gray-400" />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-900">
              {segment.name}
            </span>
            <span className="ml-2 text-xs text-gray-500">
              ({segment.contactCount} contatos)
            </span>
          </div>
        </label>
      ))}

      {segments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          Nenhum segmento criado. A campanha será enviada para todos os contatos.
        </p>
      )}

      {/* TIME BGP notice */}
      <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <span className="text-blue-500 text-sm mt-0.5">👥</span>
        <div>
          <p className="text-xs font-medium text-blue-700">TIME BGP recebe cópia automaticamente</p>
          <p className="text-[10px] text-blue-500 mt-0.5">
            Além do segmento escolhido, os 16 membros do time interno recebem uma cópia
            com [TIME] no assunto para acompanhamento.
          </p>
        </div>
      </div>
    </div>
  );
}
