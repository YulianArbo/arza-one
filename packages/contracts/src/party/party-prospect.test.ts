import { describe, expect, it } from 'vitest';

import { createPartyRequestSchema, hasDocument, updatePartyRequestSchema } from '../index.js';

// Prospecto sin documento (B22): a quien apenas pregunta no se le pide la cédula; el documento se
// exige para dejar de ser prospecto.

const CONSENT = {
  notice_id: '019a0000-0000-7000-8000-000000000001',
  accepted: true,
  purposes: ['COMMERCIAL'],
  channel: 'written',
  granted_on: '2026-10-01',
} as const;

const PROSPECT = {
  kind: 'person',
  first_name: 'Laura',
  last_name: 'Gómez Ríos',
  email: 'laura@example.com',
  status: 'prospect',
  consent: CONSENT,
} as const;

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('prospecto sin documento', () => {
  it('un prospecto se registra sin tipo ni número de documento', () => {
    const parsed = createPartyRequestSchema.parse(PROSPECT);
    expect(parsed).toMatchObject({ id_type: null, id_number: null, check_digit: null });
    expect(hasDocument(parsed)).toBe(false);
  });

  it('un tercero activo sí exige el documento', () => {
    const result = createPartyRequestSchema.safeParse({ ...PROSPECT, status: 'active' });
    expect(issuePaths(result)).toEqual(['id_number']);
  });

  it('el tipo y el número van juntos', () => {
    const onlyType = createPartyRequestSchema.safeParse({ ...PROSPECT, id_type: 'CC' });
    expect(issuePaths(onlyType)).toEqual(['id_number']);
    const onlyNumber = createPartyRequestSchema.safeParse({ ...PROSPECT, id_number: '1020304050' });
    expect(issuePaths(onlyNumber)).toEqual(['id_type']);
  });

  it('sin documento no hay dígito de verificación', () => {
    const result = updatePartyRequestSchema.safeParse({
      kind: 'person',
      first_name: 'Laura',
      last_name: 'Gómez Ríos',
      check_digit: 3,
    });
    expect(issuePaths(result)).toEqual(['check_digit']);
  });

  it('con el documento completo el prospecto queda listo para ser activo', () => {
    const parsed = createPartyRequestSchema.parse({
      ...PROSPECT,
      id_type: 'CC',
      id_number: '1020304050',
    });
    expect(hasDocument(parsed)).toBe(true);
  });
});
