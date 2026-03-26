"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Mail,
  Phone,
  Video,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Meeting {
  id: string;
  eventType: string;
  inviteeEmail: string;
  inviteeName: string | null;
  hostName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  dealId: string | null;
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  reminders?: Array<{
    id: string;
    stepNumber: number;
    label: string;
    status: string;
    scheduledAt: string;
    sentAt?: string;
  }>;
}

interface MeetingStats {
  today: number;
  thisWeek: number;
  total: number;
}

// ─── Mini Calendar ──────────────────────────────────────────────────────────

function MiniCalendar({ meetings, selectedDate, onSelectDate }: {
  meetings: Meeting[];
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0

  // Count meetings per day
  const meetingDays = new Map<string, number>();
  meetings.forEach(m => {
    const d = new Date(m.startTime);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    meetingDays.set(key, (meetingDays.get(key) || 0) + 1);
  });

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const isSelected = (d: number) =>
    selectedDate && d === selectedDate.getDate() &&
    month === selectedDate.getMonth() && year === selectedDate.getFullYear();

  const getMeetingCount = (d: number) =>
    meetingDays.get(`${year}-${month}-${d}`) || 0;

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  const monthName = viewMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded text-gray-500">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-700 capitalize">{monthName}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded text-gray-500">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
          <span key={d} className="text-[10px] font-medium text-gray-400 py-1">{d}</span>
        ))}
        {days.map((day, i) => {
          if (day === null) return <span key={`empty-${i}`} />;
          const count = getMeetingCount(day);
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <button
              key={day}
              onClick={() => {
                const clickedDate = new Date(year, month, day);
                if (sel) onSelectDate(null);
                else onSelectDate(clickedDate);
              }}
              className={clsx(
                "relative w-8 h-8 mx-auto rounded-full text-xs font-medium transition-colors",
                sel ? "bg-blue-600 text-white" :
                tod ? "bg-blue-50 text-blue-700 font-bold" :
                "text-gray-700 hover:bg-gray-100"
              )}
            >
              {day}
              {count > 0 && !sel && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                    <span key={j} className="w-1 h-1 rounded-full bg-blue-500" />
                  ))}
                </span>
              )}
              {count > 0 && sel && (
                <span className="absolute -top-1 -right-1 bg-white text-blue-600 text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center border border-blue-200">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ReunioesPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stats, setStats] = useState<MeetingStats>({
    today: 0,
    thisWeek: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"upcoming" | "past" | "all">(
    "upcoming"
  );
  const [hostFilter, setHostFilter] = useState<string>("all");
  const [hosts, setHosts] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const fetchHosts = useCallback(async () => {
    try {
      const res = await api.get<{ data: string[] }>("/calendly/config/meetings/hosts");
      setHosts(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchHosts(); }, [fetchHosts]);

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const url = `/calendly/config/meetings?period=${period}${hostFilter !== 'all' ? `&hostName=${encodeURIComponent(hostFilter)}` : ''}`;
      const res = await api.get<{ data: Meeting[] }>(url);
      const meetingsData = res.data || [];
      setMeetings(meetingsData);

      // Batch load reminders for all meetings
      if (meetingsData.length > 0) {
        const meetingIds = meetingsData.map((m: Meeting) => m.id);
        try {
          const remindersRes = await api.get<{ data: Array<{ meetingId: string; stepNumber: number; label: string; status: string; scheduledAt: string; sentAt?: string }> }>(`/meeting-reminders/by-meetings?ids=${meetingIds.join(',')}`);
          const remindersByMeeting = new Map<string, any[]>();
          (remindersRes.data || []).forEach((r: any) => {
            const arr = remindersByMeeting.get(r.meetingId) || [];
            arr.push(r);
            remindersByMeeting.set(r.meetingId, arr);
          });
          setMeetings(prev => prev.map(m => ({ ...m, reminders: remindersByMeeting.get(m.id) || [] })));
        } catch { /* silent */ }
      }
    } catch {
      console.error("Erro ao carregar reunioes");
    } finally {
      setLoading(false);
    }
  }, [period, hostFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ data: MeetingStats }>(
        "/calendly/config/meetings/stats"
      );
      setStats(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMeetings();
      fetchStats();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchMeetings, fetchStats]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTimeUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff < 0) return "Passada";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `em ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `em ${hours}h ${minutes}min`;
    return `em ${minutes}min`;
  };

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  };

  const isSoon = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 2 * 60 * 60 * 1000; // within 2 hours
  };

  const filteredMeetings = selectedDate
    ? meetings.filter(m => {
        const d = new Date(m.startTime);
        return d.getDate() === selectedDate.getDate() &&
          d.getMonth() === selectedDate.getMonth() &&
          d.getFullYear() === selectedDate.getFullYear();
      })
    : meetings;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Reunioes" breadcrumb={["Reunioes"]} />

      <div className="px-4 sm:px-6 py-6 flex-1 overflow-y-auto">
        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar size={20} className="text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.today}
                </p>
                <p className="text-xs text-gray-500">Hoje</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Clock size={20} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.thisWeek}
                </p>
                <p className="text-xs text-gray-500">Esta semana</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Video size={20} className="text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.total}
                </p>
                <p className="text-xs text-gray-500">Total agendadas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Period filter + Host filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(
            [
              { key: "upcoming", label: "Proximas" },
              { key: "past", label: "Passadas" },
              { key: "all", label: "Todas" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setPeriod(f.key)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                period === f.key
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {f.label}
            </button>
          ))}

          {/* Host filter */}
          <div className="relative ml-2">
            <select
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
              className="appearance-none text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-7 hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos os responsáveis</option>
              {hosts.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">&#9662;</span>
          </div>
        </div>

        {/* Two-column layout: meetings list + calendar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Meetings list — takes 2 cols */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-gray-100 rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredMeetings.length === 0 ? (
                <div className="p-12 text-center">
                  <Calendar
                    size={48}
                    className="mx-auto text-gray-300 mb-3"
                  />
                  <p className="text-gray-500">
                    {selectedDate
                      ? "Nenhuma reunião neste dia"
                      : "Nenhuma reuniao encontrada"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredMeetings.map((meeting) => (
                    <div
                      key={meeting.id}
                      onClick={() => meeting.dealId && router.push(`/pipeline/${meeting.dealId}`)}
                      className={clsx(
                        "px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors",
                        meeting.dealId && "cursor-pointer",
                        isSoon(meeting.startTime) &&
                          "bg-yellow-50 border-l-4 border-l-yellow-400",
                        isToday(meeting.startTime) &&
                          !isSoon(meeting.startTime) &&
                          "bg-blue-50/30"
                      )}
                    >
                      {/* Date/Time block */}
                      <div className="w-20 text-center flex-shrink-0">
                        <p className="text-xs font-medium text-gray-500 uppercase">
                          {formatDate(meeting.startTime)}
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {formatTime(meeting.startTime)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {formatTime(meeting.endTime)}
                        </p>
                      </div>

                      {/* Separator */}
                      <div className="w-px h-12 bg-gray-200 flex-shrink-0" />

                      {/* Contact info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {meeting.contact?.name ||
                            meeting.inviteeName ||
                            meeting.inviteeEmail}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {meeting.inviteeEmail && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Mail size={12} /> {meeting.inviteeEmail}
                            </span>
                          )}
                          {meeting.contact?.phone && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Phone size={12} /> {meeting.contact.phone}
                            </span>
                          )}
                        </div>
                        {meeting.hostName && (
                          <span className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                            <User size={11} /> {meeting.hostName}
                          </span>
                        )}
                      </div>

                      {/* Reminder status */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(meeting.reminders || []).map((r) => (
                          <span
                            key={r.id}
                            title={r.label || `${r.stepNumber}min antes`}
                            className={clsx(
                              "w-2 h-2 rounded-full",
                              r.status === 'SENT' ? "bg-green-400" :
                              r.status === 'PENDING' ? "bg-amber-400" :
                              "bg-gray-300"
                            )}
                          />
                        ))}
                      </div>

                      {/* Time until */}
                      <div className="flex-shrink-0 text-right">
                        <span
                          className={clsx(
                            "text-xs font-medium px-2 py-1 rounded-full",
                            isSoon(meeting.startTime)
                              ? "bg-yellow-100 text-yellow-700"
                              : meeting.status === "canceled"
                                ? "bg-red-100 text-red-600"
                                : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {meeting.status === "canceled"
                            ? "Cancelada"
                            : getTimeUntil(meeting.startTime)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Calendar — takes 1 col */}
          <div className="space-y-4">
            <MiniCalendar
              meetings={meetings}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
              >
                Limpar filtro de data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
