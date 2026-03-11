"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={clsx("border-b border-gray-100 last:border-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-3 px-4 text-left group hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <ChevronDown
          size={15}
          className={clsx(
            "text-gray-400 transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
