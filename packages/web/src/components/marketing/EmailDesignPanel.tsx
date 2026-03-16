"use client";

import { Palette, Type, Layout } from "lucide-react";

export interface EmailDesign {
  bodyBg: string;
  contentBg: string;
  contentWidth: number;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  linkColor: string;
  paddingX: number;
  paddingY: number;
}

export const DEFAULT_DESIGN: EmailDesign = {
  bodyBg: "#f4f4f5",
  contentBg: "#ffffff",
  contentWidth: 600,
  fontFamily: "Arial, sans-serif",
  fontSize: 16,
  textColor: "#333333",
  linkColor: "#2563eb",
  paddingX: 24,
  paddingY: 32,
};

interface EmailDesignPanelProps {
  design: EmailDesign;
  onChange: (design: EmailDesign) => void;
}

const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
];

const FONT_SIZE_OPTIONS = [12, 14, 15, 16, 18, 20, 24];

function SectionTitle({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-gray-200">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      <span className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
        {label}
      </span>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-600 whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") {
              onChange(v);
            }
          }}
          onBlur={(e) => {
            if (!/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
              onChange(value);
            }
          }}
          className="w-[88px] text-sm font-mono px-2 py-1 border border-gray-200 rounded bg-white text-gray-700"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-mono text-gray-500">
          {value}
          {suffix || "px"}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

export default function EmailDesignPanel({
  design,
  onChange,
}: EmailDesignPanelProps) {
  const update = (partial: Partial<EmailDesign>) => {
    onChange({ ...design, ...partial });
  };

  return (
    <div className="space-y-6">
      {/* Cores */}
      <section>
        <SectionTitle icon={Palette} label="Cores" />
        <div className="space-y-3">
          <ColorRow
            label="Background do email"
            value={design.bodyBg}
            onChange={(v) => update({ bodyBg: v })}
          />
          <ColorRow
            label="Background do conteúdo"
            value={design.contentBg}
            onChange={(v) => update({ contentBg: v })}
          />
          <ColorRow
            label="Cor do texto"
            value={design.textColor}
            onChange={(v) => update({ textColor: v })}
          />
          <ColorRow
            label="Cor dos links"
            value={design.linkColor}
            onChange={(v) => update({ linkColor: v })}
          />
        </div>
      </section>

      {/* Tipografia */}
      <section>
        <SectionTitle icon={Type} label="Tipografia" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">Fonte</span>
            <select
              value={design.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
              className="text-sm px-2 py-1.5 border border-gray-200 rounded bg-white text-gray-700 max-w-[180px]"
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">Tamanho</span>
            <select
              value={design.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
              className="text-sm px-2 py-1.5 border border-gray-200 rounded bg-white text-gray-700"
            >
              {FONT_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Layout */}
      <section>
        <SectionTitle icon={Layout} label="Layout" />
        <div className="space-y-4">
          <RangeRow
            label="Largura do conteúdo"
            value={design.contentWidth}
            min={400}
            max={800}
            step={10}
            onChange={(v) => update({ contentWidth: v })}
          />
          <RangeRow
            label="Padding horizontal"
            value={design.paddingX}
            min={0}
            max={60}
            onChange={(v) => update({ paddingX: v })}
          />
          <RangeRow
            label="Padding vertical"
            value={design.paddingY}
            min={0}
            max={60}
            onChange={(v) => update({ paddingY: v })}
          />
        </div>
      </section>
    </div>
  );
}
