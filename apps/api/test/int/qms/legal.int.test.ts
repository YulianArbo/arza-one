import { legalEvaluationListResponseSchema, qmsActionListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { created, later, qualityFixture } from './support/qms-fixture.js';
import {
  complies,
  fails,
  normograma,
  requirement,
  requirementBody,
} from './support/qms-legal-fixture.js';

// Normograma y evaluación del cumplimiento legal (B46, ficha 17.17 y decisiones 6 y 7).

const scenario = new AccessScenario('normograma');
const BASE = '/v1/qms/legal-requirements';

describe('registro del normograma', () => {
  it('Calidad registra y edita; la Dirección y el Auditor consultan; nadie más', async () => {
    const f = await qualityFixture(scenario, 'registro');
    const body = requirementBody();
    expect((await scenario.post(BASE, f.director.session, body)).status).toBe(403);
    const { id, code } = await requirement(scenario, f, { norm: body.norm });
    expect(code).toMatch(/^NRM-\d{3,}$/u);
    const changed = { ...body, applies: false };
    expect((await scenario.patch(`${BASE}/${id}`, f.quality.session, changed, 1)).status).toBe(204);
    expect((await scenario.patch(`${BASE}/${id}`, f.quality.session, changed, 1)).status).toBe(409);
    for (const reader of [f.director, f.auditor]) {
      const list = await normograma(scenario, reader);
      expect(list.data.find((item) => item.id === id)).toMatchObject({
        applies: false,
        pending: false,
      });
    }
    expect((await scenario.get(BASE, f.worker.session)).status).toBe(403);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'qms.legal_requirement.create:success',
      'qms.legal_requirement.update:success',
    ]);
  });

  it('el proceso y el responsable deben existir', async () => {
    const f = await qualityFixture(scenario, 'referencias');
    const missing = '01900000-0000-7000-8000-00000000abcd';
    for (const field of ['process_id', 'responsible_id']) {
      const response = await scenario.post(
        BASE,
        f.quality.session,
        requirementBody({ [field]: missing }),
      );
      expect(response.status).toBe(422);
    }
  });
});

describe('evaluación del cumplimiento', () => {
  it('cada requisito muestra su última evaluación y deja de estar pendiente', async () => {
    const f = await qualityFixture(scenario, 'evalua');
    const { id } = await requirement(scenario, f);
    expect(
      (await normograma(scenario, f.quality)).data.find((item) => item.id === id),
    ).toMatchObject({
      pending: true,
      last_evaluation: null,
    });
    const path = `${BASE}/${id}/evaluations`;
    expect((await scenario.post(path, f.auditor.session, complies(scenario))).status).toBe(403);
    const first = created(await scenario.post(path, f.director.session, complies(scenario)));
    const second = created(
      await scenario.post(path, f.quality.session, fails(scenario, f.worker.id)),
    );
    const item = (await normograma(scenario, f.auditor)).data.find((row) => row.id === id);
    expect(item).toMatchObject({
      pending: false,
      last_evaluation: { id: second, result: 'fails' },
    });
    const history = await scenario.get(path, f.auditor.session);
    const evaluations = legalEvaluationListResponseSchema.parse(history.body).data;
    expect(evaluations.map((row) => row.id)).toEqual([second, first]);
    expect(await auditActions(scenario.db, scenario.tenant.id, first)).toEqual([
      'qms.legal_requirement.evaluate:success',
    ]);
  });
});

describe('acción de mejora de la evaluación', () => {
  it('«no cumple» abre su acción de mejora en la bitácora; sin plan no se acepta', async () => {
    const f = await qualityFixture(scenario, 'accion');
    const { id, code } = await requirement(scenario, f);
    const path = `${BASE}/${id}/evaluations`;
    const withoutPlan = { ...fails(scenario, f.worker.id), action: null };
    expect((await scenario.post(path, f.quality.session, withoutPlan)).status).toBe(422);
    created(await scenario.post(path, f.quality.session, fails(scenario, f.worker.id)));
    const log = await scenario.get(
      '/v1/qms/actions?origin_type=legal_evaluation',
      f.quality.session,
    );
    const actions = qmsActionListResponseSchema.parse(log.body).data;
    expect(actions.find((action) => action.origin?.code === code)).toMatchObject({
      origin_type: 'legal_evaluation',
      action_type: 'improvement',
      responsible: { id: f.worker.id },
      due_on: later(scenario, 30),
    });
  });
});

describe('reglas de la evaluación', () => {
  it('no se evalúa en el futuro ni con una acción vencida', async () => {
    const f = await qualityFixture(scenario, 'fechas');
    const { id } = await requirement(scenario, f);
    const path = `${BASE}/${id}/evaluations`;
    const future = { ...complies(scenario), evaluated_on: later(scenario, 1) };
    expect((await scenario.post(path, f.quality.session, future)).status).toBe(422);
    const plan = {
      description: 'Corregir.',
      responsible_id: f.worker.id,
      due_on: later(scenario, -1),
    };
    const late = { ...fails(scenario, f.worker.id), action: plan };
    expect((await scenario.post(path, f.quality.session, late)).status).toBe(422);
  });
});

describe('aislamiento y descarga', () => {
  it('otra empresa no ve ni evalúa el normograma', async () => {
    const f = await qualityFixture(scenario, 'aislamiento');
    const { id } = await requirement(scenario, f);
    const other = await scenario.person('calidad-otra', ['CALIDAD'], {
      tenantId: scenario.otherTenant.id,
    });
    expect((await normograma(scenario, other)).data.some((item) => item.id === id)).toBe(false);
    const path = `${BASE}/${id}/evaluations`;
    expect((await scenario.post(path, other.session, complies(scenario))).status).toBe(404);
    expect((await scenario.get(path, other.session)).status).toBe(404);
  });

  it('el normograma se descarga en CSV y la descarga queda en la auditoría', async () => {
    const f = await qualityFixture(scenario, 'descarga');
    const { code } = await requirement(scenario, f);
    const response = await scenario.post(`${BASE}/export`, f.auditor.session);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.text).toContain('Código;Tipo de norma;Norma');
    expect(response.text).toContain(code);
    expect(await auditActions(scenario.db, scenario.tenant.id, scenario.tenant.id)).toContain(
      'qms.legal_requirement.export:success',
    );
  });
});
