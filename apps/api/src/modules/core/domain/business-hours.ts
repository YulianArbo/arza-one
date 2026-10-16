import { isBusinessDay, type WorkCalendar } from './business-days.js';
import { addDays, fromCalendarDate, toCalendarDate } from './calendar-date.js';

// Horas hábiles (ficha 17.5): las de las jornadas del horario laboral en los días hábiles. Gobiernan
// los plazos de los flujos y las tareas. Se cuentan en la hora de Colombia (UTC-5 todo el año).

const MINUTE_MS = 60 * 1000;
const BOGOTA_OFFSET_MS = 5 * 60 * MINUTE_MS;
/** Ningún plazo de flujo pasa de 2000 horas hábiles; diez años de búsqueda bastan de sobra. */
const MAX_DAYS = 3660;

/** Una jornada en minutos desde la medianoche: 08:00–12:00 es 480–720. */
interface Shift {
  readonly start: number;
  readonly end: number;
}

export interface WorkHoursCalendar extends WorkCalendar {
  readonly shifts: readonly Shift[];
}

/** «08:30» → 510. */
export function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Busca el instante en que se completan `remaining` minutos hábiles desde `cursor` (hora local). */
function consume(day: string, cursor: number, remaining: number, calendar: WorkHoursCalendar) {
  const midnight = fromCalendarDate(day).getTime();
  let left = remaining;
  for (const shift of calendar.shifts) {
    const start = Math.max(cursor, midnight + shift.start * MINUTE_MS);
    const end = midnight + shift.end * MINUTE_MS;
    if (start >= end) continue;
    const available = (end - start) / MINUTE_MS;
    if (left <= available) return { done: start + left * MINUTE_MS, left: 0 };
    left -= available;
  }
  return { done: null, left };
}

/**
 * Instante en que se cumple un plazo de `hours` horas hábiles contadas desde `from`: una tarea de
 * 4 horas creada el viernes a las 4:00 p. m. vence el lunes a las 11:00 a. m. (o el martes si el
 * lunes es festivo), con jornadas de 8 a 12 y de 1 a 5.
 */
export function addBusinessHours(from: Date, hours: number, calendar: WorkHoursCalendar): Date {
  let left = Math.round(hours * 60);
  if (left <= 0) return from;
  let cursor = from.getTime() - BOGOTA_OFFSET_MS;
  let day = toCalendarDate(new Date(cursor));
  for (let checked = 0; checked < MAX_DAYS; checked += 1) {
    if (isBusinessDay(day, calendar)) {
      const result = consume(day, cursor, left, calendar);
      if (result.done !== null) return new Date(result.done + BOGOTA_OFFSET_MS);
      left = result.left;
    }
    day = addDays(day, 1);
    cursor = fromCalendarDate(day).getTime();
  }
  throw new Error('El horario laboral no tiene horas hábiles.');
}
