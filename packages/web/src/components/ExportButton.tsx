"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, ChevronDown, Loader2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/api";

type QueryValue = string | string[] | number | boolean | undefined | null;

export interface ExportButtonProps {
  endpoint: string; // e.g. "/contacts/export" — sem o /api inicial
  query?: Record<string, QueryValue>;
  filenameBase: string;
  label?: string;
  size?: "sm" | "md";
}

function getActiveBrand(): "BGP" | "AIMO" {
  if (typeof window === "undefined") return "BGP";
  try {
    const stored = window.localStorage.getItem("crm.brand");
    if (stored === "AIMO" || stored === "BGP") return stored;
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)crm-brand=(BGP|AIMO)/);
    if (match) return match[1] as "BGP" | "AIMO";
  } catch {
    // ignore
  }
  return "BGP";
}

function buildQuery(query: Record<string, QueryValue> | undefined, format: "csv" | "xlsx"): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val === undefined || val === null || val === "") continue;
      if (Array.isArray(val)) {
        const joined = val.filter((v) => v !== undefined && v !== null && v !== "").join(",");
        if (joined) params.set(key, joined);
      } else {
        params.set(key, String(val));
      }
    }
  }
  params.set("format", format);
  return params.toString();
}

export default function ExportButton({
  endpoint,
  query,
  filenameBase,
  label = "Exportar",
  size = "sm",
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loadingFmt, setLoadingFmt] = useState<"csv" | "xlsx" | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleExport = async (format: "csv" | "xlsx") => {
    setOpen(false);
    setLoadingFmt(format);
    try {
      const qs = buildQuery(query, format);
      const authHeaders = await getAuthHeaders();
      const url = `/api${endpoint}${qs ? `?${qs}` : ""}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          ...authHeaders,
          "X-Brand": getActiveBrand(),
        },
      });

      if (!res.ok) {
        let message = `Erro ao exportar (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // ignore
        }
        alert(message);
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Try to read filename from Content-Disposition
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^";]+)"?/i);
      const iso = new Date().toISOString().slice(0, 10);
      const fallback = `${filenameBase}_${iso}.${format}`;
      const downloadName = match?.[1] ?? fallback;

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("Export error:", err);
      alert("Erro ao exportar. Tente novamente.");
    } finally {
      setLoadingFmt(null);
    }
  };

  const padding = size === "sm" ? "px-3 py-1.5" : "px-4 py-2";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loadingFmt !== null}
        className={`flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md ${padding} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loadingFmt ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {label}
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-30 w-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => handleExport("csv")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
          >
            <FileText size={14} className="text-gray-500" />
            CSV (.csv)
          </button>
          <button
            type="button"
            onClick={() => handleExport("xlsx")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left border-t border-gray-100"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Excel (.xlsx)
          </button>
        </div>
      )}
    </div>
  );
}
