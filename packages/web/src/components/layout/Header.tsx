"use client";

import { Bell, Search } from "lucide-react";

interface HeaderProps {
  title: string;
  breadcrumb?: string[];
}

export default function Header({ title, breadcrumb }: HeaderProps) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0 z-10">
      {/* Left: Title / Breadcrumb */}
      <div>
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-0.5">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span>/</span>}
                <span>{crumb}</span>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      {/* Right: Search + Notifications + Avatar */}
      <div className="flex items-center gap-3">
        {/* Global Search */}
        <div className="relative hidden sm:block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Buscar..."
            className="pl-9 pr-4 py-2 text-sm bg-gray-100 border border-transparent rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
          />
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full" />
        </button>

        {/* Avatar */}
        <button className="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
            U
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-gray-900 leading-none">Usuário</p>
            <p className="text-xs text-gray-500 mt-0.5">Admin</p>
          </div>
        </button>
      </div>
    </header>
  );
}
