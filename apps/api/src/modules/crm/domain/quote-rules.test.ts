import { describe, expect, it } from 'vitest';

import { isPastValidity, linkExpiresAt, publicStateOf } from './quote-rules.js';

describe('vigencia del enlace', () => {
  it('sirve hasta las 11:59 p. m. de Colombia del último día', () => {
    expect(linkExpiresAt('2026-10-31').toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(linkExpiresAt('2026-12-31').toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('vence al día siguiente del último, no el mismo día', () => {
    expect(isPastValidity('2026-10-31', '2026-10-31')).toBe(false);
    expect(isPastValidity('2026-10-31', '2026-11-01')).toBe(true);
  });
});

describe('lo que ve el cliente', () => {
  it('una enviada vigente se puede responder; vencida por fecha ya no', () => {
    expect(publicStateOf('sent', '2026-10-31', '2026-10-31')).toBe('open');
    expect(publicStateOf('sent', '2026-10-31', '2026-11-01')).toBe('expired');
  });

  it('respeta las respuestas, el vencimiento y las versiones nuevas', () => {
    expect(publicStateOf('accepted', '2026-10-31', '2026-12-01')).toBe('accepted');
    expect(publicStateOf('rejected', '2026-10-31', '2026-10-01')).toBe('rejected');
    expect(publicStateOf('expired', '2026-10-31', '2026-10-01')).toBe('expired');
    expect(publicStateOf('superseded', '2026-10-31', '2026-10-01')).toBe('replaced');
  });
});
