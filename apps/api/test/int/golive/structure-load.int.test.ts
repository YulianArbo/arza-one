import { v7 as uuidv7 } from 'uuid';
import { expect, it, vi } from 'vitest';

import { runInitialLoad } from '../../../src/modules/golive/application/initial-load.js';
import type { LoadFiles } from '../../../src/modules/golive/application/load-context.js';
import { InvitationUseCase } from '../../../src/modules/iam/index.js';
import { toCsv } from '../../../src/platform/export/csv.js';
import { AccessScenario } from '../iam/support/access-scenario.js';

const scenario = new AccessScenario('dependencias de la carga inicial');

function structureWithWriteFailures(suffix: string): LoadFiles {
  const parent = `FAL-${suffix}`;
  const valid = `VAL-${suffix}`;
  return {
    areas: toCsv(
      ['Código', 'Nombre', 'Tipo', 'Depende de', 'Cargo líder'],
      [
        [parent, 'Proceso con error', 'Proceso', null, null],
        [`DEP-${suffix}`, 'Área dependiente', 'Área', parent, null],
        [valid, 'Proceso válido', 'Proceso', null, `Líder ${suffix}`],
      ],
    ),
    positions: toCsv(
      ['Cargo', 'Proceso o área', 'Reporta a'],
      [
        [`Cargo huérfano ${suffix}`, parent, null],
        [`Líder ${suffix}`, valid, null],
        [`Analista ${suffix}`, valid, `Líder ${suffix}`],
      ],
    ),
  };
}

it('informa las dependencias que quedan sin crear tras fallar un proceso y un cargo', async () => {
  const suffix = uuidv7().slice(-6).toUpperCase();
  const person = await scenario.person('errores-estructura', ['ADMIN_PLATAFORMA']);
  const now = vi
    .fn(() => scenario.clock.now())
    .mockImplementationOnce(() => scenario.clock.now()) // Permisos.
    .mockImplementationOnce(() => {
      throw new Error('Alta de proceso no disponible');
    })
    .mockImplementationOnce(() => scenario.clock.now()) // Alta del proceso válido.
    .mockImplementationOnce(() => {
      throw new Error('Alta de cargo no disponible');
    });

  const report = await runInitialLoad(
    { database: scenario.db, clock: { now }, invitations: scenario.app.get(InvitationUseCase) },
    {
      tenantId: scenario.tenant.id,
      userId: person.id,
      apply: true,
      files: structureWithWriteFailures(suffix),
    },
  );

  expect(report.applied).toBe(true);
  expect(report.sheets[0]).toEqual({
    sheet: 'estructura',
    planned: 6,
    created: 1,
    existing: 0,
    problems: [
      { row: 2, key: `FAL-${suffix}`, problem: 'Alta de proceso no disponible' },
      { row: 3, key: `DEP-${suffix}`, problem: 'no se creó el proceso del que depende' },
      { row: 2, key: `Cargo huérfano ${suffix}`, problem: 'no se creó su proceso o su jefe' },
      { row: 3, key: `Líder ${suffix}`, problem: 'Alta de cargo no disponible' },
      { row: 4, key: `Analista ${suffix}`, problem: 'no se creó su proceso o su jefe' },
      { row: 4, key: `VAL-${suffix}`, problem: 'no se creó su cargo líder' },
    ],
  });
});
