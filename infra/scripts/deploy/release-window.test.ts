import { describe, expect, it } from 'vitest';

import { releaseWindowProblem } from './release-window.ts';

// Noviembre y diciembre de 2026: el martes 24 de noviembre es martes; el 8 de diciembre (martes)
// y el 25 (viernes) son festivos.
const HOLIDAYS = new Set(['2026-11-16', '2026-12-08', '2026-12-25']);

/** Hora de Colombia (UTC−5) a instante UTC. */
function bogota(date: string, hour: number, minute = 0): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

describe('ventana de publicación (numeral 10.6)', () => {
  it('martes a jueves antes de las 4:00 p. m. se puede publicar', () => {
    expect(releaseWindowProblem(bogota('2026-11-24', 10), HOLIDAYS)).toBeUndefined();
    expect(releaseWindowProblem(bogota('2026-11-25', 15, 59), HOLIDAYS)).toBeUndefined();
    expect(releaseWindowProblem(bogota('2026-11-26', 8), HOLIDAYS)).toBeUndefined();
  });

  it('a las 4:00 p. m. ya no, aunque en UTC sea otro día', () => {
    expect(releaseWindowProblem(bogota('2026-11-24', 16), HOLIDAYS)).toMatch(/4:00 p\. m\./);
    expect(releaseWindowProblem(bogota('2026-11-24', 20), HOLIDAYS)).toMatch(/4:00 p\. m\./);
  });

  it('nunca lunes, viernes ni fin de semana', () => {
    expect(releaseWindowProblem(bogota('2026-11-23', 9), HOLIDAYS)).toMatch(/lunes/);
    expect(releaseWindowProblem(bogota('2026-11-27', 9), HOLIDAYS)).toMatch(/viernes/);
    expect(releaseWindowProblem(bogota('2026-11-28', 9), HOLIDAYS)).toMatch(/sábado/);
    expect(releaseWindowProblem(bogota('2026-11-29', 9), HOLIDAYS)).toMatch(/domingo/);
  });

  it('nunca un festivo ni su víspera', () => {
    expect(releaseWindowProblem(bogota('2026-12-08', 9), HOLIDAYS)).toMatch(/es festivo/);
    expect(releaseWindowProblem(bogota('2026-12-24', 9), HOLIDAYS)).toMatch(/víspera/);
  });
});
