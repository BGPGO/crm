"use client";

import React, { useState, useRef } from "react";
import { Image as ImageIcon, Check } from "lucide-react";
import type {
  ImageData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImageSectionProps {
  data: ImageData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Size presets
// ---------------------------------------------------------------------------

const SIZE_PRESETS: { label: string; value: "full" | number }[] = [
  { label: "P", value: 30 },
  { label: "M", value: 60 },
  { label: "G", value: 80 },
  { label: "100%", value: "full" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageSection({ data, onUpdate }: ImageSectionProps) {
  const alignment = data.alignment || "center";
  const [urlInput, setUrlInput] = useState("");
  const [showInlineInput, setShowInlineInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const alignClass =
    alignment === "left"
      ? "justify-start"
      : alignment === "right"
        ? "justify-end"
        : "justify-center";

  const handlePlaceholderClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowInlineInput(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleConfirmUrl = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const trimmed = urlInput.trim();
    if (trimmed) {
      onUpdate({ src: trimmed } as Partial<SectionData>);
      setUrlInput("");
      setShowInlineInput(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleConfirmUrl(e);
    if (e.key === "Escape") {
      setShowInlineInput(false);
      setUrlInput("");
    }
  };

  if (!data.src) {
    return (
      <div className={`flex ${alignClass}`}>
        <div
          className="flex w-full max-w-md flex-col items-center justify-center gap-3 rounded border-2 border-dashed border-blue-300 bg-blue-50/40 text-blue-400 transition-colors hover:border-blue-400 hover:bg-blue-50"
          style={{ minHeight: showInlineInput ? "auto" : 160, padding: showInlineInput ? "16px" : "32px 16px" }}
          onClick={handlePlaceholderClick}
        >
          {!showInlineInput ? (
            <>
              <ImageIcon className="h-10 w-10 opacity-60" />
              <div className="text-center">
                <p className="text-sm font-medium text-blue-500">Clique para inserir imagem</p>
                <p className="text-xs text-blue-400 mt-0.5">Cole a URL da imagem aqui</p>
              </div>
            </>
          ) : (
            <div
              className="flex w-full items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <ImageIcon className="h-5 w-5 shrink-0 text-blue-400" />
              <input
                ref={inputRef}
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="https://exemplo.com/imagem.jpg"
                className="flex-1 rounded border border-blue-300 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
              />
              <button
                type="button"
                onClick={handleConfirmUrl}
                disabled={!urlInput.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const imgWidth = data.width === "full" ? "100%" : `${data.width}%`;
  const currentSize = data.width;

  return (
    <div className={`relative flex ${alignClass} group`}>
      <div className="relative">
        <img
          src={data.src}
          alt={data.alt || ""}
          style={{ width: imgWidth, height: "auto", maxWidth: "100%", display: "block" }}
          className="rounded"
        />
        {/* Size preset overlay — shown on hover */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-0.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
            {SIZE_PRESETS.map((preset) => {
              const isActive =
                preset.value === "full"
                  ? currentSize === "full"
                  : currentSize === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  title={preset.value === "full" ? "Largura total" : `${preset.value}% de largura`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({ width: preset.value } as Partial<SectionData>);
                  }}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-white text-gray-900"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
