import { describe, expect, it } from 'vitest';

import {
  clockState,
  nextLevel,
  remainingMinutes,
  termsOf,
  type ClockFacts,
} from './ticket-clock.js';

// Reglas del reloj del tiquete (B28): cuánto queda tras una pausa, la alerta al 80 % y cómo va.

const NOW = new Date('2026-11-06T15:00:00Z');
const EARLIER = new Date('2026-11-06T14:00:00Z');
const LATER = new Date('2026-11-06T16:00:00Z');

function facts(overrides: Partial<ClockFacts> = {}): ClockFacts {
  return {
    status: 'in_progress',
    warnAt: LATER,
    resolutionDueAt: LATER,
    warnedAt: null,
    breachedAt: null,
    ...overrides,
  };
}

describe('plazos que quedan', () => {
  it('sin consumo: la alerta es el 80 % del plazo de solución', () => {
    expect(remainingMinutes(termsOf(4, 16), 0)).toEqual({
      response: 240,
      resolution: 960,
      warn: 768,
    });
  });

  it('tras una pausa descuenta lo consumido y nunca queda negativo', () => {
    expect(remainingMinutes(termsOf(1, 4), 200)).toEqual({ response: 0, resolution: 40, warn: 0 });
  });

  it('acepta plazos con fracción de hora', () => {
    expect(termsOf(0.25, 1.5)).toEqual({ responseMinutes: 15, resolutionMinutes: 90 });
  });
});

describe('cómo va el reloj', () => {
  it('a tiempo, por vencer y vencido', () => {
    expect(clockState(facts(), NOW)).toBe('on_time');
    expect(clockState(facts({ warnAt: EARLIER }), NOW)).toBe('at_risk');
    expect(clockState(facts({ warnedAt: EARLIER }), NOW)).toBe('at_risk');
    expect(clockState(facts({ resolutionDueAt: EARLIER }), NOW)).toBe('overdue');
    expect(clockState(facts({ breachedAt: EARLIER }), NOW)).toBe('overdue');
  });

  it('pausado en espera del cliente y detenido al resolver o cerrar', () => {
    expect(clockState(facts({ status: 'waiting_customer', breachedAt: EARLIER }), NOW)).toBe(
      'paused',
    );
    expect(clockState(facts({ status: 'resolved' }), NOW)).toBe('stopped');
    expect(clockState(facts({ status: 'closed' }), NOW)).toBe('stopped');
  });

  it('sin vencimientos calculados está a tiempo', () => {
    expect(clockState(facts({ warnAt: null, resolutionDueAt: null }), NOW)).toBe('on_time');
  });
});

describe('niveles', () => {
  it('sube de uno en uno hasta el tercero', () => {
    expect(nextLevel(1, 3)).toBe(2);
    expect(nextLevel(2, 3)).toBe(3);
    expect(nextLevel(3, 3)).toBeNull();
  });
});
