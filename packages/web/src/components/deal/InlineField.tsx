"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import clsx from "clsx";

interface InlineFieldOption {
  value: string;
  label: string;
}

interface InlineFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: "text" | "date" | "select";
  options?: InlineFieldOption[];
  readOnly?: boolean;
  href?: string;
  formatValue?: (v: string) => string;
}

export default function InlineField({
  label,
  value,
  onChange,
  type = "text",
  options = [],
  readOnly = false,
  href,
  formatValue,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const displayValue = formatValue ? formatValue(value) : value;

  const commit = () => {
    onChange?.(draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing && !readOnly) {
    return (
      <div className="flex flex-col gap-0.5 py-2">
        <span className="text-xs text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          {type === "select" ? (
            <select
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 text-sm border border-blue-400 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            >
              <option value="">Selecione...</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
              className="flex-1 text-sm border border-blue-400 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}
          <button
            onClick={commit}
            className="p-1 text-green-600 hover:text-green-700 flex-shrink-0"
          >
            <Check size={14} />
          </button>
          <button
            onClick={cancel}
            className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-2">
      <span className="text-xs text-gray-400">{label}</span>
      {readOnly ? (
        href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline truncate"
          >
            {displayValue || <span className="italic text-gray-300">—</span>}
          </a>
        ) : (
          <span className="text-sm text-gray-700">
            {displayValue || <span className="italic text-gray-300">—</span>}
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className={clsx(
            "text-sm text-left rounded px-1 -ml-1 hover:bg-blue-50 hover:text-blue-700 transition-colors",
            value ? "text-gray-700" : "italic text-gray-300"
          )}
        >
          {displayValue || "Clique para editar"}
        </button>
      )}
    </div>
  );
}
