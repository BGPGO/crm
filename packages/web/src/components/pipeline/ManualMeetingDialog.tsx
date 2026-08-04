"use client";

import { useState } from "react";
import { X, Calendar, Clock, Loader2 } from "lucide-react";

interface ManualMeetingDialogProps {
  dealTitle: string;
  contactName: string;
  /** "reschedule" muda os rótulos — a chamada de API fica com quem usa o dialog */
  mode?: "create" | "reschedule";
  /** Pré-preenche data/hora (ISO) — ex.: data da tarefa de reunião */
  initialStartTime?: string | null;
  initialDuration?: number;
  onConfirm: (data: { startTime: string; duration: number; eventType: string; notes: string }) => Promise<void>;
  onCancel: () => void;
}

// Campos date/time trabalham em horário LOCAL (BRT na operação) — o toISOString
// no submit converte pra UTC. Datas vindas da API chegam em UTC e são exibidas
// no fuso local pelos mesmos helpers.
const pad = (n: number) => String(n).padStart(2, "0");
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Próxima meia hora cheia — default melhor que uma hora fixa no passado */
function nextHalfHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
  return d;
}

export default function ManualMeetingDialog({
  dealTitle,
  contactName,
  mode = "create",
  initialStartTime,
  initialDuration,
  onConfirm,
  onCancel,
}: ManualMeetingDialogProps) {
  const initial = (() => {
    if (initialStartTime) {
      const d = new Date(initialStartTime);
      if (!isNaN(d.getTime())) return d;
    }
    return nextHalfHour();
  })();
  const [date, setDate] = useState(toDateInput(initial));
  const [time, setTime] = useState(toTimeInput(initial));
  const [duration, setDuration] = useState(initialDuration || 30);
  const [eventType, setEventType] = useState("Diagnóstico Financeiro");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReschedule = mode === "reschedule";
  const todayInput = toDateInput(new Date());
  // Data de hoje → não deixa escolher horário que já passou
  const minTime = date === todayInput ? toTimeInput(new Date()) : undefined;
  const chosen = date && time ? new Date(`${date}T${time}:00`) : null;
  const isPast = chosen ? chosen.getTime() < Date.now() : false;

  const handleSubmit = async () => {
    if (!date || !time || !chosen || isNaN(chosen.getTime())) {
      setError("Preencha data e horário.");
      return;
    }
    if (isPast) {
      setError("Esse horário já passou — confira a data da reunião.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({ startTime: chosen.toISOString(), duration, eventType, notes });
    } catch (err) {
      const e = err as { message?: string };
      setError(e?.message || "Não foi possível salvar. Tenta de novo.");
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
            <h3 className="text-lg font-semibold text-gray-900">
              {isReschedule ? "Remarcar reunião" : "Agendar Reunião"}
            </h3>
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-petrol-500 focus:outline-none"
                min={new Date().toISOString().split("T")[0]}
                max={new Date(Date.now() + 90 * 86400000).toISOString().split("T")[0]}
                autoComplete="off"
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-petrol-500 focus:outline-none"
                autoComplete="off"
                min={minTime}
                required
              />
            </div>
          </div>

          {isPast && (
            <p className="text-xs text-red-600 font-medium">
              Esse horário já passou — a reunião precisa ser no futuro.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}

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
                      ? "bg-petrol-600 text-white border-petrol-600"
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-petrol-500 focus:outline-none"
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-petrol-500 focus:outline-none resize-none"
            />
          </div>

          {/* Source tag */}
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex-wrap">
            <span className="text-xs font-medium text-amber-700">
              {isReschedule ? "Reagendamento manual" : "Agendamento manual"}
            </span>
            <span className="text-xs text-amber-600">
              — lembretes do lead {isReschedule ? "são movidos pro novo horário" : "serão ativados"} e a
              tarefa de reunião acompanha a data
            </span>
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
            disabled={!date || !time || saving || isPast}
            className="flex-1 py-2 text-sm font-medium text-white bg-petrol-600 hover:bg-petrol-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {saving ? "Salvando..." : isReschedule ? "Remarcar reunião" : "Agendar Reunião"}
          </button>
        </div>
      </div>
    </div>
  );
}
