"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, LayoutTemplate, Send, Settings, Workflow } from "lucide-react";
import clsx from "clsx";

const tabs = [
  { label: "Chat", href: "/waba/chat", icon: MessageCircle },
  { label: "Templates", href: "/waba/templates", icon: LayoutTemplate },
  { label: "Broadcasts", href: "/waba/broadcasts", icon: Send },
  { label: "Automacoes", href: "/waba/automacoes", icon: Workflow },
  { label: "Configuracao", href: "/waba/config", icon: Settings },
] as const;

export default function WabaNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (pathname === "/waba") return false;
    return pathname.startsWith(href);
  };

  return (
    <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <nav className="flex items-center gap-1 px-4 md:px-6 overflow-x-auto min-w-0">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400"
                    : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                <Icon size={16} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
