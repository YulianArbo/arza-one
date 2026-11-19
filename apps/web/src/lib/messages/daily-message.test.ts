import { describe, expect, it } from 'vitest';

import { MESSAGE_COUNT, messageAt, personalMessage } from './daily-message';

const ALL = Array.from({ length: MESSAGE_COUNT }, (_, index) => messageAt(index));

describe('banco de mensajes del día (B22B)', () => {
  it('forma 1.600 mensajes distintos', () => {
    expect(MESSAGE_COUNT).toBe(1600);
    expect(new Set(ALL).size).toBe(1600);
  });

  it('cada mensaje son dos frases completas', () => {
    for (const message of ALL) {
      expect(message).toMatch(/^[A-ZÁÉÍÓÚÑ¿].*[.?!] [A-ZÁÉÍÓÚÑ¿].*[.?!]$/u);
    }
  });

  it('habla de usted: nunca tutea', () => {
    for (const message of ALL) {
      expect(message).not.toMatch(/\b(tú|tu|tus|te|contigo)\b/iu);
    }
  });

  it('se ajusta al rango con cualquier número', () => {
    expect(messageAt(MESSAGE_COUNT)).toBe(messageAt(0));
    expect(messageAt(-1)).toBe(messageAt(MESSAGE_COUNT - 1));
    expect(messageAt(2.9)).toBe(messageAt(2));
  });
});

describe('mensaje personal del día (B22B)', () => {
  it('es el mismo todo el día para la misma persona', () => {
    expect(personalMessage('usuario-1', '2026-11-19')).toBe(
      personalMessage('usuario-1', '2026-11-19'),
    );
  });

  it('cambia de un día a otro y de una persona a otra', () => {
    const days = Array.from({ length: 30 }, (_, index) =>
      personalMessage('usuario-1', `2026-11-${String(index + 1).padStart(2, '0')}`),
    );
    expect(new Set(days).size).toBeGreaterThan(25);
    const people = Array.from({ length: 30 }, (_, index) =>
      personalMessage(`usuario-${String(index)}`, '2026-11-19'),
    );
    expect(new Set(people).size).toBeGreaterThan(25);
  });
});
