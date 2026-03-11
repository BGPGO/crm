"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Building2,
  CheckSquare,
  BarChart3,
  Megaphone,
  Bell,
  Search,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";

const navItems = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/pipeline", label: "Negociações", icon: Kanban },
  { href: "/organizations", label: "Empresas", icon: Building2 },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/reports", label: "Análises", icon: BarChart3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
];

export default function TopNavbar() {
  const pathname = usePathname();

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-6 flex-shrink-0 z-30">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-1.5 flex-shrink-0 mr-2">
        <span className="font-bold text-base text-gray-900 tracking-tight">
          BGPGO <span className="text-blue-600">CRM</span>
        </span>
      </Link>

      {/* Navigation links */}
      <nav className="flex items-center gap-0.5 flex-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              <Icon size={15} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Right side: search, notifications, avatar */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar..."
            className="pl-8 pr-3 py-1.5 text-sm bg-gray-100 border border-transparent rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </button>

        {/* Avatar */}
        <button className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
            U
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-900">
            Usuário
          </span>
          <ChevronDown size={13} className="text-gray-400" />
        </button>
      </div>
    </header>
  );
}
