import {
  INDICATOR_MATRIX_COLUMNS,
  indicatorListResponseSchema,
  indicatorSeriesResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';

import { runQmsIndicatorWork } from '../../../src/modules/qms/index.js';
import { serviceQualityFigures } from '../../../src/modules/service/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { auditActions } from '../iam/support/iam-fixtures.js';
import { indicatorBody, measurementBody, monthStart } from './support/qms-b39-fixture.js';
import {
  coded,
  created,
  qualityFixture,
  reported,
  today,
  type QualityStaff,
} from './support/qms-fixture.js';

// Indicadores con ficha, medición, análisis y tendencia, y la matriz RE-SGC-006 (B39; ficha 17.15,
// decisiones 6 a 8 y 10).

const scenario = new AccessScenario('calidad indicadores');

async function indicator(f: QualityStaff, overrides: Record<string, unknown> = {}) {
  const body = await indicatorBody(scenario, f.worker.id, overrides);
  return coded(await scenario.post('/v1/qms/indicators', f.quality.session, body));
}

async function series(f: QualityStaff, id: string, mine = false) {
  const path = mine ? `/v1/qms/my/indicators/${id}/series` : `/v1/qms/indicators/${id}/series`;
  const person = mine ? f.worker : f.quality;
  const response = await scenario.get(path, person.session);
  if (response.status !== 200) throw new Error(response.text);
  return indicatorSeriesResponseSchema.parse(response.body);
}

it('Calidad crea la ficha; los demás no', async () => {
  const f = await qualityFixture(scenario, 'ficha');
  const body = await indicatorBody(scenario, f.worker.id);
  expect((await scenario.post('/v1/qms/indicators', f.director.session, body)).status).toBe(403);
  expect((await scenario.post('/v1/qms/indicators', f.worker.session, body)).status).toBe(403);
  const { id, code } = coded(await scenario.post('/v1/qms/indicators', f.quality.session, body));
  expect(code).toMatch(/^IND-\d{3,}$/);
  const mismatch = { ...body, source: 'qms_actions_effective' };
  expect((await scenario.post('/v1/qms/indicators', f.quality.session, mismatch)).status).toBe(422);
  expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
    'qms.indicator.create:success',
  ]);
});

it('el responsable mide con evidencia; la plataforma dice si cumple y la tendencia', async () => {
  const f = await qualityFixture(scenario, 'medicion');
  const { id } = await indicator(f);
  const path = `/v1/qms/indicators/${id}/measurements`;
  const before = monthStart(scenario, 2);
  const last = monthStart(scenario, 1);
  created(await scenario.post(path, f.worker.session, measurementBody(before, '4.5')));
  created(await scenario.post(path, f.worker.session, measurementBody(last, '3.8')));
  expect((await scenario.post(path, f.worker.session, measurementBody(last, '4'))).status).toBe(
    409,
  );
  const result = await series(f, id, true);
  expect(result.data.map((item) => [item.value, item.meets, item.trend])).toEqual([
    ['4.5', true, null],
    ['3.8', false, 'down'],
  ]);
  expect(result.indicator.pending_period).toBeNull();
  expect(result.data[1]).toMatchObject({ automatic: false, measured_by: { id: f.worker.id } });
  const other = await scenario.person('medidor-ajeno', ['COLABORADOR']);
  expect(
    (await scenario.post(path, other.session, measurementBody(monthStart(scenario, 3), '4')))
      .status,
  ).toBe(403);
  expect((await scenario.get('/v1/qms/indicators', f.worker.session)).status).toBe(403);
});

it('no se mide el futuro ni un día que no abre periodo', async () => {
  const f = await qualityFixture(scenario, 'periodos');
  const { id } = await indicator(f);
  const path = `/v1/qms/indicators/${id}/measurements`;
  const next = monthStart(scenario, -1);
  expect((await scenario.post(path, f.worker.session, measurementBody(next, '4'))).status).toBe(
    422,
  );
  const middle = `${monthStart(scenario, 1).slice(0, 8)}15`;
  expect((await scenario.post(path, f.worker.session, measurementBody(middle, '4'))).status).toBe(
    422,
  );
  const noEvidence = { ...measurementBody(monthStart(scenario, 1), '4'), evidence_note: '' };
  expect((await scenario.post(path, f.worker.session, noEvidence)).status).toBe(422);
});

it('Calidad calcula un indicador automático; el responsable le agrega el análisis', async () => {
  const f = await qualityFixture(scenario, 'automatico');
  await reported(scenario, f.worker);
  const { id } = await indicator(f, {
    name: 'No conformidades abiertas',
    unit: 'count',
    direction: 'lower_better',
    target: '5',
    source: 'qms_open_nonconformities',
  });
  const calc = `/v1/qms/indicators/${id}/actions/calculate`;
  expect((await scenario.post(calc, f.worker.session, {})).status).toBe(403);
  const current = { period_start: monthStart(scenario, 0) };
  const measurement = created(await scenario.post(calc, f.quality.session, current));
  const result = await series(f, id);
  expect(Number(result.data[0]?.value)).toBeGreaterThanOrEqual(1);
  expect(result.data[0]).toMatchObject({ automatic: true, measured_by: null });
  const manual = measurementBody(monthStart(scenario, 1), '1');
  expect(
    (await scenario.post(`/v1/qms/indicators/${id}/measurements`, f.worker.session, manual)).status,
  ).toBe(409);
  const analysis = { analysis: 'Las no conformidades abiertas son de reporte reciente.' };
  const patch = `/v1/qms/measurements/${measurement}`;
  expect((await scenario.patch(patch, f.worker.session, analysis, 1)).status).toBe(204);
  expect(await auditActions(scenario.db, scenario.tenant.id, measurement)).toEqual([
    'qms.indicator.calculate:success',
    'qms.indicator.analyze:success',
  ]);
});

it('sin datos que dividir no hay medición, y con mediciones no cambia la fuente', async () => {
  const f = await qualityFixture(scenario, 'sin-datos');
  const { id } = await indicator(f, {
    unit: 'percent',
    target: '90',
    source: 'qms_actions_effective',
  });
  const calc = `/v1/qms/indicators/${id}/actions/calculate`;
  const old = { period_start: '2021-01-01' };
  expect((await scenario.post(calc, f.quality.session, old)).status).toBe(422);
  const incidents = await indicator(f, {
    unit: 'count',
    target: '0',
    direction: 'lower_better',
    source: 'sst_incidents',
  });
  created(
    await scenario.post(
      `/v1/qms/indicators/${incidents.id}/actions/calculate`,
      f.quality.session,
      old,
    ),
  );
  const body = await indicatorBody(scenario, f.worker.id, { source: 'manual' });
  const patch = await scenario.patch(
    `/v1/qms/indicators/${incidents.id}`,
    f.quality.session,
    body,
    1,
  );
  expect(patch.status).toBe(409);
});

it('la matriz se descarga en CSV con las columnas de RE-SGC-006', async () => {
  const f = await qualityFixture(scenario, 'matriz');
  await indicator(f);
  expect((await scenario.post('/v1/qms/indicators/export', f.worker.session)).status).toBe(403);
  const response = await scenario.post('/v1/qms/indicators/export', f.auditor.session);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain('text/csv');
  expect(response.text.split('\n')[0]).toContain(INDICATOR_MATRIX_COLUMNS.join(';'));
  const list = indicatorListResponseSchema.parse(
    (await scenario.get('/v1/qms/indicators', f.director.session)).body,
  );
  expect(list.data.length).toBeGreaterThan(0);
});

it('el trabajo diario calcula los automáticos y recuerda una vez los manuales (decisión 7)', async () => {
  const f = await qualityFixture(scenario, 'trabajo');
  const manual = await indicator(f);
  const automatic = await indicator(f, {
    unit: 'count',
    target: '0',
    direction: 'lower_better',
    source: 'sst_incidents',
  });
  const deps = {
    database: scenario.db,
    clock: scenario.clock,
    serviceFigures: serviceQualityFigures,
  };
  await runQmsIndicatorWork(deps);
  await runQmsIndicatorWork(deps);
  const notices = await scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: {
        eventType: 'qms.indicator.due',
        payload: { path: ['indicator_id'], equals: manual.id },
      },
    }),
  );
  // El aviso sale desde el día 5 del mes (en Colombia).
  expect(notices).toBe(Number(today(scenario).slice(8, 10)) >= 5 ? 1 : 0);
  const calculated = await series(f, automatic.id);
  expect(calculated.data.map((item) => item.period_start)).toEqual([monthStart(scenario, 1)]);
});

it('otra empresa no ve ni mide los indicadores', async () => {
  const f = await qualityFixture(scenario, 'ajeno');
  const { id } = await indicator(f);
  const stranger = await scenario.person('indicador-ajeno', ['CALIDAD'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get(`/v1/qms/indicators/${id}/series`, stranger.session)).status).toBe(
    404,
  );
  const path = `/v1/qms/indicators/${id}/measurements`;
  const body = measurementBody(monthStart(scenario, 1), '4');
  expect((await scenario.post(path, stranger.session, body)).status).toBe(404);
  const theirs = indicatorListResponseSchema.parse(
    (await scenario.get('/v1/qms/indicators', stranger.session)).body,
  );
  expect(theirs.data.map((item) => item.id)).not.toContain(id);
});
