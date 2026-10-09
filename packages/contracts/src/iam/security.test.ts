import { describe, expect, it } from 'vitest';

import {
  reauthenticateRequestSchema,
  secondFactorRequestSchema,
  totpCodeSchema,
} from './security.js';

describe('contratos del segundo factor', () => {
  it('acepta seis dígitos, también con espacios', () => {
    expect(totpCodeSchema.parse('123456')).toBe('123456');
    expect(totpCodeSchema.parse(' 123 456 ')).toBe('123456');
  });

  it('rechaza lo que no son seis dígitos', () => {
    expect(totpCodeSchema.safeParse('12345').success).toBe(false);
    expect(totpCodeSchema.safeParse('1234567').success).toBe(false);
    expect(totpCodeSchema.safeParse('12a456').success).toBe(false);
  });

  it('el segundo paso lleva el código o un código de recuperación, no los dos', () => {
    expect(secondFactorRequestSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(
      secondFactorRequestSchema.safeParse({ recovery_code: 'ABCD-EFGH-JKMN-PQRS' }).success,
    ).toBe(true);
    expect(
      secondFactorRequestSchema.safeParse({ code: '123456', recovery_code: 'ABCD-EFGH-JKMN-PQRS' })
        .success,
    ).toBe(false);
    expect(secondFactorRequestSchema.safeParse({}).success).toBe(false);
  });

  it('confirmar la identidad exige la contraseña', () => {
    expect(reauthenticateRequestSchema.safeParse({ code: '123456' }).success).toBe(false);
    expect(
      reauthenticateRequestSchema.safeParse({ password: 'una frase', code: '123456' }).success,
    ).toBe(true);
  });
});
