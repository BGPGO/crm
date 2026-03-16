"use client";

import React, { useRef, useState, useCallback } from "react";
import type {
  FooterData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FooterSectionProps {
  data: FooterData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FooterSection({ data, onUpdate, globalStyle }: FooterSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (ref.current) {
      const html = ref.current.innerHTML;
      if (html !== data.html) {
        onUpdate({ ...data, html });
      }
    }
  }, [data, onUpdate]);

  const containerStyle: React.CSSProperties = {
    fontFamily: globalStyle.fontFamily,
    fontSize: "12px",
    color: "#9ca3af",
    minHeight: 32,
    cursor: "text",
    outline: "none",
    lineHeight: 1.5,
    textAlign: data.alignment || "center",
  };

  if (!isFocused) {
    return (
      <div
        ref={ref}
        style={containerStyle}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        dangerouslySetInnerHTML={{ __html: data.html }}
      />
    );
  }

  return (
    <div
      ref={ref}
      style={containerStyle}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      dangerouslySetInnerHTML={{ __html: data.html }}
    />
  );
}
