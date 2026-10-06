import { describe, expect, it } from 'vitest';

import { PLATFORM_DEFAULTS } from './platform-defaults.js';

describe('PLATFORM_DEFAULTS', () => {
  it('usa la zona horaria, el idioma y la moneda de Colombia', () => {
    expect(PLATFORM_DEFAULTS).toEqual({
      timezone: 'America/Bogota',
      locale: 'es-CO',
      currency: 'COP',
    });
  });

  it('formatea pesos colombianos con la configuración regional', () => {
    const formatter = new Intl.NumberFormat(PLATFORM_DEFAULTS.locale, {
      style: 'currency',
      currency: PLATFORM_DEFAULTS.currency,
    });
    // El separador entre el signo y la cifra es un espacio duro (U+00A0).
    expect(formatter.format(1500000)).toBe('$ 1.500.000');
  });
});
