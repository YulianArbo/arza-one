import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime } from './date-time';

describe('fechas para la persona (16.6)', () => {
  it('muestra dd/mm/aaaa y la hora de Colombia con a. m. y p. m.', () => {
    // 20:15 UTC son las 3:15 p. m. en Bogotá (UTC−5).
    expect(formatDateTime('2026-10-09T20:15:00Z')).toMatch(/^09\/10\/2026,? 3:15\s?p\.\s?m\.$/);
  });

  it('muestra un guion cuando no hay fecha', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('fechas de calendario (B12)', () => {
  it('muestra AAAA-MM-DD como dd/mm/aaaa, sin correrse un día por la zona horaria', () => {
    expect(formatDate('2026-04-02')).toBe('02/04/2026');
    expect(formatDate(null)).toBe('—');
  });
});
