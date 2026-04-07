"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import type {
  TextData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TextSectionProps {
  data: TextData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TextSection({ data, onUpdate, globalStyle }: TextSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // When switching from display mode to edit mode, populate the editable div
  // with the current HTML exactly once.  We must NOT use dangerouslySetInnerHTML
  // on the focused/editable div because that causes React to re-apply innerHTML
  // on every render, destroying the cursor position.
  useEffect(() => {
    if (isFocused && ref.current) {
      // Only seed if the element is currently empty (just mounted into edit mode)
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
    fontSize: globalStyle.fontSize,
    color: globalStyle.textColor,
    minHeight: 40,
    cursor: "text",
    outline: "none",
    lineHeight: 1.6,
  };

  // When not focused, render via dangerouslySetInnerHTML for accurate display.
  // When focused, the user edits content directly via contentEditable — we seed
  // the DOM via the useEffect above (not via dangerouslySetInnerHTML).
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
