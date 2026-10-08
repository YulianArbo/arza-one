import { describe, expect, it } from 'vitest';

import { describeOutcome } from './deploy.ts';

const NEW = 'b07aaaa';
const OLD = 'b06bbbb';

describe('resumen del despliegue', () => {
  it('explica cada resultado en español', () => {
    expect(describeOutcome({ result: 'deployed', version: NEW })).toBe(
      `Versión ${NEW} publicada en pruebas.\n`,
    );
    expect(
      describeOutcome({ result: 'rolled_back', version: NEW, previous: OLD, reason: 'humo' }),
    ).toBe(`La versión ${NEW} NO pasó las pruebas y se volvió sola a ${OLD}.\nMotivo: humo\n`);
    expect(describeOutcome({ result: 'rolled_back', version: NEW })).toContain('a ?.');
    expect(describeOutcome({ result: 'failed', version: NEW, reason: 'pull' })).toBe(
      `El despliegue de ${NEW} falló.\nMotivo: pull\n`,
    );
    expect(describeOutcome({ result: 'failed', version: NEW })).toContain('Motivo: \n');
  });
});
