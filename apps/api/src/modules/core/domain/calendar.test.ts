import { describe, expect, it } from 'vitest';

import { addBusinessDays, isBusinessDay, type WorkCalendar } from './business-days.js';
import { bogotaToday } from './calendar-date.js';
import { colombianHolidays, easterSunday } from './colombian-holidays.js';

// Festivos y días hábiles (B12). Las fechas esperadas se calcularon a mano sobre el calendario
// oficial de festivos de Colombia, no con el código que se prueba.

const HOLIDAYS_2026 = [
  ['2026-01-01', 'Año Nuevo'],
  ['2026-01-12', 'Día de los Reyes Magos'],
  ['2026-03-23', 'Día de San José'],
  ['2026-04-02', 'Jueves Santo'],
  ['2026-04-03', 'Viernes Santo'],
  ['2026-05-01', 'Día del Trabajo'],
  ['2026-05-18', 'Ascensión del Señor'],
  ['2026-06-08', 'Corpus Christi'],
  ['2026-06-15', 'Sagrado Corazón de Jesús'],
  ['2026-06-29', 'San Pedro y San Pablo'],
  ['2026-07-20', 'Día de la Independencia'],
  ['2026-08-07', 'Batalla de Boyacá'],
  ['2026-08-17', 'Asunción de la Virgen'],
  ['2026-10-12', 'Día de la Raza'],
  ['2026-11-02', 'Todos los Santos'],
  ['2026-11-16', 'Independencia de Cartagena'],
  ['2026-12-08', 'Inmaculada Concepción'],
  ['2026-12-25', 'Navidad'],
];

describe('festivos de Colombia', () => {
  it('calcula el domingo de Pascua', () => {
    expect(['2024', '2025', '2026', '2027', '2030'].map((y) => easterSunday(Number(y)))).toEqual([
      '2024-03-31',
      '2025-04-20',
      '2026-04-05',
      '2027-03-28',
      '2030-04-21',
    ]);
  });

  it('genera los 18 festivos de 2026 con su traslado al lunes', () => {
    const expected = HOLIDAYS_2026.map(([date, name]) => ({ date, name }));
    expect(colombianHolidays(2026)).toEqual(expected);
  });

  it('cuando dos festivos caen el mismo lunes queda uno con los dos nombres (2025)', () => {
    const holidays = colombianHolidays(2025);
    expect(holidays).toHaveLength(17);
    expect(holidays.find((h) => h.date === '2025-06-30')?.name).toBe(
      'San Pedro y San Pablo y Sagrado Corazón de Jesús',
    );
  });
});

const CALENDAR: WorkCalendar = {
  workdays: new Set([1, 2, 3, 4, 5]),
  holidays: new Set([...colombianHolidays(2025), ...colombianHolidays(2026)].map((h) => h.date)),
};

/** Fecha de partida (no cuenta), días hábiles y fecha en que vence: veinte casos con festivos. */
const CASES: readonly [string, number, string, string][] = [
  ['2026-03-27', 1, '2026-03-30', 'viernes a lunes sin festivo'],
  ['2026-03-20', 1, '2026-03-24', 'salta San José'],
  ['2026-03-31', 2, '2026-04-06', 'salta Jueves y Viernes Santo'],
  ['2026-03-30', 5, '2026-04-08', 'cinco días a través de Semana Santa'],
  ['2026-04-30', 1, '2026-05-04', 'salta el Día del Trabajo y el fin de semana'],
  ['2026-05-15', 1, '2026-05-19', 'salta la Ascensión'],
  ['2026-06-05', 5, '2026-06-16', 'salta Corpus Christi y Sagrado Corazón'],
  ['2026-06-26', 1, '2026-06-30', 'salta San Pedro y San Pablo'],
  ['2026-08-06', 1, '2026-08-10', 'salta la Batalla de Boyacá en viernes'],
  ['2026-08-14', 3, '2026-08-20', 'salta la Asunción'],
  ['2026-10-09', 1, '2026-10-13', 'salta el Día de la Raza'],
  ['2026-10-30', 1, '2026-11-03', 'salta Todos los Santos'],
  ['2026-11-13', 2, '2026-11-18', 'salta la Independencia de Cartagena'],
  ['2026-12-07', 1, '2026-12-09', 'salta la Inmaculada Concepción en martes'],
  ['2026-12-24', 1, '2026-12-28', 'salta Navidad y el fin de semana'],
  ['2025-12-24', 2, '2025-12-29', 'Navidad de 2025 en jueves'],
  ['2025-12-31', 1, '2026-01-02', 'cruza el año y salta Año Nuevo'],
  ['2026-01-09', 1, '2026-01-13', 'salta los Reyes Magos'],
  ['2026-03-13', 15, '2026-04-08', 'quince días hábiles del reporte a la SIC'],
  ['2026-11-27', 10, '2026-12-14', 'diez días hábiles de una PQRSF'],
  ['2025-06-27', 1, '2025-07-01', 'salta el lunes con dos festivos de 2025'],
  ['2026-04-04', 1, '2026-04-06', 'desde un sábado cuenta el lunes'],
];

describe('días hábiles', () => {
  it.each(CASES)('desde %s, %i días hábiles vencen el %s (%s)', (from, days, expected) => {
    expect(addBusinessDays(from, days, CALENDAR)).toBe(expected);
  });

  it('un festivo y un sábado no son días hábiles; un martes cualquiera sí', () => {
    expect(isBusinessDay('2026-07-20', CALENDAR)).toBe(false);
    expect(isBusinessDay('2026-07-18', CALENDAR)).toBe(false);
    expect(isBusinessDay('2026-07-21', CALENDAR)).toBe(true);
  });

  it('respeta el horario: si se trabaja el sábado, el sábado cuenta', () => {
    const withSaturday = { ...CALENDAR, workdays: new Set([1, 2, 3, 4, 5, 6]) };
    expect(addBusinessDays('2026-03-27', 1, withSaturday)).toBe('2026-03-28');
  });

  it('un horario sin días es un error, no un ciclo sin fin', () => {
    expect(() => addBusinessDays('2026-01-01', 1, { ...CALENDAR, workdays: new Set() })).toThrow();
  });

  it('la fecha de hoy es la de Colombia, no la del servidor', () => {
    expect(bogotaToday(new Date('2026-10-11T03:00:00Z'))).toBe('2026-10-10');
    expect(bogotaToday(new Date('2026-10-11T05:00:00Z'))).toBe('2026-10-11');
  });
});
