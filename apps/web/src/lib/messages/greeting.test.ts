import { describe, expect, it } from 'vitest';

import { firstName, greetingFor, greetingLine } from './greeting';

// Colombia está en UTC−5 todo el año.

describe('saludo según la hora de Colombia (B22B)', () => {
  it('cambia a las 5 a. m., a las 12 m. y a las 7 p. m.', () => {
    expect(greetingFor(new Date('2026-11-19T09:59:00Z'))).toBe('Buenas noches');
    expect(greetingFor(new Date('2026-11-19T10:00:00Z'))).toBe('Buenos días');
    expect(greetingFor(new Date('2026-11-19T16:59:00Z'))).toBe('Buenos días');
    expect(greetingFor(new Date('2026-11-19T17:00:00Z'))).toBe('Buenas tardes');
    expect(greetingFor(new Date('2026-11-19T23:59:00Z'))).toBe('Buenas tardes');
    expect(greetingFor(new Date('2026-11-20T00:00:00Z'))).toBe('Buenas noches');
  });

  it('usa el primer nombre y, sin nombre, saluda igual', () => {
    expect(firstName('  Ana María Pérez ')).toBe('Ana');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });

  it('arma la línea con el día y la fecha dd/mm/aaaa de Colombia', () => {
    const morning = new Date('2026-11-19T13:00:00Z');
    expect(greetingLine(morning, 'Ana Pérez')).toBe('Buenos días, Ana · jueves 19/11/2026');
    expect(greetingLine(new Date('2026-11-20T02:00:00Z'), null)).toBe(
      'Buenas noches · jueves 19/11/2026',
    );
  });
});
