"use client";

import React, { useState } from "react";
import type {
  SpacerData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpacerSectionProps {
  data: SpacerData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
  isSelected: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpacerSection({ data, isSelected }: SpacerSectionProps) {
  const [isHovered, setIsHovered] = useState(false);
  const height = data.height ?? 32;
  const showIndicator = isHovered || isSelected;

  return (
    <div
      className="relative"
      style={{ height }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showIndicator && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute inset-x-4 top-1/2 border-t border-dashed border-gray-300" />
          <span className="relative z-10 rounded bg-white px-2 py-0.5 text-[10px] font-medium text-gray-400 shadow-sm">
            {height}px
          </span>
        </div>
      )}
    </div>
  );
}
