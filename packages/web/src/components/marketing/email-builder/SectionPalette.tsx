"use client";

import { useState } from "react";
import {
  AlignLeft,
  Image,
  Columns2,
  MousePointerClick,
  Minus,
  Heading,
  Share2,
  FileText,
  MoveVertical,
} from "lucide-react";
import type { SectionType, EmailSection } from "@/types/email-builder";
import { PREBUILT_BLOCKS } from "./renderer/prebuiltSections";

// ---------------------------------------------------------------------------
// Section type definitions for the palette
// ---------------------------------------------------------------------------

interface PaletteItem {
  type: SectionType;
  label: string;
  icon: React.ElementType;
}

const SECTION_ITEMS: PaletteItem[] = [
  { type: "header", label: "Cabeçalho", icon: Heading },
  { type: "text", label: "Texto", icon: AlignLeft },
  { type: "image", label: "Imagem", icon: Image },
  { type: "button", label: "Botão", icon: MousePointerClick },
  { type: "columns", label: "Colunas", icon: Columns2 },
  { type: "divider", label: "Divisor", icon: Minus },
  { type: "social", label: "Social", icon: Share2 },
  { type: "footer", label: "Rodapé", icon: FileText },
  { type: "spacer", label: "Espaçador", icon: MoveVertical },
];

// ---------------------------------------------------------------------------
// Category color map (subtle left border for prebuilt blocks)
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  "Cabeçalho": "border-l-blue-400",
  Hero: "border-l-purple-400",
  "Conteúdo": "border-l-green-400",
  CTA: "border-l-orange-400",
  Template: "border-l-indigo-400",
  "Rodapé": "border-l-gray-400",
  Social: "border-l-pink-400",
};

// ---------------------------------------------------------------------------
// SectionPalette
// ---------------------------------------------------------------------------

interface SectionPaletteProps {
  onAddSection: (type: SectionType) => void;
  onAddPrebuilt: (sections: EmailSection[]) => void;
}

export default function SectionPalette({
  onAddSection,
  onAddPrebuilt,
}: SectionPaletteProps) {
  const [activeTab, setActiveTab] = useState<"sections" | "blocks">("sections");

  return (
    <aside className="w-[200px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("sections")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "sections"
              ? "text-gray-900 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Seções
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("blocks")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "blocks"
              ? "text-gray-900 border-b-2 border-blue-500"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Blocos Prontos
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "sections" ? (
          <SectionsGrid onAddSection={onAddSection} />
        ) : (
          <BlocksList onAddPrebuilt={onAddPrebuilt} />
        )}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Sections grid (2 columns)
// ---------------------------------------------------------------------------

function SectionsGrid({
  onAddSection,
}: {
  onAddSection: (type: SectionType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {SECTION_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            type="button"
            onClick={() => onAddSection(item.type)}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 active:scale-95"
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight text-center">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prebuilt blocks list
// ---------------------------------------------------------------------------

function BlocksList({
  onAddPrebuilt,
}: {
  onAddPrebuilt: (sections: EmailSection[]) => void;
}) {
  return (
    <div className="space-y-2">
      {PREBUILT_BLOCKS.map((block) => {
        const borderColor = CATEGORY_COLORS[block.category] ?? "border-l-gray-300";

        return (
          <button
            key={block.id}
            type="button"
            onClick={() => {
              // Clone sections with new IDs so each instance is unique
              const cloned = block.sections.map((s) => ({
                ...structuredClone(s),
                id: crypto.randomUUID(),
              }));
              onAddPrebuilt(cloned);
            }}
            className={`w-full text-left rounded-lg border border-gray-200 border-l-[3px] ${borderColor} bg-white p-2.5 transition-all hover:border-blue-300 hover:shadow-sm active:scale-[0.98]`}
          >
            <span className="text-xs font-medium text-gray-900 block">
              {block.name}
            </span>
            <span className="text-[10px] text-gray-500 leading-tight block mt-0.5">
              {block.description}
            </span>
            {/* Mini preview: show section type badges */}
            <div className="flex flex-wrap gap-1 mt-1.5">
              {block.sections.map((s, i) => (
                <span
                  key={i}
                  className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-500"
                >
                  {s.type}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
