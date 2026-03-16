"use client";

import { GlobalStyle } from "@/types/email-builder";

// ---------------------------------------------------------------------------
// Color Input — small swatch + hex text input
// ---------------------------------------------------------------------------

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-gray-200 p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 flex-1 rounded border border-gray-200 px-2 text-sm font-mono"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobalStyleEditor
// ---------------------------------------------------------------------------

interface GlobalStyleEditorProps {
  globalStyle: GlobalStyle;
  onChange: (style: Partial<GlobalStyle>) => void;
}

const FONT_OPTIONS = [
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
];

const FONT_SIZE_OPTIONS = ["14px", "16px", "18px"];

export default function GlobalStyleEditor({
  globalStyle,
  onChange,
}: GlobalStyleEditorProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-900">Estilos Globais</h3>

      {/* Body background */}
      <ColorInput
        label="Cor de fundo (body)"
        value={globalStyle.bodyBackgroundColor}
        onChange={(v) => onChange({ bodyBackgroundColor: v })}
      />

      {/* Content background */}
      <ColorInput
        label="Cor de fundo (conteúdo)"
        value={globalStyle.contentBackgroundColor}
        onChange={(v) => onChange({ contentBackgroundColor: v })}
      />

      {/* Content width */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Largura do conteúdo
        </label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={400}
            max={800}
            step={10}
            value={globalStyle.contentWidth}
            onChange={(e) => onChange({ contentWidth: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="w-14 text-right text-sm text-gray-600">
            {globalStyle.contentWidth}px
          </span>
        </div>
      </div>

      {/* Font family */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Fonte padrão
        </label>
        <select
          value={globalStyle.fontFamily}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="h-8 w-full rounded border border-gray-200 px-2 text-sm"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Font size */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Tamanho da fonte
        </label>
        <select
          value={globalStyle.fontSize}
          onChange={(e) => onChange({ fontSize: e.target.value })}
          className="h-8 w-full rounded border border-gray-200 px-2 text-sm"
        >
          {FONT_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Text color */}
      <ColorInput
        label="Cor do texto"
        value={globalStyle.textColor}
        onChange={(v) => onChange({ textColor: v })}
      />

      {/* Link color */}
      <ColorInput
        label="Cor dos links"
        value={globalStyle.linkColor}
        onChange={(v) => onChange({ linkColor: v })}
      />
    </div>
  );
}
