import { describe, expect, it } from 'vitest';

import { bogotaDayStart, isStaleReminder, probabilityFor, reminderHorizon } from './crm-rules.js';

describe('reglas del CRM', () => {
  it('la probabilidad es la pedida o la de la etapa', () => {
    expect(probabilityFor('proposal', null)).toBe(50);
    expect(probabilityFor('proposal', 65)).toBe(65);
    expect(probabilityFor('prospecting', 0)).toBe(0);
  });

  it('se avisan las actividades de los próximos 30 minutos', () => {
    const now = new Date('2026-10-22T14:00:00Z');
    expect(reminderHorizon(now).toISOString()).toBe('2026-10-22T14:30:00.000Z');
  });

  it('una actividad de hace más de un día ya no se recuerda', () => {
    const now = new Date('2026-10-22T14:00:00Z');
    expect(isStaleReminder(new Date('2026-10-21T13:59:00Z'), now)).toBe(true);
    expect(isStaleReminder(new Date('2026-10-21T14:00:00Z'), now)).toBe(false);
  });

  it('el día de Colombia empieza a las 5:00 UTC', () => {
    expect(bogotaDayStart('2026-10-22').toISOString()).toBe('2026-10-22T05:00:00.000Z');
  });
});
