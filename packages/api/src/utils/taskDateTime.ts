/**
 * Helpers de data/hora para tarefas.
 *
 * Contexto: o campo `Task.dueDate` historicamente era salvo como "UTC literal representando BRT"
 * (ex: user digita 13h → "13:00:00Z" no banco, representando 13h BRT).
 * A partir de 2026-04-23, novos registros salvam UTC real ("13h BRT" → "16:00:00Z").
 *
 * O campo `Task.dueDateFormat` distingue os dois formatos:
 *   - "UTC"    → dueDate já é UTC real (novo padrão)
 *   - "LEGACY" → dueDate é UTC literal representando BRT (pré-fix)
 *
 * Sempre que for LER dueDate pra comparar/exibir, passe o task pra `normalizeDueDate`.
 * Sempre que for ESCREVER dueDate vindo de input datetime-local BRT, use `parseDueDateInput`.
 */

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // Brasil não tem DST desde 2019

export interface TaskDueDateShape {
  dueDate: Date | string | null | undefined;
  dueDateFormat?: string | null;
}

/**
 * Normaliza dueDate pra UTC real.
 * - Se o formato for LEGACY, soma 3h (porque "13Z" representava 13h BRT = 16Z real)
 * - Se for UTC (ou ausente — default), retorna como está
 *
 * Retorna null se dueDate for null/undefined.
 */
export function normalizeDueDate(task: TaskDueDateShape): Date | null {
  if (!task.dueDate) return null;
  const d = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  if (task.dueDateFormat === 'LEGACY') {
    return new Date(d.getTime() + BRT_OFFSET_MS);
  }
  return d;
}

/**
 * Parseia input de dueDate vindo do cliente.
 *
 * Casos aceitos:
 *   - "2026-04-23"             (date-only)       → 00:00 BRT = 03:00 UTC
 *   - "2026-04-23T13:00"       (datetime-local)  → 13:00 BRT = 16:00 UTC
 *   - "2026-04-23T13:00:00"    (datetime s/Z)    → idem acima
 *   - "2026-04-23T16:00:00Z"   (ISO com Z)       → já é UTC real, usa direto
 *   - Date object                                → retorna como está
 *
 * Sempre retorna Date em UTC real (ou null).
 */
export function parseDueDateInput(
  input: string | Date | null | undefined
): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return input;
  if (typeof input !== 'string') return null;

  // Já tem timezone explícito (Z ou ±HH:MM)? Usa direto.
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(input)) {
    return new Date(input);
  }

  // Date-only "YYYY-MM-DD" → 00:00 BRT
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00-03:00`);
  }

  // Datetime-local "YYYY-MM-DDTHH:mm" ou "YYYY-MM-DDTHH:mm:ss" → interpretar como BRT
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(input)) {
    return new Date(`${input}-03:00`);
  }

  // Fallback: deixa JS interpretar (pode dar resultado dependente do TZ do servidor)
  return new Date(input);
}

/**
 * Metadata de escrita: retorna o payload pra persistir um novo dueDate no Prisma.
 * Sempre marca como UTC (porque estamos escrevendo com a convenção correta).
 */
export function buildDueDatePersist(
  input: string | Date | null | undefined
): { dueDate: Date | null; dueDateFormat: 'UTC' } {
  return {
    dueDate: parseDueDateInput(input),
    dueDateFormat: 'UTC',
  };
}

/**
 * Serializa uma task pra resposta da API, normalizando dueDate em UTC real.
 * Frontend pode consumir direto com `timeZone: 'America/Sao_Paulo'`.
 *
 * Após a chamada, o objeto fica com dueDateFormat='UTC' (reflete o dueDate já normalizado).
 */
export function serializeTaskDueDate<T extends TaskDueDateShape>(task: T): T {
  if (!task.dueDate) return task;
  const normalized = normalizeDueDate(task);
  return {
    ...task,
    dueDate: normalized,
    dueDateFormat: 'UTC',
  };
}
