"use client";

import React from "react";
import { Image as ImageIcon } from "lucide-react";
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
// Component
// ---------------------------------------------------------------------------

export function ImageSection({ data }: ImageSectionProps) {
  const alignment = data.alignment || "center";

  const alignClass =
    alignment === "left"
      ? "justify-start"
      : alignment === "right"
        ? "justify-end"
        : "justify-center";

  if (!data.src) {
    return (
      <div className={`flex ${alignClass}`}>
        <div className="flex h-48 w-full max-w-md flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-gray-400 hover:text-gray-500 transition-colors">
          <ImageIcon className="h-10 w-10" />
          <span className="text-sm">Clique para adicionar imagem</span>
        </div>
      </div>
    );
  }

  const imgWidth = data.width === "full" ? "100%" : data.width;

  return (
    <div className={`flex ${alignClass}`}>
      <img
        src={data.src}
        alt={data.alt || ""}
        style={{ width: imgWidth, height: "auto", maxWidth: "100%", display: "block" }}
        className="rounded"
      />
    </div>
  );
}
