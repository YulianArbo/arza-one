import { describe, expect, it } from 'vitest';

import {
  canChangeStatus,
  changePartyStatusRequestSchema,
  createBankAccountRequestSchema,
  createPartyRequestSchema,
  isValidNit,
  nitCheckDigit,
  updatePartyRequestSchema,
} from '../index.js';

// NIT publicados de entidades públicas y empresas grandes, con su dígito de verificación.
const KNOWN_NITS = [
  ['800197268', 4], // DIAN
  ['890903938', 8], // Bancolombia
  ['899999068', 1], // Ecopetrol
  ['860034313', 7], // Davivienda
] as const;

const ORGANIZATION = {
  kind: 'organization',
  legal_name: 'Comercializadora Andina S.A.S.',
  id_type: 'NIT',
  id_number: '800197268',
  check_digit: 4,
} as const;

const PERSON_DATA = {
  kind: 'person',
  first_name: 'Laura',
  last_name: 'Gómez Ríos',
  id_type: 'CC',
  id_number: '1020304050',
} as const;

const CONSENT = {
  notice_id: '019a0000-0000-7000-8000-000000000001',
  accepted: true,
  purposes: ['COMMERCIAL'],
  channel: 'written',
  granted_on: '2026-10-01',
} as const;

const PERSON = { ...PERSON_DATA, consent: CONSENT } as const;

describe('dígito de verificación del NIT', () => {
  it.each(KNOWN_NITS)('el NIT %s tiene dígito %i', (nit, digit) => {
    expect(nitCheckDigit(nit)).toBe(digit);
    expect(isValidNit(nit, digit)).toBe(true);
    expect(isValidNit(nit, (digit + 1) % 10)).toBe(false);
  });

  it('un residuo de 0 o 1 es el dígito mismo', () => {
    // En 10000 el 1 queda en la quinta posición, peso 19: 19 mod 11 = 8 → 11 − 8.
    expect(nitCheckDigit('10000')).toBe(3);
    expect(nitCheckDigit('00000')).toBe(0);
    expect(nitCheckDigit('00003')).toBe(2); // 3×3 = 9 → 11 − 9
    expect(nitCheckDigit('00004')).toBe(1); // 4×3 = 12 → residuo 1
  });

  it('rechaza lo que no es un NIT', () => {
    expect(() => nitCheckDigit('12A45')).toThrow();
    expect(isValidNit('1234', 0)).toBe(false);
  });
});

describe('ficha del tercero', () => {
  it('acepta una organización con NIT válido y una persona con su autorización', () => {
    expect(createPartyRequestSchema.safeParse(ORGANIZATION).success).toBe(true);
    const person = createPartyRequestSchema.parse(PERSON);
    expect(person.status).toBe('active');
    expect(person.roles).toEqual([]);
  });

  it('rechaza el NIT con dígito equivocado, sin dígito o con letras', () => {
    const cases = [
      { ...ORGANIZATION, check_digit: 5 },
      { ...ORGANIZATION, check_digit: null },
      { ...ORGANIZATION, id_number: '80019726A' },
    ];
    for (const body of cases) {
      expect(createPartyRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('solo el NIT lleva dígito de verificación', () => {
    const result = updatePartyRequestSchema.safeParse({ ...PERSON_DATA, check_digit: 3 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['check_digit']);
  });
});

describe('autorización de la persona', () => {
  it('una persona sin autorización, sin la casilla o sin finalidad no se registra', () => {
    const withoutConsent = createPartyRequestSchema.safeParse(PERSON_DATA);
    expect(withoutConsent.error?.issues[0]?.path).toEqual(['consent']);
    const unchecked = { ...PERSON, consent: { ...CONSENT, accepted: false } };
    expect(createPartyRequestSchema.safeParse(unchecked).success).toBe(false);
    const withoutPurpose = { ...PERSON, consent: { ...CONSENT, purposes: [] } };
    expect(createPartyRequestSchema.safeParse(withoutPurpose).success).toBe(false);
  });

  it('una organización no lleva autorización y editar no la pide', () => {
    const organization = createPartyRequestSchema.safeParse({ ...ORGANIZATION, consent: CONSENT });
    expect(organization.error?.issues[0]?.path).toEqual(['consent']);
    expect(updatePartyRequestSchema.safeParse(PERSON_DATA).success).toBe(true);
    expect(updatePartyRequestSchema.safeParse(PERSON).success).toBe(false);
  });
});

describe('documento de la ficha', () => {
  it('el documento se guarda en mayúsculas y sin espacios alrededor', () => {
    const parsed = createPartyRequestSchema.parse({
      ...PERSON,
      id_type: 'PA',
      id_number: ' ab123 ',
    });
    expect(parsed.id_number).toBe('AB123');
  });
});

describe('estados y cuentas', () => {
  it('sigue el flujo prospecto → activo → inactivo → bloqueado', () => {
    expect(canChangeStatus('prospect', 'active')).toBe(true);
    expect(canChangeStatus('active', 'blocked')).toBe(true);
    expect(canChangeStatus('blocked', 'active')).toBe(true);
    expect(canChangeStatus('blocked', 'inactive')).toBe(false);
    expect(canChangeStatus('active', 'prospect')).toBe(false);
  });

  it('bloquear exige motivo', () => {
    expect(changePartyStatusRequestSchema.safeParse({ status: 'blocked' }).success).toBe(false);
    const withReason = { status: 'blocked', reason: 'Lista restrictiva' };
    expect(changePartyStatusRequestSchema.safeParse(withReason).success).toBe(true);
  });

  it('el número de cuenta lleva solo dígitos', () => {
    const base = { bank: 'BANCOLOMBIA', account_type: 'savings' };
    const good = { ...base, account_number: '12345678901' };
    expect(createBankAccountRequestSchema.safeParse(good).success).toBe(true);
    const bad = { ...base, account_number: '123-456-78' };
    expect(createBankAccountRequestSchema.safeParse(bad).success).toBe(false);
  });
});
