"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Filter, TrendingUp, Mail, Zap } from "lucide-react";
import clsx from "clsx";

const tabs = [
  { label: "Leads", href: "/marketing/leads", icon: Users },
  { label: "Segmentos", href: "/marketing/segments", icon: Filter },
  { label: "Lead Scoring", href: "/marketing/lead-scoring", icon: TrendingUp },
  { label: "Emails", href: "/marketing/emails", icon: Mail },
  { label: "Automações", href: "/marketing/automations", icon: Zap },
] as const;

export default function MarketingNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/marketing/leads") {
      return pathname === "/marketing/leads" || pathname === "/marketing";
    }
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
