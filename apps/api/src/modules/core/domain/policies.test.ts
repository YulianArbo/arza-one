import { describe, expect, it } from 'vitest';

import { createsCycle } from './hierarchy.js';
import { currentAndScheduled, previousValidTo, validFromProblem } from './parameter-policy.js';

describe('jerarquías sin ciclos', () => {
  // Director ← Gerente ← Líder ← Desarrollador
  const parents = new Map<string, string | null>([
    ['director', null],
    ['gerente', 'director'],
    ['lider', 'gerente'],
    ['desarrollador', 'lider'],
  ]);

  it('nadie puede reportar a sí mismo ni a alguien que le reporta', () => {
    expect(createsCycle('gerente', 'gerente', parents)).toBe(true);
    expect(createsCycle('gerente', 'desarrollador', parents)).toBe(true);
  });

  it('cambiar de jefe dentro de otra rama o quedar en la cabeza sí se puede', () => {
    expect(createsCycle('desarrollador', 'gerente', parents)).toBe(false);
    expect(createsCycle('gerente', null, parents)).toBe(false);
  });
});

describe('vigencias de un parámetro', () => {
  it('una vigencia nueva no empieza en el pasado ni antes de la última', () => {
    expect(validFromProblem('2026-10-09', '2026-10-10', null)).toBe('in_past');
    expect(validFromProblem('2026-10-10', '2026-10-10', '2026-10-10')).toBe('not_after_latest');
    expect(validFromProblem('2026-11-01', '2026-10-10', '2026-01-01')).toBeNull();
  });

  it('la anterior termina el día antes', () => {
    expect(previousValidTo('2026-03-01')).toBe('2026-02-28');
  });

  it('distingue la vigencia de hoy de la programada', () => {
    const versions = [
      { validFrom: '2026-11-01', validTo: null },
      { validFrom: '2026-01-01', validTo: '2026-10-31' },
    ];
    expect(currentAndScheduled(versions, '2026-10-10')).toEqual({
      current: versions[1],
      scheduled: versions[0],
    });
    expect(currentAndScheduled(versions, '2026-11-01')).toEqual({
      current: versions[0],
      scheduled: null,
    });
  });
});
