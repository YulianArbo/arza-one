import { afterEach, describe, expect, it, vi } from 'vitest';

import { readRecentSlugs, rememberModule } from './recent-modules';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('módulos recientes (B22B)', () => {
  it('pone al principio el último módulo abierto, sin repetir y con un máximo de cuatro', () => {
    for (const path of [
      '/app/compras',
      '/app/finanzas/facturas',
      '/app/compras/solicitudes/3',
      '/app/terceros',
      '/app/comercial',
      '/app/auditoria',
    ]) {
      rememberModule('u1', path);
    }
    expect(readRecentSlugs('u1')).toEqual(['auditoria', 'comercial', 'terceros', 'compras']);
  });

  it('no cuenta Inicio ni direcciones desconocidas, y separa a cada persona', () => {
    rememberModule('u1', '/app');
    rememberModule('u1', '/app/no-existe');
    rememberModule('u2', '/app/terceros');
    expect(readRecentSlugs('u1')).toEqual([]);
    expect(readRecentSlugs('u2')).toEqual(['terceros']);
  });

  it('ignora lo que no entiende y sigue sin almacenamiento', () => {
    window.localStorage.setItem('arza.recent-modules.u1', '{"no":"lista"}');
    expect(readRecentSlugs('u1')).toEqual([]);
    window.localStorage.setItem('arza.recent-modules.u1', 'roto');
    expect(readRecentSlugs('u1')).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('sin espacio');
    });
    expect(() => {
      rememberModule('u1', '/app/terceros');
    }).not.toThrow();
  });
});
