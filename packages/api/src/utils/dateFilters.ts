// Parsing das datas dos filtros de negociação (createdAt/updatedAt/closedAt/expectedClose).
//
// Os inputs do front são <input type="datetime-local">, que enviam a data SEM
// fuso (ex: "2026-07-23T00:00"). A API roda em UTC, então new Date(str)
// interpretava a string como UTC e deslocava a janela em 3h — leads que entram
// após 21h BRT "vazavam" para o dia seguinte no filtro (relatório 7h contava
// 18, filtro do CRM mostrava 14). Ancoramos em BRT (-03:00 fixo; Brasil não tem
// horário de verão desde 2019), igual o relatório diário do funil faz.
const BRT_OFFSET = '-03:00';

const hasExplicitTZ = (v: string) => /[zZ]$|[+-]\d{2}:\d{2}$/.test(v);

/** Ancora uma data de filtro em BRT. endOfDay=true completa 23:59:59.999 quando a string não traz horário. */
export function parseFilterDate(val: string, endOfDay: boolean): Date {
  if (hasExplicitTZ(val)) return new Date(val); // já veio com fuso — respeita
  let s = val.includes('T')
    ? val
    : `${val}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`;
  // datetime-local vem como HH:mm; garante os segundos antes de anexar o offset
  const time = s.split('T')[1] ?? '';
  if ((time.match(/:/g) || []).length === 1) s += ':00';
  return new Date(s + BRT_OFFSET);
}

export const parseFilterFrom = (val: string): Date => parseFilterDate(val, false);
export const parseFilterTo = (val: string): Date => parseFilterDate(val, true);
