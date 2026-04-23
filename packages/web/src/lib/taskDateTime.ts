/**
 * Helpers de data/hora para tarefas (frontend).
 *
 * Ver contexto em packages/api/src/utils/taskDateTime.ts.
 *
 * Resumo:
 *   - Task.dueDateFormat === "UTC"    → dueDate é UTC real (convenção correta)
 *   - Task.dueDateFormat === "LEGACY" → dueDate é UTC literal representando BRT
 *
 * Regra: API já normaliza pra UTC no response. Frontend pode assumir UTC real e
 * formatar com `timeZone: 'America/Sao_Paulo'`. Mas os helpers abaixo lidam com
 * ambos os casos — seguro usar em qualquer lugar.
 */

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
export const BR_TIMEZONE = "America/Sao_Paulo";

export interface TaskDueDateShape {
  dueDate?: string | Date | null;
  dueDateFormat?: string | null;
}

/**
 * Converte o dueDate de uma task pra Date em UTC real.
 * Se o formato for LEGACY, soma 3h. Senão, retorna como está.
 */
export function normalizeDueDate(task: TaskDueDateShape): Date | null {
  if (!task.dueDate) return null;
  const d = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  if (task.dueDateFormat === "LEGACY") {
    return new Date(d.getTime() + BRT_OFFSET_MS);
  }
  return d;
}

/**
 * Formata a data de uma task no padrão pt-BR (dd/mm/aaaa), em timezone BRT.
 */
export function formatTaskDate(task: TaskDueDateShape): string {
  const d = normalizeDueDate(task);
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: BR_TIMEZONE,
  }).format(d);
}

/**
 * Formata só a hora de uma task em BRT (HH:mm).
 */
export function formatTaskTime(task: TaskDueDateShape): string {
  const d = normalizeDueDate(task);
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BR_TIMEZONE,
  }).format(d);
}

/**
 * Formata data + hora de uma task em BRT (dd/mm/aaaa HH:mm).
 */
export function formatTaskDateTime(task: TaskDueDateShape): string {
  const d = normalizeDueDate(task);
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BR_TIMEZONE,
  }).format(d);
}

/**
 * Retorna os componentes de data/hora em BRT (pra lógica tipo "é hoje?", "é amanhã?").
 * Usa Intl.DateTimeFormat com timeZone BRT pra evitar depender do TZ do navegador.
 */
export function getBRTParts(task: TaskDueDateShape): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  const d = normalizeDueDate(task);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

/**
 * Retorna 'YYYY-MM-DDTHH:mm' em BRT, pronto pra preencher um <input type="datetime-local">.
 */
export function toDatetimeLocalInputBRT(task: TaskDueDateShape): string {
  const p = getBRTParts(task);
  if (!p) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Converte uma string de <input type="datetime-local"> (que é hora local/BRT)
 * em ISO UTC real, pronto pra enviar na API.
 *
 * Ex: "2026-04-23T13:00" → "2026-04-23T16:00:00.000Z"
 *
 * Retorna string vazia se input for vazio.
 */
export function brtInputToUtcIso(datetimeLocal: string | null | undefined): string {
  if (!datetimeLocal) return "";
  // Se já tem Z ou offset, deixa como está
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(datetimeLocal)) {
    return new Date(datetimeLocal).toISOString();
  }
  // datetime-local: YYYY-MM-DDTHH:mm[:ss]
  return new Date(`${datetimeLocal}-03:00`).toISOString();
}

/**
 * Mesmo contrato, aceitando um Date já em UTC real.
 */
export function dateToUtcIso(d: Date): string {
  return d.toISOString();
}

/**
 * Retorna uma Date em UTC real a partir de um número de horas a partir de agora,
 * mantendo a hora do dia em BRT (útil pra "daqui 1h", "próxima semana mesmo horário").
 *
 * Não usado diretamente — o PostponeDropdown calcula com aritmética de ms, que já é correto
 * (Date.now + delta funciona independente de TZ).
 */
