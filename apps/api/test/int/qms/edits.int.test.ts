import { expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  actionBody,
  at,
  coded,
  created,
  later,
  processId,
  qualityFixture,
  reported,
  today,
} from './support/qms-fixture.js';

// Ediciones de Calidad (B38): lo que no existe responde 404 y una versión vieja responde 409 en
// contexto, partes interesadas y lecciones; no se contiene con fecha futura ni se ejecuta con un
// archivo que no existe.

const scenario = new AccessScenario('calidad ediciones');
const GHOST = '01900000-0000-7000-8000-00000000dead';

const CONTEXT = {
  kind: 'weakness',
  pestel_factor: null,
  description: 'Pocos procesos documentados',
  impact: 'medium',
};
const PARTY = {
  name: 'Proveedores',
  stakeholder_type: 'external',
  needs: 'Pagos a tiempo',
  expectations: 'Relación estable',
  monitoring: null,
};
const LESSON = {
  title: 'Revisar antes de enviar',
  context: 'Se envió un informe sin revisión.',
  lesson: 'Una segunda persona revisa el informe.',
  process_id: null,
  nonconformity_id: null,
};

it('editar lo que no existe da 404 y con una versión vieja da 409', async () => {
  const f = await qualityFixture(scenario, 'ediciones');
  const context = { ...CONTEXT, year: Number(today(scenario).slice(0, 4)) };
  for (const [path, body] of [
    ['/v1/qms/context', context],
    ['/v1/qms/stakeholders', PARTY],
    ['/v1/qms/lessons', LESSON],
  ] as const) {
    const id = created(await scenario.post(path, f.quality.session, body));
    const ghost = await scenario.patch(`${path}/${GHOST}`, f.quality.session, body, 1);
    expect(ghost.status, path).toBe(404);
    expect((await scenario.patch(`${path}/${id}`, f.quality.session, body, 1)).status).toBe(204);
    expect((await scenario.patch(`${path}/${id}`, f.quality.session, body, 1)).status).toBe(409);
  }
});

it('no se contiene con fecha futura ni se ejecuta con un archivo inexistente', async () => {
  const f = await qualityFixture(scenario, 'fechas');
  const id = await reported(scenario, f.worker);
  const contain = {
    classification: 'minor',
    process_id: await processId(scenario),
    containment: 'Se retiró el informe.',
    contained_on: later(scenario, 2),
  };
  const path = `/v1/qms/nonconformities/${id}/actions/contain`;
  expect((await at(scenario, path, f.quality, 1, contain)).status).toBe(422);
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, later(scenario, 5));
  const action = coded(await scenario.post('/v1/qms/actions', f.quality.session, body)).id;
  const execution = {
    evidence_note: 'Se adjunta el acta.',
    evidence_file_id: GHOST,
    executed_on: today(scenario),
  };
  const execute = `/v1/qms/actions/${action}/actions/execute`;
  expect((await at(scenario, execute, f.worker, 1, execution)).status).toBe(422);
});
