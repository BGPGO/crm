"use client";

import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import clsx from "clsx";

interface PostponeOption {
  label: string;
  getDate: (current: Date) => Date;
}

function getNextMonday(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  return d;
}

const POSTPONE_OPTIONS: PostponeOption[] = [
  {
    label: "Para daqui 1 hora",
    getDate: (current) => new Date(current.getTime() + 60 * 60 * 1000),
  },
  {
    label: "Para daqui 2 horas",
    getDate: (current) => new Date(current.getTime() + 2 * 60 * 60 * 1000),
  },
  {
    label: "Para amanhã",
    getDate: (current) => {
      const d = new Date(current);
      d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    label: "Para daqui 2 dias",
    getDate: (current) => {
      const d = new Date(current);
      d.setDate(d.getDate() + 2);
      return d;
    },
  },
  {
    label: "Para próxima semana",
    getDate: (current) => {
      const monday = getNextMonday(current);
      monday.setHours(current.getHours(), current.getMinutes(), 0, 0);
      return monday;
    },
  },
  {
    label: "Para próximo mês",
    getDate: (current) => {
      const d = new Date(current);
      d.setMonth(d.getMonth() + 1);
      return d;
    },
  },
];

interface PostponeDropdownProps {
  currentDueDate?: string | Date | null;
  onPostpone: (newDate: Date) => void | Promise<void>;
  /** Small icon-only button */
  size?: "sm" | "md";
  className?: string;
}

export default function PostponeDropdown({
  currentDueDate,
  onPostpone,
  size = "sm",
  className,
}: PostponeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = async (option: PostponeOption) => {
    setLoading(true);
    try {
      const baseDate = currentDueDate ? new Date(currentDueDate) : new Date();
      // If the base date is in the past, use now instead
      const reference = baseDate.getTime() < Date.now() ? new Date() : baseDate;
      const newDate = option.getDate(reference);
      await onPostpone(newDate);
      setOpen(false);
    } catch (err) {
      console.error("Erro ao adiar tarefa:", err);
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === "sm" ? 13 : 15;

  return (
    <div ref={ref} className={clsx("relative inline-flex", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        disabled={loading}
        title="Adiar tarefa"
        className={clsx(
          "flex items-center justify-center rounded-md transition-colors",
          size === "sm"
            ? "w-7 h-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            : "w-8 h-8 text-gray-400 hover:text-blue-600 hover:bg-blue-50",
          loading && "opacity-50 cursor-not-allowed"
        )}
      >
        <Clock size={iconSize} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Adiar para
          </p>
          {POSTPONE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(option);
              }}
              disabled={loading}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
