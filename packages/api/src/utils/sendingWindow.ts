/**
 * Controla a janela de horário comercial para envios proativos.
 * - Campanhas e follow-ups proativos: 9h–18h, seg–sex (horário de Brasília)
 * - Primeiro contato de lead LP e Bia respondendo: sem restrição (Caminho A)
 */

const TIMEZONE = 'America/Sao_Paulo';
const START_HOUR = 9;
const END_HOUR = 18;

function nowInBrasilia(): { hour: number; weekday: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[weekdayStr] ?? 1;

  return { hour, weekday };
}

/** Retorna true se agora está dentro da janela comercial (9h–18h seg–sex) */
export function isBusinessHours(): boolean {
  const { hour, weekday } = nowInBrasilia();
  const isWeekday = weekday >= 1 && weekday <= 5;
  const isInWindow = hour >= START_HOUR && hour < END_HOUR;
  return isWeekday && isInWindow;
}

/**
 * Retorna quantos milissegundos faltam para o próximo horário comercial.
 * Usado para reagendar follow-ups e mensagens de campanha fora da janela.
 */
export function msUntilNextBusinessHour(): number {
  const now = new Date();
  const { hour, weekday } = nowInBrasilia();

  // Calcular a próxima abertura em Brasília
  let daysAhead = 0;
  let targetHour = START_HOUR;

  if (weekday === 0) {
    // Domingo → segunda
    daysAhead = 1;
  } else if (weekday === 6) {
    // Sábado → segunda
    daysAhead = 2;
  } else if (hour >= END_HOUR) {
    // Após 18h → amanhã (pular fim de semana se necessário)
    daysAhead = weekday === 5 ? 3 : 1; // Sexta após 18h → segunda
  } else if (hour < START_HOUR) {
    // Antes das 9h → hoje às 9h
    daysAhead = 0;
  } else {
    // Dentro da janela — não deveria chamar aqui
    return 0;
  }

  // Construir data alvo às 9h em Brasília
  const target = new Date(now);
  target.setDate(target.getDate() + daysAhead);

  // Ajustar para 9h no timezone de Brasília usando offset
  // Usamos uma abordagem simples: criar a data e ajustar pela diferença de offset
  const targetStr = target.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
  const targetDate = new Date(`${targetStr}T0${targetHour}:00:00`);

  // Corrigir pelo offset do timezone de Brasília (UTC-3, podendo ser UTC-2 no horário de verão)
  const offsetMs = new Date(targetDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()
    - new Date(targetDate.toLocaleString('en-US', { timeZone: TIMEZONE })).getTime();

  const targetUTC = targetDate.getTime() + offsetMs;
  return Math.max(0, targetUTC - now.getTime());
}
