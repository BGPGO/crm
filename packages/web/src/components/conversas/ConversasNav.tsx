"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Send, Zap, Settings } from "lucide-react";
import clsx from "clsx";

const tabs = [
  { label: "Conversas", href: "/conversas/chat", icon: MessageSquare },
  { label: "Leads WhatsApp", href: "/conversas/leads", icon: Users },
  { label: "Campanhas", href: "/conversas/campanhas", icon: Send },
  { label: "Automações", href: "/conversas/automacoes", icon: Zap },
  { label: "Configuração", href: "/conversas/configuracao", icon: Settings },
] as const;

export default function ConversasNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (pathname === "/conversas") return false;
    return pathname.startsWith(href);
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <nav className="flex items-center gap-1 px-6 overflow-x-auto">
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
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
