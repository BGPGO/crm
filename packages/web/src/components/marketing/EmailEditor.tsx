"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useCallback, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Minus,
  Link as LinkIcon,
  ImageIcon,
  Type,
  Palette,
  Highlighter,
  X,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Custom FontSize extension (email-safe inline styles)
// ---------------------------------------------------------------------------

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.fontSize || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmailEditorProps {
  content: string;
  onChange: (html: string) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const FONT_SIZES = [
  { label: "12px", value: "12px" },
  { label: "14px", value: "14px" },
  { label: "16px", value: "16px" },
  { label: "18px", value: "18px" },
  { label: "20px", value: "20px" },
  { label: "24px", value: "24px" },
  { label: "28px", value: "28px" },
  { label: "32px", value: "32px" },
];

const HEADING_OPTIONS = [
  { label: "Normal", value: 0 },
  { label: "Titulo 1", value: 1 },
  { label: "Titulo 2", value: 2 },
  { label: "Titulo 3", value: 3 },
] as const;

const PRESET_COLORS = [
  "#000000",
  "#434343",
  "#666666",
  "#999999",
  "#E03131",
  "#E8590C",
  "#F59F00",
  "#40C057",
  "#1C7ED6",
  "#7950F2",
  "#E64980",
  "#FFFFFF",
];

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function ToolbarDivider() {
  return <div className="w-px self-stretch bg-gray-200 mx-1 shrink-0" />;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "flex items-center justify-center w-8 h-8 rounded text-sm transition-colors",
        active
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-100",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Color Picker Popover
// ---------------------------------------------------------------------------

interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

function ColorPicker({ currentColor, onSelect, onClose }: ColorPickerProps) {
  const [custom, setCustom] = useState(currentColor || "#000000");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-52"
    >
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => {
              onSelect(color);
              onClose();
            }}
            className={clsx(
              "w-7 h-7 rounded border transition-transform hover:scale-110",
              color === currentColor
                ? "ring-2 ring-blue-500 ring-offset-1"
                : "border-gray-200"
            )}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0"
        />
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={() => {
            onSelect(custom);
            onClose();
          }}
          className="flex items-center justify-center w-7 h-7 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          title="Aplicar cor"
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link Popover
// ---------------------------------------------------------------------------

interface LinkPopoverProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

function LinkPopover({
  initialUrl,
  onSubmit,
  onRemove,
  onClose,
}: LinkPopoverProps) {
  const [url, setUrl] = useState(initialUrl);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72"
    >
      <label className="block text-xs font-medium text-gray-600 mb-1">
        URL do link
      </label>
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com"
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit(url);
              onClose();
            }
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            onSubmit(url);
            onClose();
          }}
          className="flex items-center justify-center w-8 h-8 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          title="Aplicar"
        >
          <Check size={14} />
        </button>
        {initialUrl && (
          <button
            type="button"
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="flex items-center justify-center w-8 h-8 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            title="Remover link"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image Popover
// ---------------------------------------------------------------------------

interface ImagePopoverProps {
  onSubmit: (url: string) => void;
  onClose: () => void;
}

function ImagePopover({ onSubmit, onClose }: ImagePopoverProps) {
  const [url, setUrl] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72"
    >
      <label className="block text-xs font-medium text-gray-600 mb-1">
        URL da imagem
      </label>
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://exemplo.com/imagem.png"
          className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (url.trim()) {
                onSubmit(url.trim());
                onClose();
              }
            }
          }}
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            if (url.trim()) {
              onSubmit(url.trim());
              onClose();
            }
          }}
          disabled={!url.trim()}
          className="flex items-center justify-center w-8 h-8 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
          title="Inserir imagem"
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

interface ToolbarProps {
  editor: ReturnType<typeof useEditor>;
}

function Toolbar({ editor }: ToolbarProps) {
  const [showTextColor, setShowTextColor] = useState(false);
  const [showHighlight, setShowHighlight] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const closeAllPopovers = useCallback(() => {
    setShowTextColor(false);
    setShowHighlight(false);
    setShowLink(false);
    setShowImage(false);
  }, []);

  if (!editor) return null;

  const currentHeading = (() => {
    for (let i = 1; i <= 3; i++) {
      if (editor.isActive("heading", { level: i })) return i;
    }
    return 0;
  })();

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 px-2 py-2 bg-white border-b border-gray-200">
      {/* Group 1 - Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Negrito (Ctrl+B)"
      >
        <Bold size={16} strokeWidth={2.5} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Itálico (Ctrl+I)"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Sublinhado (Ctrl+U)"
      >
        <UnderlineIcon size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Tachado"
      >
        <Strikethrough size={16} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Group 2 - Typography */}
      <select
        value={
          FONT_FAMILIES.find((f) =>
            editor.isActive("textStyle", { fontFamily: f.value })
          )?.value ?? ""
        }
        onChange={(e) => {
          if (e.target.value) {
            editor.chain().focus().setFontFamily(e.target.value).run();
          } else {
            editor.chain().focus().unsetFontFamily().run();
          }
        }}
        className="h-8 px-2 text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        title="Fonte"
      >
        <option value="">Fonte</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        value={
          FONT_SIZES.find((s) =>
            editor.isActive("textStyle", { fontSize: s.value })
          )?.value ?? ""
        }
        onChange={(e) => {
          if (e.target.value) {
            editor
              .chain()
              .focus()
              .setMark("textStyle", { fontSize: e.target.value })
              .run();
          } else {
            editor
              .chain()
              .focus()
              .unsetMark("textStyle")
              .run();
          }
        }}
        className="h-8 px-2 text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        title="Tamanho da fonte"
      >
        <option value="">Tamanho</option>
        {FONT_SIZES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <ToolbarDivider />

      {/* Group 3 - Colors */}
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            closeAllPopovers();
            setShowTextColor((prev) => !prev);
          }}
          active={showTextColor}
          title="Cor do texto"
        >
          <Palette size={16} />
        </ToolbarButton>
        {showTextColor && (
          <ColorPicker
            currentColor={
              (editor.getAttributes("textStyle").color as string) || "#000000"
            }
            onSelect={(color) => {
              editor.chain().focus().setColor(color).run();
            }}
            onClose={() => setShowTextColor(false)}
          />
        )}
      </div>

      <div className="relative">
        <ToolbarButton
          onClick={() => {
            closeAllPopovers();
            setShowHighlight((prev) => !prev);
          }}
          active={showHighlight || editor.isActive("highlight")}
          title="Cor de destaque"
        >
          <Highlighter size={16} />
        </ToolbarButton>
        {showHighlight && (
          <ColorPicker
            currentColor={
              (editor.getAttributes("highlight").color as string) || "#F59F00"
            }
            onSelect={(color) => {
              editor.chain().focus().toggleHighlight({ color }).run();
            }}
            onClose={() => setShowHighlight(false)}
          />
        )}
      </div>

      <ToolbarDivider />

      {/* Group 4 - Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Alinhar à esquerda"
      >
        <AlignLeft size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Centralizar"
      >
        <AlignCenter size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Alinhar à direita"
      >
        <AlignRight size={16} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Group 5 - Structure */}
      <select
        value={currentHeading}
        onChange={(e) => {
          const level = Number(e.target.value);
          if (level === 0) {
            editor.chain().focus().setParagraph().run();
          } else {
            editor
              .chain()
              .focus()
              .toggleHeading({ level: level as 1 | 2 | 3 })
              .run();
          }
        }}
        className="h-8 px-2 text-xs bg-white border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        title="Tipo de parágrafo"
      >
        {HEADING_OPTIONS.map((h) => (
          <option key={h.value} value={h.value}>
            {h.label}
          </option>
        ))}
      </select>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Lista com marcadores"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Linha horizontal"
      >
        <Minus size={16} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Group 6 - Media */}
      <div className="relative">
        <ToolbarButton
          onClick={() => {
            closeAllPopovers();
            setShowLink((prev) => !prev);
          }}
          active={editor.isActive("link") || showLink}
          title="Inserir link"
        >
          <LinkIcon size={16} />
        </ToolbarButton>
        {showLink && (
          <LinkPopover
            initialUrl={
              (editor.getAttributes("link").href as string) || ""
            }
            onSubmit={(url) => {
              if (url) {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: url, target: "_blank" })
                  .run();
              }
            }}
            onRemove={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
            }}
            onClose={() => setShowLink(false)}
          />
        )}
      </div>

      <div className="relative">
        <ToolbarButton
          onClick={() => {
            closeAllPopovers();
            setShowImage((prev) => !prev);
          }}
          active={showImage}
          title="Inserir imagem"
        >
          <ImageIcon size={16} />
        </ToolbarButton>
        {showImage && (
          <ImagePopover
            onSubmit={(url) => {
              editor.chain().focus().setImage({ src: url }).run();
            }}
            onClose={() => setShowImage(false)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main EmailEditor component
// ---------------------------------------------------------------------------

export default function EmailEditor({
  content,
  onChange,
  className,
}: EmailEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      FontSize,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      Image.configure({ inline: true }),
      Placeholder.configure({
        placeholder: "Comece a escrever seu email aqui...",
      }),
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose max-w-none focus:outline-none min-h-[500px] px-6 py-4",
      },
    },
  });

  return (
    <div
      className={clsx(
        "border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm",
        "focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent",
        className
      )}
    >
      <Toolbar editor={editor} />
      <div className="overflow-y-auto" style={{ maxHeight: "70vh" }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
