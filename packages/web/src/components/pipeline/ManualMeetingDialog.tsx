"use client";

import { useState } from "react";
import { X, Calendar, Clock, Loader2 } from "lucide-react";

interface ManualMeetingDialogProps {
  dealTitle: string;
  contactName: string;
  onConfirm: (data: { startTime: string; duration: number; eventType: string; notes: string }) => Promise<void>;
  onCancel: () => void;
}

export default function ManualMeetingDialog({ dealTitle, contactName, onConfirm, onCancel }: ManualMeetingDialogProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [eventType, setEventType] = useState("Diagnóstico Financeiro");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!date || !time) return;
    setSaving(true);
    try {
      const startTime = new Date(`${date}T${time}:00`).toISOString();
      await onConfirm({ startTime, duration, eventType, notes });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Agendar Reunião</h3>
            <p className="text-sm text-gray-500 mt-0.5">{dealTitle} — {contactName}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar size={13} className="inline mr-1" />Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                min={new Date().toISOString().split("T")[0]}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock size={13} className="inline mr-1" />Horário
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duração</label>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${
                    duration === d
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {d}min
                </button>
              ))}
            </div>
          </div>

          {/* Event type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de reunião</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="Diagnóstico Financeiro">Diagnóstico Financeiro</option>
              <option value="Demonstração GoBI">Demonstração GoBI</option>
              <option value="Demonstração GoControladoria">Demonstração GoControladoria</option>
              <option value="Reunião Comercial">Reunião Comercial</option>
              <option value="Follow-up">Follow-up</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais sobre a reunião..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Source tag */}
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-xs font-medium text-amber-700">Agendamento manual</span>
            <span className="text-xs text-amber-600">— os lembretes automáticos serão ativados</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!date || !time || saving}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? "Salvando..." : "Agendar Reunião"}
          </button>
        </div>
      </div>
    </div>
  );
}
