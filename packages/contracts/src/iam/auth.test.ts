import { describe, expect, it } from 'vitest';

import {
  acceptInvitationRequestSchema,
  emailSchema,
  loginRequestSchema,
  passwordShapeProblem,
} from './auth.js';

describe('contratos de identidad', () => {
  it('normaliza el correo: sin espacios y en minúsculas', () => {
    expect(emailSchema.parse('  Ana.Perez@Demo-Uno.TEST ')).toBe('ana.perez@demo-uno.test');
  });

  it('rechaza un correo sin formato válido', () => {
    expect(loginRequestSchema.safeParse({ email: 'sin-arroba', password: 'x' }).success).toBe(
      false,
    );
  });

  it('mide la contraseña en caracteres visibles: de 12 a 128', () => {
    expect(passwordShapeProblem('once caract')).toBe('too_short');
    expect(passwordShapeProblem('doce caracte')).toBeNull();
    expect(passwordShapeProblem('ñandú👍🏽ñandú')).toBe('too_short');
    expect(passwordShapeProblem('x'.repeat(129))).toBe('too_long');
  });

  it('exige que la llave del enlace tenga la forma de las que envía la plataforma', () => {
    const valid = { token: 'a'.repeat(43), display_name: 'Ana Pérez', password: 'una frase' };
    expect(acceptInvitationRequestSchema.safeParse(valid).success).toBe(true);
    const tampered = { ...valid, token: `${'a'.repeat(42)}'` };
    expect(acceptInvitationRequestSchema.safeParse(tampered).success).toBe(false);
  });
});
