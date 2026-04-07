"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
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

  // Seed the editable div with HTML when entering edit mode.
  // Never use dangerouslySetInnerHTML on the contentEditable div — that causes
  // React to re-apply innerHTML on every render, destroying cursor position.
  useEffect(() => {
    if (isFocused && ref.current) {
      if (ref.current.innerHTML === "") {
        ref.current.innerHTML = data.html;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]); // intentionally NOT depending on data.html

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (ref.current) {
      const html = ref.current.innerHTML;
      if (html !== data.html) {
        onUpdate({ ...data, html });
      }
    }
  }, [data, onUpdate]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

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
        onFocus={handleFocus}
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
    />
  );
}
