"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Type,
  Image,
  MousePointerClick,
  Minus,
  Columns2,
  Share2,
  AlignLeft,
  ArrowUpDown,
  LayoutTemplate,
} from "lucide-react";
import type {
  SectionType,
  EmailSection,
  HeaderData,
  TextData,
  ImageData,
  ButtonData,
  DividerData,
  ColumnsData,
  SocialData,
  FooterData,
  SpacerData,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Default section factory
// ---------------------------------------------------------------------------

export function createDefaultSection(type: SectionType): EmailSection {
  const id = crypto.randomUUID();
  const style = { paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16 };

  switch (type) {
    case "header":
      return {
        id,
        type,
        style,
        data: {
          type: "header",
          logoUrl: "",
          logoWidth: 150,
          companyName: "",
          alignment: "left",
          html: "<p>Sua Empresa</p>",
        } satisfies HeaderData,
      };

    case "text":
      return {
        id,
        type,
        style,
        data: {
          type: "text",
          html: "<p>Digite seu texto aqui...</p>",
        } satisfies TextData,
      };

    case "image":
      return {
        id,
        type,
        style,
        data: {
          type: "image",
          src: "",
          alt: "",
          width: "full",
          alignment: "center",
        } satisfies ImageData,
      };

    case "button":
      return {
        id,
        type,
        style,
        data: {
          type: "button",
          text: "Agendar Reunião",
          url: "https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp?utm_source=email_cadencia&utm_medium=crm",
          alignment: "center",
          buttonColor: "#2563eb",
          textColor: "#ffffff",
          borderRadius: 6,
          size: "md",
        } satisfies ButtonData,
      };

    case "divider":
      return {
        id,
        type,
        style: { ...style, paddingTop: 8, paddingBottom: 8 },
        data: {
          type: "divider",
          color: "#e5e7eb",
          thickness: 1,
          style: "solid",
          width: 100,
        } satisfies DividerData,
      };

    case "columns":
      return {
        id,
        type,
        style,
        data: {
          type: "columns",
          layout: "50-50",
          columns: [
            { html: "<p>Coluna 1</p>" },
            { html: "<p>Coluna 2</p>" },
          ],
          gap: 16,
        } satisfies ColumnsData,
      };

    case "social":
      return {
        id,
        type,
        style,
        data: {
          type: "social",
          alignment: "center",
          iconSize: 32,
          links: [
            { platform: "facebook", url: "#" },
            { platform: "instagram", url: "#" },
            { platform: "linkedin", url: "#" },
          ],
        } satisfies SocialData,
      };

    case "footer":
      return {
        id,
        type,
        style: { ...style, paddingTop: 12, paddingBottom: 12 },
        data: {
          type: "footer",
          html: "<p>Sua Empresa &mdash; Todos os direitos reservados.<br/>Voce recebeu este email porque se cadastrou em nosso site.<br/><a href=\"#\">Descadastrar</a></p>",
          alignment: "center",
        } satisfies FooterData,
      };

    case "spacer":
      return {
        id,
        type,
        style: { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 },
        data: {
          type: "spacer",
          height: 32,
        } satisfies SpacerData,
      };
  }
}

// ---------------------------------------------------------------------------
// Section menu items
// ---------------------------------------------------------------------------

interface MenuItem {
  type: SectionType;
  label: string;
  icon: React.ElementType;
}

const MENU_ITEMS: MenuItem[] = [
  { type: "header", label: "Cabecalho", icon: LayoutTemplate },
  { type: "text", label: "Texto", icon: Type },
  { type: "image", label: "Imagem", icon: Image },
  { type: "button", label: "Botao", icon: MousePointerClick },
  { type: "divider", label: "Divisor", icon: Minus },
  { type: "columns", label: "Colunas", icon: Columns2 },
  { type: "social", label: "Redes Sociais", icon: Share2 },
  { type: "footer", label: "Rodape", icon: AlignLeft },
  { type: "spacer", label: "Espacador", icon: ArrowUpDown },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AddSectionButtonProps {
  onAdd: (type: SectionType) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddSectionButton({ onAdd }: AddSectionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative flex justify-center py-1">
      {/* The "+" trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-9 z-50 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {MENU_ITEMS.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAdd(type);
                setIsOpen(false);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Icon className="h-4 w-4 text-gray-400" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
