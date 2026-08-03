"use client";

import { useState, useEffect } from "react";
import Drawer from "@/components/ui/Drawer";
import {
  Calendar,
  Clock,
  Phone,
  Mail,
  MessageCircle,
  MessageSquare,
  User as UserIcon,
  Video,
  Kanban,
  Bell,
} from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { openWhatsAppChat } from "@/lib/whatsapp";

export interface CentralMeeting {
  id: string;
  eventType: string;
  inviteeEmail: string;
  inviteeName: string | null;
  hostName: string | null;
  dealOwnerName: string | null;
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
}

interface Reminder {
  id: string;
  meetingId: string;
  stepNumber: number;
  label: string;
  status: string;
  scheduledAt: string;
  sentAt?: string;
}

interface MeetingDrawerProps {
  meeting: CentralMeeting;
  onClose: () => void;
  onOpenDeal: (dealId: string) => void;
  onOpenConversation: (args: { dealId: string; contactName: string; contactPhone: string }) => void;
}

export default function MeetingDrawer({
  meeting,
  onClose,
  onOpenDeal,
  onOpenConversation,
}: MeetingDrawerProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ data: Reminder[] }>(
          `/meeting-reminders/by-meetings?ids=${meeting.id}`
        );
        if (!cancelled) setReminders(res.data || []);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meeting.id]);

  const name = meeting.contact?.name || meeting.inviteeName || meeting.inviteeEmail;
  const phone = meeting.contact?.phone || null;
  const email = meeting.contact?.email || meeting.inviteeEmail || null;

  const start = new Date(meeting.startTime);
  const end = new Date(meeting.endTime);
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateLong = start.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const diff = start.getTime() - Date.now();
  const timeUntil =
    diff < 0
      ? "já começou"
      : diff > 24 * 60 * 60 * 1000
        ? `em ${Math.floor(diff / (24 * 60 * 60 * 1000))}d`
        : diff > 60 * 60 * 1000
          ? `em ${Math.floor(diff / (60 * 60 * 1000))}h ${Math.floor((diff % (60 * 60 * 1000)) / 60000)}min`
          : `em ${Math.floor(diff / 60000)}min`;

  const reminderStatusCls: Record<string, string> = {
    SENT: "bg-green-100 text-green-700",
    PENDING: "bg-amber-100 text-amber-700",
    CANCELED: "bg-gray-100 text-gray-500",
    FAILED: "bg-red-100 text-red-600",
  };

  return (
    <Drawer title={name} subtitle={meeting.eventType} onClose={onClose}>
      <div className="divide-y divide-gray-100">
        {/* Quando */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-petrol-50 flex items-center justify-center flex-shrink-0">
              <Calendar size={20} className="text-petrol-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 capitalize">{dateLong}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <Clock size={11} />
                {fmtTime(start)} – {fmtTime(end)}
                {meeting.status !== "canceled" && (
                  <span className="ml-1 text-[11px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {timeUntil}
                  </span>
                )}
              </p>
            </div>
          </div>
          {meeting.status === "canceled" && (
            <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Esta reunião foi cancelada
            </p>
          )}
          {(meeting.dealOwnerName || meeting.hostName) && (
            <p className="mt-3 text-xs text-gray-500 flex items-center gap-1.5">
              <UserIcon size={12} className="text-gray-400" />
              Responsável: {meeting.dealOwnerName || meeting.hostName}
            </p>
          )}
        </div>

        {/* Contato + ações */}
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Contato
          </p>
          <p className="text-sm font-medium text-gray-900">{name}</p>
          <div className="mt-1 space-y-0.5">
            {phone && (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Phone size={11} /> {phone}
              </p>
            )}
            {email && (
              <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
                <Mail size={11} /> {email}
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {phone && (
              <button
                onClick={() => openWhatsAppChat(phone)}
                className="flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <MessageCircle size={14} /> WhatsApp
              </button>
            )}
            {meeting.dealId && (
              <>
                <button
                  onClick={() =>
                    onOpenConversation({
                      dealId: meeting.dealId!,
                      contactName: name,
                      contactPhone: phone || "",
                    })
                  }
                  className="flex items-center gap-1.5 text-xs font-medium bg-petrol-50 text-petrol-700 hover:bg-petrol-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <MessageSquare size={14} /> Conversa
                </button>
                <button
                  onClick={() => onOpenDeal(meeting.dealId!)}
                  className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Kanban size={14} /> Negociação
                </button>
              </>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Mail size={14} /> E-mail
              </a>
            )}
          </div>
        </div>

        {/* Lembretes */}
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Bell size={11} /> Lembretes
          </p>
          {reminders.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum lembrete programado</p>
          ) : (
            <div className="space-y-1.5">
              {reminders
                .sort((a, b) => a.stepNumber - b.stepNumber)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{r.label || `${r.stepNumber}min antes`}</span>
                    <span
                      className={clsx(
                        "font-medium px-2 py-0.5 rounded-full",
                        reminderStatusCls[r.status] || "bg-gray-100 text-gray-500"
                      )}
                    >
                      {r.status === "SENT"
                        ? "Enviado"
                        : r.status === "PENDING"
                          ? "Agendado"
                          : r.status === "CANCELED"
                            ? "Cancelado"
                            : r.status}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Detalhes técnicos */}
        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Video size={11} /> Evento
          </p>
          <p className="text-xs text-gray-600">{meeting.eventType}</p>
          {meeting.hostName && (
            <p className="text-xs text-gray-400 mt-0.5">Host Calendly: {meeting.hostName}</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}
