import { managementReviewListResponseSchema } from '@arza/contracts';
import { expect, it } from 'vitest';

import { renderQualityPdfs } from '../../../src/modules/qms/index.js';
import { systemClock } from '../../../src/platform/clock/clock.js';
import { samplePdf, storage } from '../doc/support/file-scenario.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import {
  indicatorBody,
  measurementBody,
  monthStart,
  reviewBody,
  reviewOf,
} from './support/qms-b39-fixture.js';
import {
  at,
  coded,
  created,
  later,
  qualityFixture,
  type QualityStaff,
} from './support/qms-fixture.js';

// Revisión por la dirección (B39; RE-SGC-007, decisiones 5 y 9): entradas precargadas, decisiones
// que se vuelven acciones y aprobación solo de la Dirección.

const scenario = new AccessScenario('calidad revision');

async function draft(f: QualityStaff): Promise<{ id: string; code: string }> {
  return coded(
    await scenario.post('/v1/qms/management-reviews', f.quality.session, reviewBody(scenario)),
  );
}

function preparation(f: QualityStaff) {
  return {
    attendees: 'Dirección, Calidad y líderes de proceso',
    comments: [{ key: 'resources', comment: 'Se requiere un analista de calidad adicional.' }],
    conclusions: 'El sistema de gestión es conveniente, adecuado y eficaz.',
    decisions: [
      {
        description: 'Contratar un analista de calidad.',
        responsible_id: f.worker.id,
        due_on: later(scenario, 60),
      },
    ],
  };
}

/** Precargada, preparada y enviada; devuelve la versión. */
async function submitted(f: QualityStaff, id: string): Promise<number> {
  const base = `/v1/qms/management-reviews/${id}`;
  for (const response of [
    await at(scenario, `${base}/actions/load-inputs`, f.quality, 1),
    await scenario.patch(base, f.quality.session, preparation(f), 2),
    await at(scenario, `${base}/actions/submit`, f.quality, 3),
  ]) {
    if (response.status !== 204) throw new Error(response.text);
  }
  return 4;
}

it('Calidad crea el acta; los demás no la crean ni la leen sin permiso', async () => {
  const f = await qualityFixture(scenario, 'crear');
  const body = reviewBody(scenario);
  expect((await scenario.post('/v1/qms/management-reviews', f.director.session, body)).status).toBe(
    403,
  );
  const { id, code } = await draft(f);
  expect(code).toMatch(/^RD-\d{4}-\d{4}$/);
  const review = await reviewOf(scenario, f.director, id);
  expect(review.status).toBe('draft');
  expect(review.inputs).toHaveLength(10);
  expect((await scenario.get('/v1/qms/management-reviews', f.worker.session)).status).toBe(403);
  const backwards = { ...body, period_to: monthStart(scenario, 12) };
  expect(
    (await scenario.post('/v1/qms/management-reviews', f.quality.session, backwards)).status,
  ).toBe(422);
});

it('precarga las entradas que la plataforma conoce y deja vacías las manuales', async () => {
  const f = await qualityFixture(scenario, 'entradas');
  const indicator = coded(
    await scenario.post(
      '/v1/qms/indicators',
      f.quality.session,
      await indicatorBody(scenario, f.worker.id),
    ),
  );
  created(
    await scenario.post(
      `/v1/qms/indicators/${indicator.id}/measurements`,
      f.worker.session,
      measurementBody(monthStart(scenario, 1), '4.2'),
    ),
  );
  const { id } = await draft(f);
  const base = `/v1/qms/management-reviews/${id}`;
  expect((await at(scenario, `${base}/actions/submit`, f.quality, 1)).status).toBe(409);
  expect((await at(scenario, `${base}/actions/load-inputs`, f.director, 1)).status).toBe(403);
  expect((await at(scenario, `${base}/actions/load-inputs`, f.quality, 1)).status).toBe(204);
  const review = await reviewOf(scenario, f.quality, id);
  const lines = (key: string) => review.inputs.find((input) => input.key === key)?.lines ?? [];
  expect(lines('customer')).toHaveLength(3);
  expect(lines('indicators').some((line) => line.startsWith(indicator.code))).toBe(true);
  expect(lines('indicators').find((line) => line.startsWith(indicator.code))).toContain('cumple');
  expect(lines('resources')).toEqual([]);
  expect(review.inputs_loaded_at).not.toBeNull();
});

it('la Dirección devuelve o aprueba; al aprobar, las decisiones son acciones', async () => {
  const f = await qualityFixture(scenario, 'aprobar');
  const { id } = await draft(f);
  const base = `/v1/qms/management-reviews/${id}`;
  const version = await submitted(f, id);
  const notices = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'qms.review.submitted',
        payload: { path: ['review_id'], equals: id },
      },
    }),
  );
  expect(JSON.stringify(notices.payload)).toContain(f.director.id);
  expect((await at(scenario, `${base}/actions/approve`, f.quality, version)).status).toBe(403);
  const reason = { reason: 'Falta el análisis de los proveedores.' };
  expect((await at(scenario, `${base}/actions/return`, f.director, version, reason)).status).toBe(
    204,
  );
  expect((await reviewOf(scenario, f.quality, id)).return_reason).toBe(reason.reason);
  expect((await at(scenario, `${base}/actions/submit`, f.quality, version + 1)).status).toBe(204);
  expect((await at(scenario, `${base}/actions/approve`, f.director, version + 2)).status).toBe(204);
  const review = await reviewOf(scenario, f.quality, id);
  expect(review).toMatchObject({ status: 'approved', approved_by: { id: f.director.id } });
  const code = review.decisions[0]?.action?.code ?? '';
  expect(code).toMatch(/^AC-/);
  const action = await scenario.inTenant((tx) =>
    tx.qmsAction.findFirstOrThrow({ where: { code } }),
  );
  expect(action).toMatchObject({ originType: 'management_review', reviewId: id });
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'qms.management_review.create:success',
    'qms.management_review.load:success',
    'qms.management_review.update:success',
    'qms.management_review.submit:success',
    'qms.management_review.return:success',
    'qms.management_review.submit:success',
    'qms.management_review.approve:success',
  ]);
});

it('el acta aprobada no cambia, ni por la API ni en la base (decisión 9)', async () => {
  const f = await qualityFixture(scenario, 'fija');
  const { id } = await draft(f);
  const version = await submitted(f, id);
  const base = `/v1/qms/management-reviews/${id}`;
  await at(scenario, `${base}/actions/approve`, f.director, version);
  expect((await scenario.patch(base, f.quality.session, preparation(f), version + 1)).status).toBe(
    409,
  );
  await expect(
    scenario.inTenant((tx) =>
      tx.qmsManagementReview.update({ where: { id }, data: { conclusions: 'Otra' } }),
    ),
  ).rejects.toThrow();
  // Otra prueba en paralelo puede generar este PDF primero: se comprueba el resultado, no el conteo.
  await renderQualityPdfs({
    database: apiDatabase(),
    clock: systemClock,
    storage: storage(),
    convertHtml: () => Promise.resolve(samplePdf('Acta')),
  });
  expect((await reviewOf(scenario, f.quality, id)).document_id).not.toBeNull();
  expect((await scenario.post(`${base}/download-link`, f.auditor.session)).status).toBe(200);
  expect((await scenario.post(`${base}/download-link`, f.worker.session)).status).toBe(403);
});

it('una decisión no lleva fecha pasada', async () => {
  const f = await qualityFixture(scenario, 'fecha');
  const { id } = await draft(f);
  const body = preparation(f);
  const past = { ...body, decisions: [{ ...body.decisions[0], due_on: monthStart(scenario, 2) }] };
  const patch = await scenario.patch(
    `/v1/qms/management-reviews/${id}`,
    f.quality.session,
    past,
    1,
  );
  expect(patch.status).toBe(422);
});

it('otra empresa no ve ni aprueba las actas', async () => {
  const f = await qualityFixture(scenario, 'ajena');
  const { id } = await draft(f);
  const version = await submitted(f, id);
  const stranger = await scenario.person('acta-ajena', ['DIRECCION'], {
    tenantId: scenario.otherTenant.id,
  });
  const base = `/v1/qms/management-reviews/${id}`;
  expect((await scenario.get(base, stranger.session)).status).toBe(404);
  expect((await at(scenario, `${base}/actions/approve`, stranger, version)).status).toBe(404);
  const theirs = managementReviewListResponseSchema.parse(
    (await scenario.get('/v1/qms/management-reviews', stranger.session)).body,
  );
  expect(theirs.data.map((item) => item.id)).not.toContain(id);
});
