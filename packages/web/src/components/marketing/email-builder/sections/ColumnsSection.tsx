"use client";

import React, { useRef, useCallback } from "react";
import type {
  ColumnsData,
  SectionData,
  SectionStyle,
  GlobalStyle,
} from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ColumnsSectionProps {
  data: ColumnsData;
  onUpdate: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  globalStyle: GlobalStyle;
}

// ---------------------------------------------------------------------------
// Layout flex percentages
// ---------------------------------------------------------------------------

const LAYOUT_WIDTHS: Record<string, string[]> = {
  "50-50": ["50%", "50%"],
  "33-67": ["33.33%", "66.67%"],
  "67-33": ["66.67%", "33.33%"],
  "33-33-33": ["33.33%", "33.33%", "33.33%"],
};

// ---------------------------------------------------------------------------
// Single column with contentEditable
// ---------------------------------------------------------------------------

function ColumnCell({
  html,
  index,
  globalStyle,
  onBlur,
}: {
  html: string;
  index: number;
  globalStyle: GlobalStyle;
  onBlur: (index: number, newHtml: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    if (ref.current) {
      onBlur(index, ref.current.innerHTML);
    }
  }, [index, onBlur]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      className="min-h-[40px] border border-dashed border-gray-200 rounded p-2 outline-none focus:border-blue-300"
      style={{
        fontFamily: globalStyle.fontFamily,
        fontSize: globalStyle.fontSize,
        color: globalStyle.textColor,
        cursor: "text",
        lineHeight: 1.6,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ColumnsSection({ data, onUpdate, globalStyle }: ColumnsSectionProps) {
  const widths = LAYOUT_WIDTHS[data.layout] || LAYOUT_WIDTHS["50-50"];
  const gap = data.gap ?? 16;

  const handleColumnBlur = useCallback(
    (index: number, newHtml: string) => {
      const columns = [...data.columns];
      if (columns[index]?.html !== newHtml) {
        columns[index] = { ...columns[index], html: newHtml };
        onUpdate({ ...data, columns });
      }
    },
    [data, onUpdate],
  );

  return (
    <div className="flex" style={{ gap }}>
      {widths.map((width, i) => (
        <div key={i} style={{ width, flexShrink: 0 }}>
          <ColumnCell
            html={data.columns[i]?.html ?? ""}
            index={i}
            globalStyle={globalStyle}
            onBlur={handleColumnBlur}
          />
        </div>
      ))}
    </div>
  );
}
