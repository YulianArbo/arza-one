import { describe, expect, it } from 'vitest';

import { redactPersonalData } from './redaction.js';

describe('minimización de datos personales (B47)', () => {
  it('borra correos, teléfonos y números de documento', () => {
    const result = redactPersonalData(
      'Escriba a ana.perez@cliente.com.co o llame al +57 300 123 4567; cédula 1.020.304.050.',
    );
    expect(result.text).toBe('Escriba a [correo] o llame al [número]; cédula [número].');
    expect(result.count).toBe(3);
  });

  it('borra números de cuenta y de tarjeta', () => {
    const result = redactPersonalData('Cuenta 123-456789-01 y tarjeta 4111 1111 1111 1111.');
    expect(result.text).toBe('Cuenta [número] y tarjeta [número].');
    expect(result.count).toBe(2);
  });

  it('conserva fechas, valores en pesos, códigos y números cortos', () => {
    const text = 'El 2026-11-26 se aprobó PR-SGC-002 por $ 1.500.000 para 12 personas (ext. 204).';
    expect(redactPersonalData(text)).toEqual({ text, count: 0 });
  });

  it('un texto sin datos queda igual', () => {
    expect(redactPersonalData('Procedimiento de control de documentos')).toEqual({
      text: 'Procedimiento de control de documentos',
      count: 0,
    });
  });
});
