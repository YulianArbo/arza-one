import { describe, expect, it } from 'vitest';

import { changesBetween } from './audit-recorder.js';

describe('valor anterior y nuevo (ficha 17.20)', () => {
  it('guarda solo los campos que cambiaron, con su valor anterior y nuevo', () => {
    const changes = changesBetween(
      { name: 'Apoyo', description: null, active: true },
      { name: 'Apoyo comercial', description: null, active: false },
    );
    expect(changes).toEqual({
      name: { from: 'Apoyo', to: 'Apoyo comercial' },
      active: { from: true, to: false },
    });
  });

  it('de un campo restringido solo registra que cambió', () => {
    const changes = changesBetween(
      { bankAccount: '123', city: 'Bogotá' },
      { bankAccount: '456', city: 'Bogotá' },
      ['bankAccount'],
    );
    expect(changes).toEqual({ bankAccount: { changed: true } });
    expect(JSON.stringify(changes)).not.toContain('456');
  });
});
