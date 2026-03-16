"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogOut,
  Settings,
  User,
  Clock,
  Phone,
  Mail,
  Calendar,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const navItems = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/pipeline", label: "Negociacoes", icon: Kanban },
  { href: "/organizations", label: "Empresas", icon: Building2 },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/reports", label: "Analises", icon: BarChart3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
];

interface NotifTask {
  id: string;
  title: string;
  type: "CALL" | "EMAIL" | "MEETING" | "VISIT" | "OTHER";
  dueDate: string | null;
  status: "PENDING" | "COMPLETED" | "OVERDUE";
}

interface NotifResponse {
  data: NotifTask[];
  meta: { total: number };
}

const taskTypeIcons: Record<string, typeof Phone> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  VISIT: MapPin,
  OTHER: MoreHorizontal,
};

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTasks, setNotifTasks] = useState<NotifTask[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [pending, overdue] = await Promise.all([
        api.get<NotifResponse>(`/tasks?userId=${user.id}&status=PENDING&limit=5`),
        api.get<NotifResponse>(`/tasks?userId=${user.id}&status=OVERDUE&limit=5`),
      ]);
      const total = pending.meta.total + overdue.meta.total;
      setNotifCount(total);
      setOverdueCount(overdue.meta.total);
      // Merge overdue first, then pending, max 8
      const merged = [...overdue.data, ...pending.data].slice(0, 8);
      setNotifTasks(merged);
    } catch {
      // silent
    }
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 300000);
    const onTasksChanged = () => fetchNotifications();
    window.addEventListener('tasks-changed', onTasksChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('tasks-changed', onTasksChanged);
    };
  }, [fetchNotifications]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
    router.replace("/login");
  };

  const initials = user ? getInitials(user.name) : "?";
  const displayName = user?.name || "Usuario";

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
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen((prev) => !prev)}
            className={clsx(
              "relative p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors",
              overdueCount > 0 && "animate-bounce"
            )}
          >
            <Bell size={18} className={clsx(overdueCount > 0 && "text-red-500")} />
            {notifCount > 0 && (
              <span className={clsx(
                "absolute -top-1 -right-1 flex items-center justify-center bg-red-500 text-white font-bold rounded-full",
                overdueCount > 0
                  ? "min-w-[20px] h-5 px-1.5 text-[11px] animate-pulse"
                  : "min-w-[16px] h-4 px-1 text-[10px]"
              )}>
                {notifCount > 99 ? "99+" : notifCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
              {overdueCount > 0 && (
                <div className="px-4 py-2.5 bg-red-600 text-white flex items-center gap-2 rounded-t-lg">
                  <span className="text-sm">🔴</span>
                  <span className="text-xs font-bold">{overdueCount} tarefa{overdueCount > 1 ? "s" : ""} atrasada{overdueCount > 1 ? "s" : ""}</span>
                </div>
              )}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Notificações</h3>
                {notifCount > 0 && (
                  <span className="text-xs text-gray-500">{notifCount} pendente{notifCount !== 1 ? "s" : ""}</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifTasks.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhuma tarefa pendente
                  </div>
                ) : (
                  notifTasks.map((task) => {
                    const TIcon = taskTypeIcons[task.type] || MoreHorizontal;
                    const isOverdue = task.status === "OVERDUE";
                    return (
                      <Link
                        key={task.id}
                        href="/tasks"
                        onClick={() => setNotifOpen(false)}
                        className={clsx(
                          "flex items-start gap-3 px-4 py-3 transition-colors border-b border-gray-50 last:border-0",
                          isOverdue
                            ? "bg-red-50 border-l-4 border-l-red-500 hover:bg-red-100"
                            : "hover:bg-gray-50"
                        )}
                      >
                        <div className={clsx(
                          "mt-0.5 p-1.5 rounded-full flex-shrink-0",
                          isOverdue ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                        )}>
                          {isOverdue ? <Clock size={12} /> : <TIcon size={12} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{task.title}</p>
                          <p className={clsx(
                            "text-xs mt-0.5",
                            isOverdue ? "text-red-500 font-medium" : "text-gray-400"
                          )}>
                            {isOverdue ? "Atrasada" : "Pendente"}
                            {task.dueDate && ` · ${new Date(task.dueDate).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
              {notifCount > notifTasks.length && (
                <Link
                  href="/tasks"
                  onClick={() => setNotifOpen(false)}
                  className="block px-4 py-2.5 text-center text-xs font-medium text-blue-600 hover:bg-blue-50 border-t border-gray-100 transition-colors"
                >
                  Ver todas as tarefas
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Avatar + Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
              {initials}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-900 max-w-[120px] truncate">
              {displayName}
            </span>
            <ChevronDown
              size={13}
              className={clsx(
                "text-gray-400 transition-transform",
                dropdownOpen && "rotate-180"
              )}
            />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user?.email || ""}
                </p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings size={15} className="text-gray-400" />
                  Configuracoes
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User size={15} className="text-gray-400" />
                  Meu Perfil
                </Link>
              </div>

              {/* Logout */}
              <div className="border-t border-gray-100 py-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} />
                  Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
