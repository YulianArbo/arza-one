import { setTimeout as delay } from 'node:timers/promises';

import { sequenceListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { nextBusinessCode } from '../../../src/modules/core/index.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { CoreScenario, unique } from './support/core-scenario.js';

// Consecutivos (B12, criterio de la ficha 17.1): dos personas que piden un consecutivo al mismo
// tiempo reciben números distintos y contiguos; una operación que falla no deja saltos.

const scenario = new CoreScenario('consecutivos');
const NOW = new Date('2026-10-10T15:00:00Z');

async function newSequence(prefix = 'COT'): Promise<string> {
  const admin = await scenario.admin();
  const key = `test.${unique('seq')}`;
  await scenario.create('/v1/sequences', admin, { key, name: 'Cotizaciones', prefix });
  return key;
}

function take(key: string, at = NOW): Promise<string> {
  return scenario.inTenant((tx) => nextBusinessCode(tx, key, at));
}

describe('servicio de consecutivos', () => {
  it('quien llega mientras otro tiene el número espera y recibe el siguiente', async () => {
    const key = await newSequence();
    const slow = scenario.inTenant(async (tx) => {
      const code = await nextBusinessCode(tx, key, NOW);
      await delay(400);
      return code;
    });
    await delay(100);
    const fast = take(key);
    expect([await slow, await fast]).toEqual(['COT-2026-0001', 'COT-2026-0002']);
  });

  it('diez peticiones simultáneas reciben diez números distintos y contiguos', async () => {
    const key = await newSequence();
    const codes = await Promise.all(Array.from({ length: 10 }, () => take(key)));
    const expected = Array.from(
      { length: 10 },
      (_, i) => `COT-2026-${String(i + 1).padStart(4, '0')}`,
    );
    expect([...codes].sort()).toEqual(expected);
  });

  it('si la operación se revierte, el número no se gasta', async () => {
    const key = await newSequence();
    await expect(
      scenario.inTenant(async (tx) => {
        await nextBusinessCode(tx, key, NOW);
        throw new Error('falla después de tomar el número');
      }),
    ).rejects.toThrow('falla');
    expect(await take(key)).toBe('COT-2026-0001');
  });

  it('el año nuevo empieza en 1 con el mismo prefijo; un tipo sin configurar es un error', async () => {
    const key = await newSequence('PQR');
    expect(await take(key)).toBe('PQR-2026-0001');
    expect(await take(key, new Date('2027-01-01T05:00:00Z'))).toBe('PQR-2027-0001');
    expect(await take(key, new Date('2027-01-01T04:59:00Z'))).toBe('PQR-2026-0002');
    await expect(take('no.configurado')).rejects.toThrow(/no está configurado/);
  });
});

describe('administración de consecutivos', () => {
  it('muestra el siguiente código, cambia el prefijo y nunca acepta claves repetidas', async () => {
    const admin = await scenario.admin(scenario.otherTenant.id);
    const key = `crm.${unique('quote')}`;
    const id = await scenario.create('/v1/sequences', admin, {
      key,
      name: 'Ofertas',
      prefix: 'OFE',
    });
    expect(
      errorCode(
        await scenario.post('/v1/sequences', admin.session, { key, name: 'Otra', prefix: 'OTR' }),
      ),
    ).toBe('CORE_CODE_TAKEN');
    const update = { name: 'Ofertas comerciales', prefix: 'COM', padding: 5 };
    const edited = await scenario.patch(`/v1/sequences/${id}`, admin.session, update, 1);
    expect(edited.status, edited.text).toBe(200);
    const list = sequenceListResponseSchema.parse(
      (await scenario.get('/v1/sequences', admin.session)).body,
    );
    expect(list.data.find((s) => s.key === key)?.next_code).toMatch(/^COM-\d{4}-00001$/);
  });
});
