"use client";

import {
  EmailSection,
  GlobalStyle,
  SectionData,
  SectionStyle,
  HeaderData,
  ImageData,
  ButtonData,
  DividerData,
  ColumnsData,
  SocialData,
  FooterData,
  SpacerData,
} from "@/types/email-builder";
import GlobalStyleEditor from "./GlobalStyleEditor";

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
      {children}
    </label>
  );
}

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
      <SectionLabel>{label}</SectionLabel>
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

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-14 text-right text-sm text-gray-600">
          {value}
          {unit ?? ""}
        </span>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <SectionLabel>{label}</SectionLabel>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded border border-gray-200 px-2 text-sm"
      />
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="inline-flex rounded-md bg-gray-100 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
              value === opt.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style editor (bg + padding) — shown for every section
// ---------------------------------------------------------------------------

function SharedStyleEditor({
  style,
  onUpdate,
}: {
  style: SectionStyle;
  onUpdate: (s: Partial<SectionStyle>) => void;
}) {
  const allSame =
    (style.paddingTop ?? 10) === (style.paddingRight ?? 10) &&
    (style.paddingRight ?? 10) === (style.paddingBottom ?? 10) &&
    (style.paddingBottom ?? 10) === (style.paddingLeft ?? 10);

  return (
    <div className="space-y-3 border-b border-gray-100 pb-4">
      <ColorInput
        label="Cor de fundo"
        value={style.backgroundColor ?? "#ffffff"}
        onChange={(v) => onUpdate({ backgroundColor: v })}
      />

      <div className="space-y-1">
        <SectionLabel>Padding</SectionLabel>
        {allSame ? (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={60}
              value={style.paddingTop ?? 10}
              onChange={(e) => {
                const v = Number(e.target.value);
                onUpdate({
                  paddingTop: v,
                  paddingRight: v,
                  paddingBottom: v,
                  paddingLeft: v,
                });
              }}
              className="flex-1"
            />
            <span className="w-10 text-right text-sm text-gray-600">
              {style.paddingTop ?? 10}px
            </span>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["Top", "paddingTop"],
              ["Right", "paddingRight"],
              ["Bottom", "paddingBottom"],
              ["Left", "paddingLeft"],
            ] as const
          ).map(([lbl, key]) => (
            <div key={key} className="flex items-center gap-1">
              <span className="w-10 text-xs text-gray-400">{lbl}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={(style[key] as number) ?? 10}
                onChange={(e) => onUpdate({ [key]: Number(e.target.value) })}
                className="h-7 w-full rounded border border-gray-200 px-1.5 text-xs"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-type editors
// ---------------------------------------------------------------------------

function HeaderEditor({
  data,
  onUpdate,
}: {
  data: HeaderData;
  onUpdate: (d: Partial<HeaderData>) => void;
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="URL do Logo"
        value={data.logoUrl ?? ""}
        placeholder="https://..."
        onChange={(v) => onUpdate({ logoUrl: v })}
      />
      <SliderInput
        label="Largura do logo"
        value={data.logoWidth ?? 150}
        min={50}
        max={300}
        unit="px"
        onChange={(v) => onUpdate({ logoWidth: v })}
      />
      <TextInput
        label="Nome da empresa"
        value={data.companyName ?? ""}
        placeholder="Sua Empresa"
        onChange={(v) => onUpdate({ companyName: v })}
      />
      <SegmentedControl
        label="Alinhamento"
        options={[
          { value: "left" as const, label: "Esq" },
          { value: "center" as const, label: "Centro" },
          { value: "right" as const, label: "Dir" },
        ]}
        value={data.alignment}
        onChange={(v) => onUpdate({ alignment: v })}
      />
    </div>
  );
}

function ImageEditor({
  data,
  onUpdate,
}: {
  data: ImageData;
  onUpdate: (d: Partial<ImageData>) => void;
}) {
  const hasImage = !!data.src;
  return (
    <div className="space-y-3">
      {!hasImage && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <p className="mb-2 text-xs font-semibold text-blue-700">Cole a URL da imagem</p>
          <div className="space-y-1">
            <input
              type="text"
              value={data.src}
              placeholder="https://exemplo.com/imagem.jpg"
              autoFocus
              onChange={(e) => onUpdate({ src: e.target.value })}
              className="h-8 w-full rounded border border-blue-300 bg-white px-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40"
            />
            <p className="text-[10px] text-blue-500">
              Ou clique no placeholder no canvas para inserir diretamente.
            </p>
          </div>
        </div>
      )}
      {hasImage && (
        <TextInput
          label="URL da imagem"
          value={data.src}
          placeholder="https://..."
          onChange={(v) => onUpdate({ src: v })}
        />
      )}
      <TextInput
        label="Texto alternativo"
        value={data.alt}
        placeholder="Descrição da imagem"
        onChange={(v) => onUpdate({ alt: v })}
      />
      {/* Quick size presets */}
      <div className="space-y-1">
        <SectionLabel>Tamanho rápido</SectionLabel>
        <div className="flex gap-1.5">
          {([
            { label: "Pequena", value: 30 },
            { label: "Média", value: 60 },
            { label: "Grande", value: 80 },
            { label: "Total", value: "full" },
          ] as { label: string; value: "full" | number }[]).map((preset) => {
            const isActive =
              preset.value === "full"
                ? data.width === "full"
                : data.width === preset.value;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onUpdate({ width: preset.value })}
                className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <SegmentedControl
        label="Largura personalizada"
        options={[
          { value: "full" as const, label: "100%" },
          { value: "custom" as const, label: "Personalizada" },
        ]}
        value={data.width === "full" ? "full" : "custom"}
        onChange={(v) => {
          if (v === "full") onUpdate({ width: "full" });
          else onUpdate({ width: 80 });
        }}
      />
      {data.width !== "full" && (
        <SliderInput
          label="Largura (%)"
          value={typeof data.width === "number" ? data.width : 80}
          min={10}
          max={100}
          unit="%"
          onChange={(v) => onUpdate({ width: v })}
        />
      )}
      <SegmentedControl
        label="Alinhamento"
        options={[
          { value: "left" as const, label: "Esq" },
          { value: "center" as const, label: "Centro" },
          { value: "right" as const, label: "Dir" },
        ]}
        value={data.alignment}
        onChange={(v) => onUpdate({ alignment: v })}
      />
      <TextInput
        label="Link (URL)"
        value={data.linkUrl ?? ""}
        placeholder="https://..."
        onChange={(v) => onUpdate({ linkUrl: v })}
      />
    </div>
  );
}

function ButtonEditor({
  data,
  onUpdate,
}: {
  data: ButtonData;
  onUpdate: (d: Partial<ButtonData>) => void;
}) {
  return (
    <div className="space-y-3">
      <TextInput
        label="Texto do botão"
        value={data.text}
        onChange={(v) => onUpdate({ text: v })}
      />
      <TextInput
        label="URL"
        value={data.url}
        placeholder="https://..."
        onChange={(v) => onUpdate({ url: v })}
      />
      <ColorInput
        label="Cor do botão"
        value={data.buttonColor}
        onChange={(v) => onUpdate({ buttonColor: v })}
      />
      <ColorInput
        label="Cor do texto"
        value={data.textColor}
        onChange={(v) => onUpdate({ textColor: v })}
      />
      <SliderInput
        label="Borda arredondada"
        value={data.borderRadius}
        min={0}
        max={20}
        unit="px"
        onChange={(v) => onUpdate({ borderRadius: v })}
      />
      <SegmentedControl
        label="Tamanho"
        options={[
          { value: "sm" as const, label: "P" },
          { value: "md" as const, label: "M" },
          { value: "lg" as const, label: "G" },
        ]}
        value={data.size}
        onChange={(v) => onUpdate({ size: v })}
      />
      <SegmentedControl
        label="Alinhamento"
        options={[
          { value: "left" as const, label: "Esq" },
          { value: "center" as const, label: "Centro" },
          { value: "right" as const, label: "Dir" },
        ]}
        value={data.alignment}
        onChange={(v) => onUpdate({ alignment: v })}
      />
    </div>
  );
}

function DividerEditor({
  data,
  onUpdate,
}: {
  data: DividerData;
  onUpdate: (d: Partial<DividerData>) => void;
}) {
  return (
    <div className="space-y-3">
      <ColorInput
        label="Cor"
        value={data.color}
        onChange={(v) => onUpdate({ color: v })}
      />
      <SliderInput
        label="Espessura"
        value={data.thickness}
        min={1}
        max={5}
        unit="px"
        onChange={(v) => onUpdate({ thickness: v })}
      />
      <SegmentedControl
        label="Estilo"
        options={[
          { value: "solid" as const, label: "Sólido" },
          { value: "dashed" as const, label: "Tracejado" },
          { value: "dotted" as const, label: "Pontilhado" },
        ]}
        value={data.style}
        onChange={(v) => onUpdate({ style: v })}
      />
      <SliderInput
        label="Largura"
        value={data.width}
        min={20}
        max={100}
        unit="%"
        onChange={(v) => onUpdate({ width: v })}
      />
    </div>
  );
}

function ColumnsEditor({
  data,
  onUpdate,
}: {
  data: ColumnsData;
  onUpdate: (d: Partial<ColumnsData>) => void;
}) {
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Layout"
        options={[
          { value: "50-50" as const, label: "50/50" },
          { value: "33-67" as const, label: "33/67" },
          { value: "67-33" as const, label: "67/33" },
          { value: "33-33-33" as const, label: "33/33/33" },
        ]}
        value={data.layout}
        onChange={(v) => onUpdate({ layout: v })}
      />
      <SliderInput
        label="Espaçamento"
        value={data.gap}
        min={0}
        max={20}
        unit="px"
        onChange={(v) => onUpdate({ gap: v })}
      />
    </div>
  );
}

const SOCIAL_PLATFORMS = [
  "Facebook",
  "Instagram",
  "LinkedIn",
  "Twitter/X",
  "YouTube",
  "WhatsApp",
  "TikTok",
];

function SocialEditor({
  data,
  onUpdate,
}: {
  data: SocialData;
  onUpdate: (d: Partial<SocialData>) => void;
}) {
  const updateLink = (index: number, field: "platform" | "url", value: string) => {
    const links = [...data.links];
    links[index] = { ...links[index], [field]: value };
    onUpdate({ links });
  };

  const addLink = () => {
    onUpdate({ links: [...data.links, { platform: "Facebook", url: "" }] });
  };

  const removeLink = (index: number) => {
    const links = data.links.filter((_, i) => i !== index);
    onUpdate({ links });
  };

  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Alinhamento"
        options={[
          { value: "left" as const, label: "Esq" },
          { value: "center" as const, label: "Centro" },
          { value: "right" as const, label: "Dir" },
        ]}
        value={data.alignment}
        onChange={(v) => onUpdate({ alignment: v })}
      />
      <SliderInput
        label="Tamanho dos ícones"
        value={data.iconSize}
        min={16}
        max={48}
        unit="px"
        onChange={(v) => onUpdate({ iconSize: v })}
      />

      <div className="space-y-1">
        <SectionLabel>Links sociais</SectionLabel>
        <div className="space-y-2">
          {data.links.map((link, i) => (
            <div key={i} className="space-y-1 rounded border border-gray-100 p-2">
              <div className="flex items-center gap-1">
                <select
                  value={link.platform}
                  onChange={(e) => updateLink(i, "platform", e.target.value)}
                  className="h-7 flex-1 rounded border border-gray-200 px-1.5 text-xs"
                >
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  className="h-7 w-7 rounded text-gray-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-xs"
                >
                  X
                </button>
              </div>
              <input
                type="text"
                value={link.url}
                placeholder="https://..."
                onChange={(e) => updateLink(i, "url", e.target.value)}
                className="h-7 w-full rounded border border-gray-200 px-1.5 text-xs"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addLink}
          className="mt-1 w-full rounded border border-dashed border-gray-300 py-1.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          + Adicionar link
        </button>
      </div>
    </div>
  );
}

function FooterEditor({
  data,
  onUpdate,
}: {
  data: FooterData;
  onUpdate: (d: Partial<FooterData>) => void;
}) {
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Alinhamento"
        options={[
          { value: "left" as const, label: "Esq" },
          { value: "center" as const, label: "Centro" },
          { value: "right" as const, label: "Dir" },
        ]}
        value={data.alignment}
        onChange={(v) => onUpdate({ alignment: v })}
      />
    </div>
  );
}

function SpacerEditor({
  data,
  onUpdate,
}: {
  data: SpacerData;
  onUpdate: (d: Partial<SpacerData>) => void;
}) {
  return (
    <div className="space-y-3">
      <SliderInput
        label="Altura"
        value={data.height}
        min={10}
        max={100}
        unit="px"
        onChange={(v) => onUpdate({ height: v })}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section name map
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<string, string> = {
  header: "Cabeçalho",
  text: "Texto",
  image: "Imagem",
  button: "Botão",
  divider: "Divisor",
  columns: "Colunas",
  social: "Redes Sociais",
  footer: "Rodapé",
  spacer: "Espaçador",
};

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  section: EmailSection | null;
  globalStyle: GlobalStyle;
  onUpdateSection: (data: Partial<SectionData>, style?: Partial<SectionStyle>) => void;
  onUpdateGlobalStyle: (style: Partial<GlobalStyle>) => void;
}

export default function PropertiesPanel({
  section,
  globalStyle,
  onUpdateSection,
  onUpdateGlobalStyle,
}: PropertiesPanelProps) {
  const updateData = (d: Partial<SectionData>) => onUpdateSection(d);
  const updateStyle = (s: Partial<SectionStyle>) => onUpdateSection({}, s);

  return (
    <aside className="w-[300px] shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
      <div className="p-4 space-y-4">
        {!section ? (
          <GlobalStyleEditor globalStyle={globalStyle} onChange={onUpdateGlobalStyle} />
        ) : (
          <>
            {/* Section title */}
            <h3 className="text-sm font-semibold text-gray-900">
              {SECTION_LABELS[section.type] ?? section.type}
            </h3>

            {/* Shared style */}
            <SharedStyleEditor style={section.style} onUpdate={updateStyle} />

            {/* Per-type editor */}
            {section.type === "header" && (
              <HeaderEditor
                data={section.data as HeaderData}
                onUpdate={updateData}
              />
            )}
            {section.type === "image" && (
              <ImageEditor
                data={section.data as ImageData}
                onUpdate={updateData}
              />
            )}
            {section.type === "button" && (
              <ButtonEditor
                data={section.data as ButtonData}
                onUpdate={updateData}
              />
            )}
            {section.type === "divider" && (
              <DividerEditor
                data={section.data as DividerData}
                onUpdate={updateData}
              />
            )}
            {section.type === "columns" && (
              <ColumnsEditor
                data={section.data as ColumnsData}
                onUpdate={updateData}
              />
            )}
            {section.type === "social" && (
              <SocialEditor
                data={section.data as SocialData}
                onUpdate={updateData}
              />
            )}
            {section.type === "footer" && (
              <FooterEditor
                data={section.data as FooterData}
                onUpdate={updateData}
              />
            )}
            {section.type === "spacer" && (
              <SpacerEditor
                data={section.data as SpacerData}
                onUpdate={updateData}
              />
            )}
            {section.type === "text" && (
              <p className="text-xs text-gray-400 italic">
                Edite o texto diretamente no canvas.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
