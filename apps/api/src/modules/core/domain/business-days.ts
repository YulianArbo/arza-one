import { addDays, isoWeekday } from './calendar-date.js';

// Días hábiles (numeral 13.2): los días del horario laboral que no son festivos. Gobiernan los
// plazos de PQRSF, de las consultas de titulares y de los acuerdos de servicio.

export interface WorkCalendar {
  /** Días laborales de la semana: 1 lunes … 7 domingo. */
  readonly workdays: ReadonlySet<number>;
  /** Festivos, como AAAA-MM-DD. */
  readonly holidays: ReadonlySet<string>;
}

export function isBusinessDay(date: string, calendar: WorkCalendar): boolean {
  return calendar.workdays.has(isoWeekday(date)) && !calendar.holidays.has(date);
}

/**
 * Fecha en que se cumple un plazo de `days` días hábiles contados desde el día siguiente a
 * `from`: radicado el viernes, «1 día hábil» vence el lunes (o el martes si el lunes es festivo).
 */
export function addBusinessDays(from: string, days: number, calendar: WorkCalendar): string {
  if (calendar.workdays.size === 0) throw new Error('El horario laboral no tiene días.');
  let date = from;
  let counted = 0;
  while (counted < days) {
    date = addDays(date, 1);
    if (isBusinessDay(date, calendar)) counted += 1;
  }
  return date;
}
