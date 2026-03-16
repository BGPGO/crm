"use client";

import React, { useState } from "react";
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
} from "lucide-react";
import type { EmailSection } from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Section type labels (PT-BR)
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  header: "Cabecalho",
  text: "Texto",
  image: "Imagem",
  button: "Botao",
  divider: "Divisor",
  columns: "Colunas",
  social: "Redes Sociais",
  footer: "Rodape",
  spacer: "Espacador",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionWrapperProps {
  section: EmailSection;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: React.ReactNode;
  dragHandleProps?: any;
}

// ---------------------------------------------------------------------------
// Small icon button used in the toolbar
// ---------------------------------------------------------------------------

function ActionButton({
  icon: Icon,
  onClick,
  title,
}: {
  icon: React.ElementType;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700 hover:shadow transition-all"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SectionWrapper({
  section,
  isSelected,
  onSelect,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
  children,
  dragHandleProps,
}: SectionWrapperProps) {
  const [isHovered, setIsHovered] = useState(false);

  const showControls = isHovered || isSelected;

  const borderClass = isSelected
    ? "border-blue-500 ring-2 ring-blue-50"
    : isHovered
      ? "border-blue-400 border-dashed"
      : "border-transparent";

  return (
    <div
      className={`relative border-2 rounded transition-all ${borderClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Top-left: drag handle + label */}
      {showControls && (
        <div className="absolute -top-3 left-2 flex items-center gap-1 z-10">
          <div
            {...dragHandleProps}
            className="flex h-6 items-center gap-0.5 rounded bg-white px-1 shadow-sm cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide select-none">
              {TYPE_LABELS[section.type] ?? section.type}
            </span>
          </div>
        </div>
      )}

      {/* Top-right: action buttons */}
      {showControls && (
        <div className="absolute -top-3 right-2 flex items-center gap-1 z-10">
          <ActionButton
            icon={ArrowUp}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            title="Mover para cima"
          />
          <ActionButton
            icon={ArrowDown}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            title="Mover para baixo"
          />
          <ActionButton
            icon={Copy}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicar"
          />
          <ActionButton
            icon={Trash2}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remover"
          />
        </div>
      )}

      {/* Section content */}
      <div className="relative">{children}</div>
    </div>
  );
}
