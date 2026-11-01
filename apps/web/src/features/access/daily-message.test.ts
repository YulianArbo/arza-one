import { describe, expect, it } from 'vitest';

import { dailyMessage } from './daily-message';

describe('mensaje del día del acceso (B22A)', () => {
  it('elige el mensaje por el día de la semana en Colombia', () => {
    // Sábado 24/10/2026 a mediodía en Bogotá.
    expect(dailyMessage(new Date('2026-10-24T17:00:00Z'))).toEqual({
      day: 'sábado',
      text: 'Su trabajo diario, en un solo lugar.',
    });
    expect(dailyMessage(new Date('2026-10-26T15:00:00Z')).day).toBe('lunes');
  });

  it('a las 11 p. m. del domingo en Bogotá sigue siendo domingo aunque en UTC ya sea lunes', () => {
    const message = dailyMessage(new Date('2026-10-26T04:00:00Z'));
    expect(message.day).toBe('domingo');
    expect(message.text).toBe('Descanse: el lunes seguimos construyendo juntos.');
  });
});
