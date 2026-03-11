"use client";

import { useState } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import StageColumn from "@/components/pipeline/StageColumn";
import {
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Stage } from "@/components/pipeline/StageColumn";
import type { Deal } from "@/components/pipeline/DealCard";

type FilterType = "active" | "lost" | "won" | "all";

const initialStages: Stage[] = [
  {
    id: "lead",
    name: "Lead",
    color: "bg-slate-400",
    deals: [
      {
        id: "d1",
        title: "Contrato Anual — Empresa XYZ",
        value: 18000,
        company: "Empresa XYZ",
        contact: "Paulo Ferreira",
        daysInStage: 2,
        probability: 20,
        status: "active",
        qualificationCount: 2,
        contactCount: 1,
        nextActivity: { label: "Reunião", date: "10/06/2026 13:41", type: "meeting" },
      },
      {
        id: "d2",
        title: "Licença Software Premium",
        value: 9500,
        company: "TechCorp Ltda",
        contact: "Fernanda Costa",
        daysInStage: 4,
        probability: 25,
        status: "active",
        qualificationCount: 0,
        contactCount: 1,
      },
    ],
  },
  {
    id: "contato-feito",
    name: "Contato Feito",
    color: "bg-blue-400",
    deals: [
      {
        id: "d3",
        title: "Consultoria Estratégica Q2",
        value: 42000,
        company: "Nunes Soluções",
        contact: "Ricardo Nunes",
        daysInStage: 6,
        probability: 35,
        status: "active",
        qualificationCount: 1,
        contactCount: 2,
        nextActivity: { label: "Tarefa", date: "15/06/2026 10:00", type: "task" },
      },
    ],
  },
  {
    id: "marcar-reuniao",
    name: "Marcar Reunião",
    color: "bg-cyan-400",
    deals: [
      {
        id: "d4",
        title: "Implementação ERP",
        value: 75000,
        company: "Beta Indústrias",
        contact: "Ana Beatriz",
        daysInStage: 9,
        probability: 45,
        status: "active",
        qualificationCount: 3,
        contactCount: 2,
      },
    ],
  },
  {
    id: "reuniao-marcada",
    name: "Reunião Marcada",
    color: "bg-yellow-400",
    deals: [
      {
        id: "d5",
        title: "Treinamento Corporativo",
        value: 12000,
        company: "Lima Corp",
        contact: "Marcos Lima",
        daysInStage: 3,
        probability: 50,
        status: "active",
        qualificationCount: 1,
        contactCount: 1,
        nextActivity: { label: "Reunião", date: "10/02/2026 10:00", type: "meeting" },
      },
      {
        id: "d6",
        title: "Tech Solutions — Módulo Fiscal",
        value: 62000,
        company: "Tech Solutions SA",
        contact: "Mariana Lima",
        daysInStage: 12,
        probability: 55,
        status: "active",
        qualificationCount: 2,
        contactCount: 1,
      },
    ],
  },
  {
    id: "proposta-enviada",
    name: "Proposta Enviada",
    color: "bg-orange-400",
    deals: [
      {
        id: "d7",
        title: "Plataforma E-commerce",
        value: 38000,
        company: "Santos Digital",
        contact: "Jorge Santos",
        daysInStage: 8,
        probability: 60,
        status: "active",
        qualificationCount: 2,
        contactCount: 2,
        nextActivity: { label: "Tarefa", date: "20/06/2026 09:00", type: "task" },
      },
    ],
  },
  {
    id: "aguardando-dados",
    name: "Aguardando Dados",
    color: "bg-purple-400",
    deals: [
      {
        id: "d8",
        title: "Indústrias Norte — Renovação",
        value: 85000,
        company: "Indústrias Norte",
        contact: "Roberto Alves",
        daysInStage: 15,
        probability: 70,
        status: "active",
        qualificationCount: 4,
        contactCount: 3,
      },
    ],
  },
  {
    id: "aguardando-assinatura",
    name: "Aguardando Assinatura",
    color: "bg-pink-400",
    deals: [
      {
        id: "d9",
        title: "Serviço Managed IT",
        value: 29000,
        company: "Mendes Gestão",
        contact: "Luisa Mendes",
        daysInStage: 10,
        probability: 80,
        status: "active",
        qualificationCount: 2,
        contactCount: 1,
        nextActivity: { label: "Tarefa", date: "12/06/2026 15:00", type: "task" },
      },
    ],
  },
  {
    id: "ganho-fechado",
    name: "Ganho Fechado",
    color: "bg-green-400",
    deals: [
      {
        id: "d10",
        title: "LogiTrans — Contrato 12 meses",
        value: 35000,
        company: "LogiTrans SA",
        contact: "Carlos Souza",
        daysInStage: 3,
        probability: 95,
        status: "won",
        qualificationCount: 3,
        contactCount: 2,
      },
    ],
  },
];

function filterDeals(deals: Deal[], filter: FilterType): Deal[] {
  if (filter === "all") return deals;
  if (filter === "active") return deals.filter((d) => d.status === "active" || !d.status);
  if (filter === "won") return deals.filter((d) => d.status === "won");
  if (filter === "lost") return deals.filter((d) => d.status === "lost");
  return deals;
}

export default function PipelinePage() {
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [filter, setFilter] = useState<FilterType>("all");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [responsibleFilter] = useState<string | null>("Oliver");

  const onDragEnd = (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    setStages((prev) => {
      const next = prev.map((s) => ({ ...s, deals: [...s.deals] }));
      const srcStage = next.find((s) => s.id === source.droppableId)!;
      const dstStage = next.find((s) => s.id === destination.droppableId)!;
      const [moved] = srcStage.deals.splice(source.index, 1);
      dstStage.deals.splice(destination.index, 0, moved);
      return next;
    });
  };

  const visibleStages = stages.map((s) => ({
    ...s,
    deals: filterDeals(s.deals, filter),
  }));

  const totalDeals = visibleStages.reduce((sum, s) => sum + s.deals.length, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Pipeline Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-shrink-0 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
          <button
            onClick={() => setView("kanban")}
            className={`p-1.5 transition-colors ${
              view === "kanban"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
            title="Visualização Kanban"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-1.5 border-l border-gray-200 transition-colors ${
              view === "list"
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
            title="Visualização Lista"
          >
            <List size={15} />
          </button>
        </div>

        {/* Funil dropdown */}
        <button className="flex items-center gap-1.5 text-sm text-gray-700 font-medium bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          Vendas
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {/* Minhas negociações dropdown */}
        <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          Minhas negociações
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {/* Período dropdown */}
        <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
          Todos os períodos
          <ChevronDown size={13} className="text-gray-400" />
        </button>

        {/* Status filter pills */}
        <div className="flex items-center gap-1 ml-1">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "active", label: "Em andamento" },
              { value: "won", label: "Ganhos" },
              { value: "lost", label: "Perdidos" },
            ] as { value: FilterType; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === f.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Deals badge */}
        <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
          {totalDeals} Negociações
        </span>

        {/* Responsible filter badge */}
        {responsibleFilter && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">
            {responsibleFilter}
            <button className="hover:text-blue-900 transition-colors">
              <X size={11} />
            </button>
          </span>
        )}

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <SlidersHorizontal size={13} />
            Filtros (0)
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md px-3 py-1.5 transition-colors shadow-sm">
            <Plus size={14} />
            Criar
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="flex gap-3 h-full min-w-max">
            {visibleStages.map((stage) => (
              <StageColumn key={stage.id} stage={stage} />
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
