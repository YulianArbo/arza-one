import { describe, expect, it } from 'vitest';

import { bogotaDateTime } from './bogota-time.js';
import { deferredToWorkday, excerpt, retryAt } from './delivery-rules.js';

const NOW = new Date('2026-10-17T15:00:00Z');

describe('reglas de entrega de los avisos', () => {
  it('difiere los avisos no urgentes a colaboradores', () => {
    expect(deferredToWorkday({ urgent: false, collaborator: true })).toBe(true);
  });

  it('no difiere los urgentes ni los de personas del portal', () => {
    expect(deferredToWorkday({ urgent: true, collaborator: true })).toBe(false);
    expect(deferredToWorkday({ urgent: false, collaborator: false })).toBe(false);
  });

  it('espera cada vez más entre reintentos, hasta una hora', () => {
    const minutes = [1, 2, 3, 4, 5, 9].map(
      (attempt) => (retryAt(attempt, NOW).getTime() - NOW.getTime()) / 60_000,
    );
    expect(minutes).toEqual([1, 5, 15, 60, 60, 60]);
  });

  it('resume un comentario largo en una línea de 200 caracteres', () => {
    expect(excerpt('  Hola\n\nmundo  ')).toBe('Hola mundo');
    const long = excerpt('a'.repeat(300));
    expect(long).toHaveLength(200);
    expect(long.endsWith('…')).toBe(true);
  });

  it('muestra las fechas en hora de Colombia', () => {
    expect(bogotaDateTime(NOW)).toMatch(/^17\/10\/2026, 10:00\s?a\.\s?m\.$/);
  });
});
