import { legalImportResponseSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { activeProcesses } from '../../../src/modules/core/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { qualityFixture } from './support/qms-fixture.js';
import { legalCsv, normograma } from './support/qms-legal-fixture.js';

// Carga del normograma desde el archivo RE-DG-001 (B46, decisión 6): primero se revisa; con un
// solo error no se guarda nada; repetir la carga actualiza sin duplicar.

const scenario = new AccessScenario('normograma carga');
const PATH = '/v1/qms/legal-requirements/import';

async function processCode(): Promise<string> {
  const processes = await scenario.inTenant((tx) => activeProcesses(tx));
  const found = processes[0];
  if (found === undefined) throw new Error('La empresa de prueba no tiene procesos.');
  return found.code;
}

function row(norm: string, process: string, means = 'Procedimiento.'): string[] {
  return ['Ley', norm, 'Congreso', 'Art. 2', 'Requisito de la carga.', means, process, 'Sí'];
}

async function load(content: string, apply: boolean, session = 'quality') {
  const f = await qualityFixture(scenario, `carga-${session}`);
  const person = session === 'quality' ? f.quality : f.director;
  const response = await scenario.post(PATH, person.session, { content, apply });
  return { response, f };
}

it('revisar no guarda; aplicar crea; repetir actualiza sin duplicar', async () => {
  const norm = `Ley de carga ${uuidv7().slice(-8)}`;
  const f = await qualityFixture(scenario, 'carga-crea');
  const content = legalCsv([row(norm, await processCode())]);
  const review = await scenario.post(PATH, f.quality.session, { content, apply: false });
  expect(legalImportResponseSchema.parse(review.body)).toMatchObject({
    applied: false,
    created: 1,
    rows: [{ outcome: 'create', errors: [] }],
  });
  expect((await normograma(scenario, f.quality)).data.some((item) => item.norm === norm)).toBe(
    false,
  );
  const apply = await scenario.post(PATH, f.quality.session, { content, apply: true });
  expect(legalImportResponseSchema.parse(apply.body)).toMatchObject({ applied: true, created: 1 });
  const again = legalCsv([row(norm, await processCode(), 'Nuevo control.')]);
  const repeat = await scenario.post(PATH, f.quality.session, { content: again, apply: true });
  expect(legalImportResponseSchema.parse(repeat.body)).toMatchObject({ created: 0, updated: 1 });
  const saved = (await normograma(scenario, f.quality)).data.filter((item) => item.norm === norm);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.compliance_means).toBe('Nuevo control.');
  expect(saved[0]?.process).not.toBeNull();
});

it('con un solo error no guarda nada y explica la fila', async () => {
  const good = `Ley buena ${uuidv7().slice(-8)}`;
  const content = legalCsv([row(good, ''), row(`Ley mala ${uuidv7().slice(-8)}`, 'NO-EXISTE')]);
  const { response, f } = await load(content, true);
  const report = legalImportResponseSchema.parse(response.body);
  expect(report.applied).toBe(false);
  expect(report.rows[1]).toMatchObject({ line: 3, outcome: 'error' });
  expect(report.rows[1]?.errors.join(' ')).toContain('NO-EXISTE');
  expect((await normograma(scenario, f.quality)).data.some((item) => item.norm === good)).toBe(
    false,
  );
});

it('un archivo sin el encabezado se rechaza, y solo Calidad carga', async () => {
  const { response } = await load('Norma;Requisito\r\nLey;Algo', false);
  expect(response.status).toBe(422);
  const content = legalCsv([row(`Ley ${uuidv7().slice(-8)}`, '')]);
  const { response: denied } = await load(content, false, 'director');
  expect(denied.status).toBe(403);
});
