"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

interface DrawerProps {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Tailwind width classes for the panel (default w-full sm:w-[460px]) */
  widthClass?: string;
}

/** Painel lateral direito com overlay — mesmo padrão visual do WabaSidebar. */
export default function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  widthClass = "w-full sm:w-[460px]",
}: DrawerProps) {
  // Esc fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className={clsx(
          "fixed right-0 top-0 h-full bg-white shadow-2xl z-50 flex flex-col",
          widthClass
        )}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900 truncate">{title}</div>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-gray-200 flex-shrink-0">{footer}</div>}
      </div>
    </>
  );
}
