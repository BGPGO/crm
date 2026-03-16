"use client";

import React from "react";
import type {
  DividerData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DividerSectionProps {
  data: DividerData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DividerSection({ data }: DividerSectionProps) {
  return (
    <div className="flex justify-center">
      <hr
        style={{
          width: `${data.width ?? 100}%`,
          borderTopWidth: data.thickness ?? 1,
          borderTopStyle: data.style || "solid",
          borderTopColor: data.color || "#e5e7eb",
          borderBottom: "none",
          borderLeft: "none",
          borderRight: "none",
          margin: 0,
        }}
      />
    </div>
  );
}
