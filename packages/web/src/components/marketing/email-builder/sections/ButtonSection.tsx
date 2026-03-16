"use client";

import React from "react";
import type {
  ButtonData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ButtonSectionProps {
  data: ButtonData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Size presets
// ---------------------------------------------------------------------------

const SIZE_PADDING: Record<string, string> = {
  sm: "8px 20px",
  md: "12px 32px",
  lg: "16px 44px",
};

const SIZE_FONT: Record<string, string> = {
  sm: "13px",
  md: "15px",
  lg: "17px",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ButtonSection({ data, globalStyle }: ButtonSectionProps) {
  const alignment = data.alignment || "center";

  const alignClass =
    alignment === "left"
      ? "justify-start"
      : alignment === "right"
        ? "justify-end"
        : "justify-center";

  return (
    <div className={`flex ${alignClass}`}>
      <div
        style={{
          backgroundColor: data.buttonColor || "#2563eb",
          color: data.textColor || "#ffffff",
          borderRadius: data.borderRadius ?? 6,
          padding: SIZE_PADDING[data.size] || SIZE_PADDING.md,
          fontSize: SIZE_FONT[data.size] || SIZE_FONT.md,
          fontFamily: globalStyle.fontFamily,
          fontWeight: 600,
          display: "inline-block",
          cursor: "default",
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        {data.text || "Botao"}
      </div>
    </div>
  );
}
