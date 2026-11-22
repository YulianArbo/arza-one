// Fechas de calendario (sin hora) como texto AAAA-MM-DD, el formato del contrato. Se calculan en
// UTC para que el resultado no dependa de la zona horaria del servidor (ADR-020).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Colombia está en UTC-5 todo el año: no tiene horario de verano. */
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function toCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** La fecha de hoy en Colombia. */
export function bogotaToday(now: Date): string {
  return toCalendarDate(new Date(now.getTime() - BOGOTA_OFFSET_MS));
}

/** El instante en que empieza ese día en Colombia (medianoche de Bogotá). */
export function bogotaStartOf(date: string): Date {
  return new Date(fromCalendarDate(date).getTime() + BOGOTA_OFFSET_MS);
}

export function bogotaYear(now: Date): number {
  return Number(bogotaToday(now).slice(0, 4));
}

/** La fecha como medianoche UTC, que es como Prisma lee y escribe las columnas date. */
export function fromCalendarDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  return toCalendarDate(new Date(fromCalendarDate(date).getTime() + days * DAY_MS));
}

/** Día de la semana ISO: 1 lunes … 7 domingo. */
export function isoWeekday(date: string): number {
  const day = fromCalendarDate(date).getUTCDay();
  return day === 0 ? 7 : day;
}
