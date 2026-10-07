import { describe, expect, it } from 'vitest';

import { errorResponseSchema, healthResponseSchema, versionResponseSchema } from './index.js';

describe('contratos de la plataforma', () => {
  it('acepta un error con el formato del numeral 14.2', () => {
    const body = {
      error: {
        code: 'QUOTE_EXPIRED',
        message: 'La cotización venció el 15/10/2026 y no puede aceptarse.',
        details: [{ field: 'valid_until', issue: 'past_date' }],
        correlation_id: '0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10',
      },
    };
    expect(errorResponseSchema.parse(body)).toEqual(body);
  });

  it('rechaza un error sin identificador de correlación', () => {
    const body = { error: { code: 'X', message: 'y', details: [] } };
    expect(errorResponseSchema.safeParse(body).success).toBe(false);
  });

  it('solo admite up o down en cada pieza del estado', () => {
    const body = { status: 'ok', checks: { database: 'up', queues: 'up', files: 'maybe' } };
    expect(healthResponseSchema.safeParse(body).success).toBe(false);
  });

  it('solo admite los ambientes del anexo F', () => {
    const body = { version: '0.1.0', environment: 'dev', commit: 'unknown' };
    expect(versionResponseSchema.safeParse(body).success).toBe(false);
  });
});
