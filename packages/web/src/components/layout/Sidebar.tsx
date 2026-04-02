"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  MessageSquare,
  MessageCircle,
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
  Menu,
  X,
  Moon,
  Sun,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/lib/api";

const baseNavItems = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/pipeline", label: "Negociações", icon: Kanban },
  { href: "/organizations", label: "Empresas", icon: Building2 },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/reports", label: "Análises", icon: BarChart3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/conversas", label: "Conversas", icon: MessageSquare, restrictTo: "oliver@bertuzzipatrimonial.com.br" },
  { href: "/waba", label: "WhatsApp", icon: MessageCircle },
  { href: "/reunioes", label: "Reuniões", icon: Calendar },
];

interface NotifTask {
  id: string;
  title: string;
  type: "CALL" | "EMAIL" | "MEETING" | "VISIT" | "OTHER";
  dueDate: string | null;
  status: "PENDING" | "COMPLETED" | "OVERDUE";
  dealId: string | null;
  deal: { id: string; title: string } | null;
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
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTasks, setNotifTasks] = useState<NotifTask[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Filter nav items based on user permissions
  const navItems = useMemo(() =>
    baseNavItems.filter((item) => {
      if ('restrictTo' in item && item.restrictTo) {
        return user?.email === item.restrictTo;
      }
      return true;
    }),
    [user?.email]
  );

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      const [pending, overduePending] = await Promise.all([
        api.get<NotifResponse>(`/tasks?userId=${user.id}&status=PENDING&limit=5`),
        api.get<NotifResponse>(`/tasks?userId=${user.id}&status=PENDING&dueDateTo=${today}&limit=5`),
      ]);
      const overdueTotal = overduePending.meta.total;
      const total = pending.meta.total;
      setNotifCount(total);
      setOverdueCount(overdueTotal);
      // Mark overdue tasks, merge overdue first, then non-overdue pending
      const overdueIds = new Set(overduePending.data.map((t) => t.id));
      const overdueTasks = overduePending.data.map((t) => ({ ...t, status: "OVERDUE" as const }));
      const nonOverduePending = pending.data.filter((t) => !overdueIds.has(t.id));
      const merged = [...overdueTasks, ...nonOverduePending].slice(0, 8);
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
  const displayName = user?.name || "Usuário";

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 md:gap-6 flex-shrink-0 z-30">
      {/* Hamburger button - mobile only */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="md:hidden p-1.5 -ml-1 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>

      {/* Logo */}
      <Link href="/" className="flex items-center gap-1.5 flex-shrink-0 mr-2">
        <span className="font-bold text-base text-gray-900 tracking-tight">
          BGPGO <span className="text-blue-600">CRM</span>
        </span>
      </Link>

      {/* Navigation links - hidden on mobile */}
      <nav className="hidden md:flex items-center gap-0.5 flex-1">
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

      {/* Spacer for mobile to push right-side items */}
      <div className="flex-1 md:hidden" />

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

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

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
                        href={task.deal ? `/pipeline/${task.deal.id}` : "/tasks"}
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
                          {task.deal && (
                            <p className="text-xs text-blue-600 truncate mt-0.5">{task.deal.title}</p>
                          )}
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
                  Configurações
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

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Slide-in panel */}
          <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl flex flex-col animate-slide-in-left">
            {/* Panel header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200">
              <span className="text-lg font-bold text-blue-600">BGPGO CRM</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>
            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-2">
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive =
                  href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            {/* User info at bottom */}
            <div className="border-t border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
