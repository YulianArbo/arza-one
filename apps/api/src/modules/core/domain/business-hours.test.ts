import { describe, expect, it } from 'vitest';

import { addBusinessHours, minutesOfDay, type WorkHoursCalendar } from './business-hours.js';
import { colombianHolidays } from './colombian-holidays.js';

// Plazos en horas hábiles (B15). Las horas esperadas se calcularon a mano en la hora de Colombia
// con jornadas de 8:00 a 12:00 y de 13:00 a 17:00, de lunes a viernes.

const CALENDAR: WorkHoursCalendar = {
  workdays: new Set([1, 2, 3, 4, 5]),
  holidays: new Set(colombianHolidays(2026).map((holiday) => holiday.date)),
  shifts: [
    { start: minutesOfDay('08:00'), end: minutesOfDay('12:00') },
    { start: minutesOfDay('13:00'), end: minutesOfDay('17:00') },
  ],
};

/** Hora de Colombia → instante UTC. */
function bogota(local: string): Date {
  return new Date(`${local}-05:00`);
}

describe('horas hábiles (ficha 17.5)', () => {
  it('dentro de la misma jornada', () => {
    expect(addBusinessHours(bogota('2026-10-14T08:00:00'), 2, CALENDAR)).toEqual(
      bogota('2026-10-14T10:00:00'),
    );
  });

  it('salta el almuerzo', () => {
    expect(addBusinessHours(bogota('2026-10-14T11:00:00'), 2, CALENDAR)).toEqual(
      bogota('2026-10-14T14:00:00'),
    );
  });

  it('del viernes en la tarde pasa al lunes', () => {
    expect(addBusinessHours(bogota('2026-10-16T16:00:00'), 4, CALENDAR)).toEqual(
      bogota('2026-10-19T11:00:00'),
    );
  });

  it('salta el festivo: el lunes 12 de octubre de 2026 es el Día de la Raza', () => {
    expect(addBusinessHours(bogota('2026-10-09T16:00:00'), 4, CALENDAR)).toEqual(
      bogota('2026-10-13T11:00:00'),
    );
  });
});

describe('horas hábiles fuera de la jornada', () => {
  it('creado un sábado empieza a contar el lunes a las 8:00', () => {
    expect(addBusinessHours(bogota('2026-10-17T10:00:00'), 1, CALENDAR)).toEqual(
      bogota('2026-10-19T09:00:00'),
    );
  });

  it('creado antes de la jornada o de noche cuenta desde la siguiente jornada', () => {
    expect(addBusinessHours(bogota('2026-10-14T06:00:00'), 1, CALENDAR)).toEqual(
      bogota('2026-10-14T09:00:00'),
    );
    expect(addBusinessHours(bogota('2026-10-14T20:00:00'), 8, CALENDAR)).toEqual(
      bogota('2026-10-15T17:00:00'),
    );
  });

  it('16 horas hábiles son dos días de trabajo', () => {
    expect(addBusinessHours(bogota('2026-10-14T08:00:00'), 16, CALENDAR)).toEqual(
      bogota('2026-10-15T17:00:00'),
    );
  });

  it('un plazo de cero horas vence en el acto', () => {
    const now = bogota('2026-10-14T08:00:00');
    expect(addBusinessHours(now, 0, CALENDAR)).toEqual(now);
  });

  it('un horario sin días hábiles no tiene plazo posible', () => {
    const empty = { ...CALENDAR, workdays: new Set<number>() };
    expect(() => addBusinessHours(bogota('2026-10-14T08:00:00'), 1, empty)).toThrow(
      'El horario laboral no tiene horas hábiles.',
    );
  });
});
