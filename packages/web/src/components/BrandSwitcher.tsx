"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import clsx from "clsx";
import { Brand, useBrand } from "@/contexts/BrandContext";

const BRANDS: { value: Brand; label: string; sub: string }[] = [
  { value: "BGP", label: "BGP", sub: "Bertuzzi Patrimonial" },
  { value: "AIMO", label: "AIMO", sub: "AIMO Capital" },
];

export default function BrandSwitcher() {
  const { brand, setBrand } = useBrand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isAimo = brand === "AIMO";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors",
          isAimo
            ? "border-transparent text-white shadow-sm"
            : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
        )}
        style={isAimo ? { backgroundColor: "#1E3FFF" } : undefined}
        title={`Marca ativa: ${brand}`}
        aria-label="Trocar marca"
      >
        <span
          className={clsx(
            "inline-block w-1.5 h-1.5 rounded-full",
            isAimo ? "bg-white" : "bg-emerald-500"
          )}
        />
        <span className="tracking-wide">{brand}</span>
        <ChevronDown
          size={12}
          className={clsx("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Selecionar marca
            </p>
          </div>
          {BRANDS.map((b) => {
            const active = b.value === brand;
            const isAimoOption = b.value === "AIMO";
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!active) setBrand(b.value);
                }}
                className={clsx(
                  "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-gray-50 text-gray-900"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={clsx(
                      "inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold tracking-wider",
                      isAimoOption
                        ? "text-white"
                        : "bg-emerald-100 text-emerald-700"
                    )}
                    style={
                      isAimoOption ? { backgroundColor: "#1E3FFF" } : undefined
                    }
                  >
                    {b.label}
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-sm font-medium">{b.label}</span>
                    <span className="text-[11px] text-gray-500">{b.sub}</span>
                  </span>
                </span>
                {active && <Check size={14} className="text-emerald-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Always-visible thin top stripe shown when AIMO brand is active, to avoid mistakes. */
export function BrandStripe() {
  const { brand } = useBrand();
  if (brand !== "AIMO") return null;
  return (
    <div
      className="h-[2px] w-full flex-shrink-0"
      style={{ backgroundColor: "#1E3FFF" }}
      aria-hidden="true"
    />
  );
}
