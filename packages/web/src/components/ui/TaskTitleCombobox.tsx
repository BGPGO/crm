"use client";

import { useState, useRef, useEffect } from "react";
import clsx from "clsx";

const COMMON_TITLES = [
  "Reunião marcada",
  "Follow Up",
  "Ligar",
  "Cobrar",
  "Desligar",
];

interface TaskTitleComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Render a compact version (no label wrapper) */
  compact?: boolean;
}

export default function TaskTitleCombobox({
  value,
  onChange,
  placeholder = "Título da tarefa...",
  autoFocus,
  className,
  compact,
}: TaskTitleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? COMMON_TITLES.filter((t) =>
        t.toLowerCase().includes(value.toLowerCase())
      )
    : COMMON_TITLES;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (title: string) => {
    onChange(title);
    setOpen(false);
    setFocusedIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    } else if (e.key === "Enter" && focusedIndex >= 0 && focusedIndex < filtered.length) {
      e.preventDefault();
      handleSelect(filtered[focusedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setFocusedIndex(-1);
    }
  };

  const inputEl = (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setOpen(true);
        setFocusedIndex(-1);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={clsx(
        compact
          ? "w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          : "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white placeholder:text-gray-400",
        className
      )}
    />
  );

  return (
    <div ref={wrapperRef} className="relative">
      {inputEl}
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
          {filtered.map((title, idx) => (
            <li
              key={title}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(title);
              }}
              onMouseEnter={() => setFocusedIndex(idx)}
              className={clsx(
                "px-3 py-2 text-sm cursor-pointer transition-colors",
                focusedIndex === idx
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-700 hover:bg-gray-50"
              )}
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
