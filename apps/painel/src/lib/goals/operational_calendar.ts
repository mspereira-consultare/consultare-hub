/**
 * Calendário operacional único da Clínica Consultare.
 *
 * Critério de negócio definido pela gerência (19/08/2026):
 *   - segunda a sexta ............ 1,0 dia operacional
 *   - sábado ..................... 0,5 dia operacional
 *   - domingo .................... 0,0
 *   - feriado (nacional/Campinas)  0,0
 *
 * Toda projeção de meta (painel de metas, produtividade, dashboard executivo e
 * checklist da recepção) precisa usar este módulo para que os multiplicadores
 * fiquem consistentes entre as páginas.
 */

export const OPERATIONAL_WEIGHT_WEEKDAY = 1;
export const OPERATIONAL_WEIGHT_SATURDAY = 0.5;
export const OPERATIONAL_WEIGHT_SUNDAY = 0;

const clean = (value: unknown) => String(value ?? '').trim();

export const parseIsoDate = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(value)) ? clean(value) : null);

const toUtcDate = (dateIso: string) => {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
};

const toIso = (date: Date) => date.toISOString().slice(0, 10);

export const shiftDate = (dateIso: string, deltaDays: number) => {
  const date = toUtcDate(dateIso);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return toIso(date);
};

export const monthStart = (dateIso: string) => `${dateIso.slice(0, 7)}-01`;

export const monthEnd = (dateIso: string) => {
  const [year, month] = dateIso.slice(0, 7).split('-').map(Number);
  return toIso(new Date(Date.UTC(year || 0, month || 1, 0)));
};

/** Segunda-feira da semana do dateIso (semana comercial de segunda a domingo). */
export const weekStart = (dateIso: string) => {
  const weekday = toUtcDate(dateIso).getUTCDay();
  const deltaToMonday = weekday === 0 ? -6 : 1 - weekday;
  return shiftDate(dateIso, deltaToMonday);
};

export const weekEnd = (dateIso: string) => shiftDate(weekStart(dateIso), 6);

/** Domingo de Páscoa pelo algoritmo gregoriano anônimo. */
const easterSunday = (year: number) => {
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
  return toIso(new Date(Date.UTC(year, month - 1, day)));
};

/**
 * Feriados fixos. Ajuste aqui caso a gestão inclua/retire uma data —
 * o restante do sistema deriva tudo deste array.
 */
const FIXED_HOLIDAYS: Array<{ monthDay: string; label: string }> = [
  { monthDay: '01-01', label: 'Confraternização Universal' },
  { monthDay: '04-14', label: 'Aniversário de Campinas' },
  { monthDay: '04-21', label: 'Tiradentes' },
  { monthDay: '05-01', label: 'Dia do Trabalho' },
  { monthDay: '09-07', label: 'Independência' },
  { monthDay: '10-12', label: 'Nossa Senhora Aparecida' },
  { monthDay: '11-02', label: 'Finados' },
  { monthDay: '11-15', label: 'Proclamação da República' },
  { monthDay: '11-20', label: 'Consciência Negra' },
  { monthDay: '12-08', label: 'Nossa Senhora da Conceição (padroeira de Campinas)' },
  { monthDay: '12-25', label: 'Natal' },
];

/** Feriados móveis, em dias de deslocamento a partir do Domingo de Páscoa. */
const MOVABLE_HOLIDAYS: Array<{ offset: number; label: string }> = [
  { offset: -47, label: 'Carnaval' },
  { offset: -2, label: 'Sexta-feira Santa' },
  { offset: 60, label: 'Corpus Christi' },
];

const holidayCacheByYear = new Map<number, Map<string, string>>();

export const listHolidays = (year: number): Map<string, string> => {
  const cached = holidayCacheByYear.get(year);
  if (cached) return cached;

  const holidays = new Map<string, string>();
  for (const item of FIXED_HOLIDAYS) holidays.set(`${year}-${item.monthDay}`, item.label);

  const easter = easterSunday(year);
  for (const item of MOVABLE_HOLIDAYS) holidays.set(shiftDate(easter, item.offset), item.label);

  holidayCacheByYear.set(year, holidays);
  return holidays;
};

export const getHolidayLabel = (dateIso: string) => {
  const iso = parseIsoDate(dateIso);
  if (!iso) return null;
  return listHolidays(Number(iso.slice(0, 4))) .get(iso) || null;
};

export const isHoliday = (dateIso: string) => !!getHolidayLabel(dateIso);

/** Peso operacional do dia: 1 em dias úteis, 0,5 no sábado, 0 em domingos e feriados. */
export const dayWeight = (dateIso: string) => {
  const iso = parseIsoDate(dateIso);
  if (!iso) return 0;
  if (isHoliday(iso)) return 0;
  const weekday = toUtcDate(iso).getUTCDay();
  if (weekday === 0) return OPERATIONAL_WEIGHT_SUNDAY;
  if (weekday === 6) return OPERATIONAL_WEIGHT_SATURDAY;
  return OPERATIONAL_WEIGHT_WEEKDAY;
};

export const isOperationalDay = (dateIso: string) => dayWeight(dateIso) > 0;

/** Soma dos pesos operacionais no intervalo fechado [startDate, endDate]. */
export const sumOperationalWeight = (startDate: string, endDate: string) => {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end || end < start) return 0;

  let cursor = start;
  let total = 0;
  while (cursor <= end) {
    total += dayWeight(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return Number(total.toFixed(6));
};

export const operationalDaysInMonth = (dateIso: string) =>
  sumOperationalWeight(monthStart(dateIso), monthEnd(dateIso));

/** Dias operacionais já fechados no mês, ou seja, do dia 1 até a véspera de dateIso. */
export const operationalDaysClosedInMonth = (dateIso: string) =>
  sumOperationalWeight(monthStart(dateIso), shiftDate(dateIso, -1));

/** Dias operacionais restantes no mês, contando dateIso como dia inteiro. */
export const operationalDaysRemainingInMonth = (dateIso: string) =>
  sumOperationalWeight(dateIso, monthEnd(dateIso));

export const operationalDaysInWeek = (dateIso: string) =>
  sumOperationalWeight(weekStart(dateIso), weekEnd(dateIso));

export const operationalDaysClosedInWeek = (dateIso: string) =>
  sumOperationalWeight(weekStart(dateIso), shiftDate(dateIso, -1));

/** Próximo dia operacional anterior a dateIso (usado pela visão D-1). */
export const previousOperationalDate = (dateIso: string) => {
  let cursor = shiftDate(dateIso, -1);
  let guard = 0;
  while (!isOperationalDay(cursor) && guard < 366) {
    cursor = shiftDate(cursor, -1);
    guard += 1;
  }
  return cursor;
};
