"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
} from "lucide-react";
import clsx from "clsx";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  minRows?: number;
  id?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  onSubmit,
  placeholder = "Escreva uma anotação...",
  minRows = 8,
  id,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline cursor-pointer",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-3 py-2.5 min-h-[12rem] resize-y overflow-auto",
        style: `min-height: ${minRows * 1.5}rem`,
        id: id || "",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          onSubmit?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // If content is just an empty paragraph, treat as empty
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external content changes (e.g., clearing after submit)
  useEffect(() => {
    if (editor && content !== editor.getHTML() && content === "") {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL do link:", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        "p-1.5 rounded transition-colors",
        isActive
          ? "bg-violet-100 text-violet-700"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Negrito (Ctrl+B)"
        >
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Itálico (Ctrl+I)"
        >
          <Italic size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Título H2"
        >
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Título H3"
        >
          <Heading3 size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Lista"
        >
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Lista numerada"
        >
          <ListOrdered size={15} />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive("link")}
          title="Inserir link"
        >
          <LinkIcon size={15} />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remover link"
          >
            <Unlink size={15} />
          </ToolbarButton>
        )}
      </div>

      {/* Editor area */}
      <div ref={editorRef}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
