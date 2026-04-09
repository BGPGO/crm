"use client";

import { useState, useEffect } from "react";
import { FileText, FilePlus, FileX, ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import ContractGenerator from "./ContractGenerator";
import AditivoGenerator from "./AditivoGenerator";
import DistratoGenerator from "./DistratoGenerator";
import SentDocuments from "./SentDocuments";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SavedWitness {
  id: string;
  nome: string;
  cpf: string;
  email: string;
}

interface ContractHubProps {
  dealId: string;
  deal: {
    title: string;
    value: number | null;
    contact?: { name: string; email: string; phone: string } | null;
    organization?: {
      name: string;
      cnpj: string;
      address: string;
      email: string;
    } | null;
    products?: Array<{ product: { name: string } }>;
  };
}

type ContractTab = "contrato" | "aditivo" | "distrato" | "enviados";

const TABS: { key: ContractTab; label: string; icon: typeof FileText }[] = [
  { key: "contrato", label: "Contrato", icon: FileText },
  { key: "aditivo", label: "Aditivo", icon: FilePlus },
  { key: "distrato", label: "Distrato", icon: FileX },
  { key: "enviados", label: "Enviados", icon: ClipboardList },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ContractHub({ dealId, deal }: ContractHubProps) {
  const [activeTab, setActiveTab] = useState<ContractTab>("contrato");
  const [witnesses, setWitnesses] = useState<SavedWitness[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: SavedWitness[] }>("/contract-witnesses")
      .then((res) => {
        if (!cancelled) setWitnesses(res.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "contrato" && (
        <ContractGenerator dealId={dealId} deal={deal} />
      )}

      {activeTab === "aditivo" && (
        <AditivoGenerator
          dealId={dealId}
          deal={deal}
          witnesses={witnesses}
        />
      )}

      {activeTab === "distrato" && (
        <DistratoGenerator
          dealId={dealId}
          deal={deal}
          witnesses={witnesses}
        />
      )}

      {activeTab === "enviados" && <SentDocuments dealId={dealId} />}
    </div>
  );
}
