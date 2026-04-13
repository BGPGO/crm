"use client";

import { useState, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Type,
  List,
  ListOrdered,
  Upload,
  Link,
  Trash2,
  Pencil,
  X,
  Check,
  MousePointerClick,
  ImageIcon,
} from "lucide-react";

interface EmailContentPanelProps {
  onFormat: (command: string, value?: string) => void;
  onInsertImage: (dataUrl: string) => void;
  onInsertButton: (text: string, url: string, color: string) => void;
  images: { src: string; index: number }[];
  onRemoveImage: (src: string) => void;
  onChangeImageSrc: (oldSrc: string, newSrc: string) => void;
}

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

function ToolbarButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-700"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-gray-200 mx-0.5" />;
}

function ImageItem({
  src,
  onRemove,
  onChangeSrc,
}: {
  src: string;
  onRemove: () => void;
  onChangeSrc: (newSrc: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [newUrl, setNewUrl] = useState(src);

  const handleSave = () => {
    if (newUrl && newUrl !== src) {
      onChangeSrc(newUrl);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setNewUrl(src);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-2 p-2 rounded border border-gray-100 bg-gray-50">
      <img
        src={src}
        alt=""
        className="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded bg-white text-gray-700"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") handleCancel();
              }}
            />
            <button
              type="button"
              onClick={handleSave}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-green-100 text-green-600"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500 truncate" title={src}>
            {src.length > 50 ? src.slice(0, 50) + "..." : src}
          </p>
        )}
      </div>
      {!editing && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            title="Alterar URL"
            onClick={() => {
              setNewUrl(src);
              setEditing(true);
            }}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Remover imagem"
            onClick={onRemove}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function EmailContentPanel({
  onFormat,
  onInsertImage,
  onInsertButton,
  images,
  onRemoveImage,
  onChangeImageSrc,
}: EmailContentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [btnText, setBtnText] = useState("Agendar Reunião");
  const [btnUrl, setBtnUrl] = useState("https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp?utm_source=email_cadencia&utm_medium=crm");
  const [btnColor, setBtnColor] = useState("#2563eb");

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onInsertImage(reader.result);
      }
    };
    reader.readAsDataURL(file);

    // Reset so the same file can be selected again
    e.target.value = "";
  };

  const handleAddImageUrl = () => {
    if (imageUrl.trim()) {
      onInsertImage(imageUrl.trim());
      setImageUrl("");
    }
  };

  const handleInsertButton = () => {
    if (btnText.trim() && btnUrl.trim()) {
      onInsertButton(btnText.trim(), btnUrl.trim(), btnColor);
      setBtnText("");
      setBtnUrl("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Formatação */}
      <section>
        <SectionTitle icon={Type} label="Formatação" />
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton icon={Bold} title="Negrito" onClick={() => onFormat("bold")} />
          <ToolbarButton icon={Italic} title="Itálico" onClick={() => onFormat("italic")} />
          <ToolbarButton icon={Underline} title="Sublinhado" onClick={() => onFormat("underline")} />
          <ToolbarButton icon={Strikethrough} title="Tachado" onClick={() => onFormat("strikeThrough")} />

          <ToolbarDivider />

          <ToolbarButton icon={AlignLeft} title="Alinhar à esquerda" onClick={() => onFormat("justifyLeft")} />
          <ToolbarButton icon={AlignCenter} title="Centralizar" onClick={() => onFormat("justifyCenter")} />
          <ToolbarButton icon={AlignRight} title="Alinhar à direita" onClick={() => onFormat("justifyRight")} />

          <ToolbarDivider />

          <ToolbarButton icon={Heading1} title="Título 1" onClick={() => onFormat("formatBlock", "h1")} />
          <ToolbarButton icon={Heading2} title="Título 2" onClick={() => onFormat("formatBlock", "h2")} />
          <ToolbarButton icon={Type} title="Texto normal" onClick={() => onFormat("formatBlock", "p")} />

          <ToolbarDivider />

          <ToolbarButton icon={List} title="Lista com marcadores" onClick={() => onFormat("insertUnorderedList")} />
          <ToolbarButton icon={ListOrdered} title="Lista numerada" onClick={() => onFormat("insertOrderedList")} />
        </div>
      </section>

      {/* Imagens */}
      <section>
        <SectionTitle icon={ImageIcon} label="Imagens" />
        <div className="space-y-3">
          {/* Upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Enviar imagem do computador
            </button>
          </div>

          {/* URL input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500">
              Ou cole a URL da imagem
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="https://exemplo.com/imagem.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddImageUrl();
                  }}
                  className="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
              <button
                type="button"
                onClick={handleAddImageUrl}
                disabled={!imageUrl.trim()}
                className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                Inserir
              </button>
            </div>
          </div>

          {/* Image list */}
          {images.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                Imagens no email ({images.length})
              </p>
              {images.map((img) => (
                <ImageItem
                  key={`${img.src}-${img.index}`}
                  src={img.src}
                  onRemove={() => onRemoveImage(img.src)}
                  onChangeSrc={(newSrc) => onChangeImageSrc(img.src, newSrc)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Botão / CTA */}
      <section>
        <SectionTitle icon={MousePointerClick} label="Botão / CTA" />
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Texto do botão
            </label>
            <input
              type="text"
              placeholder="Ex: Saiba mais"
              value={btnText}
              onChange={(e) => setBtnText(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-700 placeholder-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Link do botão
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={btnUrl}
              onChange={(e) => setBtnUrl(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded bg-white text-gray-700 placeholder-gray-400"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600">Cor do botão</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={btnColor}
                onChange={(e) => setBtnColor(e.target.value)}
                className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <span className="text-sm font-mono text-gray-500">{btnColor}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInsertButton}
            disabled={!btnText.trim() || !btnUrl.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <MousePointerClick className="h-4 w-4" />
            Inserir botão
          </button>

          {/* Preview */}
          {btnText.trim() && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-1">Preview:</p>
              <div className="flex justify-center">
                <span
                  className="inline-block px-6 py-2 rounded text-sm font-semibold text-white"
                  style={{ backgroundColor: btnColor }}
                >
                  {btnText}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
