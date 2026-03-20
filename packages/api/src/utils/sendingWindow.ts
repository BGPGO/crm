/**
 * Controla a janela de horário comercial para envios proativos.
 *
 * Janelas permitidas (horário de Brasília):
 *   Seg–Sex:  9h–18h
 *   Sábado:   9h–13h
 *   Domingo:  Bloqueado
 *   Feriados: Bloqueado (tratados como domingo)
 *
 * Primeiro contato de lead LP e Bia respondendo: sem restrição (Caminho A).
 */

const TIMEZONE = 'America/Sao_Paulo';
const START_HOUR = 9;
const END_HOUR_WEEKDAY = 18;
const END_HOUR_SATURDAY = 13;

// ---------------------------------------------------------------------------
// Helpers de timezone — usa Intl.DateTimeFormat para toda conversão
// ---------------------------------------------------------------------------

interface BrasiliaInfo {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun … 6=Sat
}

/**
 * Retorna componentes de data/hora em Brasília para um dado Date (UTC instante).
 * Usa Intl.DateTimeFormat — sem cálculo manual de offset.
 */
function toBrasilia(date: Date): BrasiliaInfo {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '0';

  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/**
 * Dado ano/mês/dia + hora em Brasília, retorna o instante UTC como Date.
 * Abordagem: cria um timestamp "chute" e itera até convergir usando Intl.
 */
function brasiliaToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  // Chute inicial: monta como se fosse UTC-3
  const guess = new Date(Date.UTC(year, month - 1, day, hour + 3, minute, second));
  const info = toBrasilia(guess);

  // Corrige diferença (cobre horário de verão caso volte a existir)
  const diffHours = hour - info.hour;
  const diffMinutes = minute - info.minute;
  return new Date(guess.getTime() + diffHours * 3_600_000 + diffMinutes * 60_000);
}

// ---------------------------------------------------------------------------
// Feriados nacionais brasileiros
// ---------------------------------------------------------------------------

/**
 * Algoritmo de Meeus/Jones/Butcher para calcular a data da Páscoa.
 * Retorna [month, day].
 */
function easterDate(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

/** Retorna Date em UTC que representa meia-noite de um dia específico */
function makeDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Soma dias a uma Date UTC */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Retorna um Set de strings "MM-DD" com todos os feriados nacionais do ano.
 * Formato "MM-DD" para comparação rápida.
 */
function getHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  const pad = (n: number) => String(n).padStart(2, '0');
  const key = (m: number, d: number) => `${pad(m)}-${pad(d)}`;
  const addFromDate = (dt: Date) => {
    holidays.add(key(dt.getUTCMonth() + 1, dt.getUTCDate()));
  };

  // Feriados fixos
  holidays.add(key(1, 1));   // Confraternização Universal
  holidays.add(key(4, 21));  // Tiradentes
  holidays.add(key(5, 1));   // Dia do Trabalho
  holidays.add(key(9, 7));   // Independência do Brasil
  holidays.add(key(10, 12)); // Nossa Senhora Aparecida
  holidays.add(key(11, 2));  // Finados
  holidays.add(key(11, 15)); // Proclamação da República
  holidays.add(key(11, 20)); // Dia da Consciência Negra
  holidays.add(key(12, 25)); // Natal

  // Feriados móveis baseados na Páscoa
  const [eMonth, eDay] = easterDate(year);
  const easter = makeDate(year, eMonth, eDay);

  // Sexta-Feira Santa: 2 dias antes da Páscoa
  addFromDate(addDays(easter, -2));

  // Carnaval: segunda (47 dias antes) e terça (46 dias antes)
  addFromDate(addDays(easter, -47));
  addFromDate(addDays(easter, -46));

  // Corpus Christi: 60 dias após a Páscoa
  addFromDate(addDays(easter, 60));

  return holidays;
}

// Cache de feriados por ano para evitar recalcular
const holidayCache = new Map<number, Set<string>>();

function getHolidaysCached(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = getHolidays(year);
    holidayCache.set(year, set);
    // Manter no máximo 3 anos no cache
    if (holidayCache.size > 3) {
      const oldest = holidayCache.keys().next().value;
      if (oldest !== undefined) {
        holidayCache.delete(oldest);
      }
    }
  }
  return set;
}

/**
 * Verifica se uma data cai em feriado nacional brasileiro.
 * O Date é interpretado no fuso de Brasília.
 */
export function isHoliday(date: Date): boolean {
  const info = toBrasilia(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  const k = `${pad(info.month)}-${pad(info.day)}`;
  return getHolidaysCached(info.year).has(k);
}

// ---------------------------------------------------------------------------
// Janela de horário comercial
// ---------------------------------------------------------------------------

interface WindowCheck {
  inWindow: boolean;
  reason?: string;
}

function checkWindow(date: Date): WindowCheck {
  const info = toBrasilia(date);
  const { hour, weekday } = info;

  // Feriado → bloqueado
  if (isHoliday(date)) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      inWindow: false,
      reason: `Feriado nacional (${pad(info.day)}/${pad(info.month)}/${info.year})`,
    };
  }

  // Domingo → bloqueado
  if (weekday === 0) {
    return { inWindow: false, reason: 'Domingo — envios bloqueados' };
  }

  // Sábado → 9h–13h
  if (weekday === 6) {
    if (hour >= START_HOUR && hour < END_HOUR_SATURDAY) {
      return { inWindow: true };
    }
    return {
      inWindow: false,
      reason: `Sábado fora da janela (${hour}h — permitido ${START_HOUR}h–${END_HOUR_SATURDAY}h)`,
    };
  }

  // Seg–Sex → 9h–18h
  if (hour >= START_HOUR && hour < END_HOUR_WEEKDAY) {
    return { inWindow: true };
  }
  return {
    inWindow: false,
    reason: `Fora do horário comercial (${hour}h — permitido ${START_HOUR}h–${END_HOUR_WEEKDAY}h)`,
  };
}

/** Retorna true se agora está dentro da janela comercial */
export function isBusinessHours(): boolean {
  const now = new Date();
  const result = checkWindow(now);
  if (!result.inWindow && result.reason) {
    console.log(`[sendingWindow] Fora da janela: ${result.reason}`);
  }
  return result.inWindow;
}

/**
 * Retorna quantos milissegundos faltam para o próximo horário comercial.
 * Pula fins de semana e feriados.
 */
export function msUntilNextBusinessHour(): number {
  const now = new Date();
  const info = toBrasilia(now);

  // Se já está na janela, retorna 0
  if (checkWindow(now).inWindow) {
    return 0;
  }

  // Estratégia: encontrar o próximo dia/hora válido iterando dia a dia
  // Começar pelo candidato mais provável
  let candidateYear = info.year;
  let candidateMonth = info.month;
  let candidateDay = info.day;
  let candidateHour = START_HOUR;

  // Se hoje ainda pode abrir (antes da hora de início, dia útil, não feriado),
  // o candidato é hoje mesmo às START_HOUR
  const todayEndHour = info.weekday === 6 ? END_HOUR_SATURDAY : END_HOUR_WEEKDAY;
  const todayIsWorkday = info.weekday >= 1 && info.weekday <= 6;

  if (todayIsWorkday && info.hour < todayEndHour && !isHoliday(now)) {
    // Hoje antes do fim da janela — abre às START_HOUR (ou já passou)
    candidateHour = START_HOUR;
  } else {
    // Avançar para amanhã
    const tomorrow = addDays(makeDate(info.year, info.month, info.day), 1);
    candidateYear = tomorrow.getUTCFullYear();
    candidateMonth = tomorrow.getUTCMonth() + 1;
    candidateDay = tomorrow.getUTCDate();
  }

  // Iterar até encontrar um dia útil que não seja feriado (máx 15 dias segurança)
  for (let i = 0; i < 15; i++) {
    const candidate = brasiliaToUTC(candidateYear, candidateMonth, candidateDay, candidateHour);
    const cInfo = toBrasilia(candidate);

    const isSunday = cInfo.weekday === 0;
    const isHol = isHoliday(candidate);

    if (!isSunday && !isHol) {
      // Dia válido — calcular ms
      const ms = candidate.getTime() - now.getTime();
      const result = checkWindow(candidate);
      if (result.inWindow && ms > 0) {
        console.log(
          `[sendingWindow] Próxima janela: ${String(candidateDay).padStart(2, '0')}/${String(candidateMonth).padStart(2, '0')}/${candidateYear} às ${START_HOUR}h (em ${Math.round(ms / 60_000)} min)`,
        );
        return ms;
      }
    }

    // Avançar um dia
    const next = addDays(makeDate(candidateYear, candidateMonth, candidateDay), 1);
    candidateYear = next.getUTCFullYear();
    candidateMonth = next.getUTCMonth() + 1;
    candidateDay = next.getUTCDate();
  }

  // Fallback — não deveria chegar aqui; retorna 1h como segurança
  console.warn('[sendingWindow] Não foi possível calcular próxima janela, usando fallback de 1h');
  return 3_600_000;
}
