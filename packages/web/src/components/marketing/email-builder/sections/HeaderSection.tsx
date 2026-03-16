"use client";

import React, { useRef, useState, useCallback } from "react";
import { Image as ImageIcon } from "lucide-react";
import type {
  HeaderData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HeaderSectionProps {
  data: HeaderData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Alignment utility
// ---------------------------------------------------------------------------

const ALIGN_MAP: Record<string, React.CSSProperties["justifyContent"]> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeaderSection({ data, onUpdate, globalStyle }: HeaderSectionProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [isTextFocused, setIsTextFocused] = useState(false);

  const handleBlur = useCallback(() => {
    setIsTextFocused(false);
    if (textRef.current) {
      const html = textRef.current.innerHTML;
      if (html !== data.html) {
        onUpdate({ ...data, html });
      }
    }
  }, [data, onUpdate]);

  const alignment = data.alignment || "left";

  return (
    <div
      className="flex flex-col gap-3"
      style={{ alignItems: ALIGN_MAP[alignment] }}
    >
      {/* Logo */}
      {data.logoUrl ? (
        <img
          src={data.logoUrl}
          alt={data.companyName || "Logo"}
          style={{ width: data.logoWidth ?? 150, height: "auto" }}
          className="block"
        />
      ) : (
        <div className="flex h-16 w-40 items-center justify-center gap-2 rounded border-2 border-dashed border-gray-300 text-gray-400 cursor-pointer hover:border-gray-400 hover:text-gray-500 transition-colors">
          <ImageIcon className="h-5 w-5" />
          <span className="text-xs">Clique para adicionar logo</span>
        </div>
      )}

      {/* Text (contentEditable) */}
      {!isTextFocused ? (
        <div
          ref={textRef}
          tabIndex={0}
          onFocus={() => setIsTextFocused(true)}
          style={{
            fontFamily: globalStyle.fontFamily,
            fontSize: globalStyle.fontSize,
            color: globalStyle.textColor,
            minHeight: 24,
            cursor: "text",
            outline: "none",
          }}
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      ) : (
        <div
          ref={textRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={handleBlur}
          style={{
            fontFamily: globalStyle.fontFamily,
            fontSize: globalStyle.fontSize,
            color: globalStyle.textColor,
            minHeight: 24,
            cursor: "text",
            outline: "none",
          }}
          dangerouslySetInnerHTML={{ __html: data.html }}
        />
      )}
    </div>
  );
}
