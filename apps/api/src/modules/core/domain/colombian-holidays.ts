import { addDays, isoWeekday } from './calendar-date.js';

// Festivos de Colombia (Ley 51 de 1983, «ley Emiliani», y Ley 37 de 1905). Unos caen siempre en su
// fecha; otros se trasladan al lunes siguiente; los de Semana Santa y los que dependen de ella se
// cuentan desde el domingo de Pascua.

export interface HolidayDefinition {
  readonly date: string;
  readonly name: string;
}

/** Domingo de Pascua (algoritmo anónimo gregoriano, de Meeus). */
export function easterSunday(year: number): string {
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
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** El mismo día si es lunes; si no, el lunes siguiente. */
function nextMonday(date: string): string {
  return addDays(date, (8 - isoWeekday(date)) % 7);
}

const FIXED: readonly [string, string][] = [
  ['01-01', 'Año Nuevo'],
  ['05-01', 'Día del Trabajo'],
  ['07-20', 'Día de la Independencia'],
  ['08-07', 'Batalla de Boyacá'],
  ['12-08', 'Inmaculada Concepción'],
  ['12-25', 'Navidad'],
];

const MOVED_TO_MONDAY: readonly [string, string][] = [
  ['01-06', 'Día de los Reyes Magos'],
  ['03-19', 'Día de San José'],
  ['06-29', 'San Pedro y San Pablo'],
  ['08-15', 'Asunción de la Virgen'],
  ['10-12', 'Día de la Raza'],
  ['11-01', 'Todos los Santos'],
  ['11-11', 'Independencia de Cartagena'],
];

/** Días después del domingo de Pascua; los tres últimos ya incluyen el traslado al lunes. */
const FROM_EASTER: readonly [number, string][] = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón de Jesús'],
];

/**
 * Festivos del año, en orden. Si dos caen el mismo lunes (como en 2019), queda uno solo con los
 * dos nombres.
 */
export function colombianHolidays(year: number): HolidayDefinition[] {
  const prefix = String(year);
  const easter = easterSunday(year);
  const all: HolidayDefinition[] = [
    ...FIXED.map(([day, name]) => ({ date: `${prefix}-${day}`, name })),
    ...MOVED_TO_MONDAY.map(([day, name]) => ({ date: nextMonday(`${prefix}-${day}`), name })),
    ...FROM_EASTER.map(([offset, name]) => ({ date: addDays(easter, offset), name })),
  ];
  const byDate = new Map<string, string>();
  for (const { date, name } of all) {
    const existing = byDate.get(date);
    byDate.set(date, existing === undefined ? name : `${existing} y ${name}`);
  }
  return [...byDate.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
