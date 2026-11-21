import {
  inspectionListResponseSchema,
  quickReportResponseSchema,
  unsafeReportListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';

import { addDays } from '../../../src/modules/core/index.js';
import { availableFile } from '../hr/support/people-fixture.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  ACCIDENT,
  answersFor,
  at,
  created,
  hazardBody,
  homeRequest,
  plannedIncident,
  processId,
  quickReport,
  sstFixture,
  today,
} from './support/sst-fixture.js';

// Casos límite de SST (B37): reintentos con la misma clave, fechas futuras, versiones viejas,
// pasos fuera de orden y registros que no existen. Ninguno deja datos a medias.

const scenario = new AccessScenario('sst bordes');
const MISSING = '01900000-0000-7000-8000-00000000dead';
const CONDITION = {
  kind: 'unsafe_condition',
  description: 'Piso mojado sin aviso.',
  location: 'Cocina',
};

it('el reporte con la misma clave no se duplica ni sirve para otro tipo', async () => {
  const f = await sstFixture(scenario, 'bordes-reporte');
  const key = uuidv7();
  const send = (body: object) =>
    scenario.post('/v1/sst/me/reports', f.worker.session, body).set('Idempotency-Key', key);
  const first = quickReportResponseSchema.parse((await send(CONDITION)).body);
  expect(quickReportResponseSchema.parse((await send(CONDITION)).body).id).toBe(first.id);
  expect((await send({ ...CONDITION, kind: 'unsafe_act' })).status).toBe(409);
  const future = new Date(scenario.clock.now().getTime() + 60 * 60 * 1000).toISOString();
  const later = await scenario
    .post('/v1/sst/me/reports', f.worker.session, {
      ...CONDITION,
      kind: 'incident',
      occurred_at: future,
    })
    .set('Idempotency-Key', uuidv7());
  expect(later.status).toBe(422);
  const photo = await scenario
    .post('/v1/sst/me/reports', f.worker.session, { ...CONDITION, photo_file_id: MISSING })
    .set('Idempotency-Key', uuidv7());
  expect(photo.status).toBe(422);
});

it('los pasos del incidente fuera de orden se rechazan', async () => {
  const f = await sstFixture(scenario, 'bordes-pasos');
  const incident = await quickReport(scenario, f.worker, { ...CONDITION, kind: 'incident' });
  const path = (action: string) => `/v1/sst/incidents/${incident}/actions/${action}`;
  const arl = { reported_on: today(scenario), filing_number: 'FURAT-1' };
  expect((await at(scenario, path('report-arl'), f.sst, 1, arl)).status).toBe(409);
  const plan = {
    immediate_causes: 'Piso mojado sin aviso.',
    root_causes: 'Falta de protocolo de aseo.',
    actions: [{ description: 'Comprar avisos', responsible_id: f.sst.id, due_on: today(scenario) }],
  };
  expect((await at(scenario, path('plan'), f.sst, 1, plan)).status).toBe(409);
  expect(
    (await at(scenario, path('close'), f.sst, 1, { conclusion: 'Se cierra el caso.' })).status,
  ).toBe(409);
  const wrong = { team: 'SST', affected_employee_id: MISSING };
  expect((await at(scenario, path('investigate'), f.sst, 1, wrong)).status).toBe(422);
  const team = { team: 'SST', affected_employee_id: f.peerEmployeeId };
  expect((await at(scenario, path('investigate'), f.sst, 1, team)).status).toBe(204);
  expect((await at(scenario, path('investigate'), f.sst, 2, team)).status).toBe(409);
  expect((await at(scenario, path('investigate'), f.sst, 1, team)).status).toBe(409);
  const past = { ...plan, actions: [{ ...plan.actions[0], due_on: addDays(today(scenario), -3) }] };
  expect((await at(scenario, path('plan'), f.sst, 2, past)).status).toBe(422);
  const stranger = { ...plan, actions: [{ ...plan.actions[0], responsible_id: MISSING }] };
  expect((await at(scenario, path('plan'), f.sst, 2, stranger)).status).toBe(422);
  expect((await scenario.get(`/v1/sst/incidents/${MISSING}`, f.sst.session)).status).toBe(404);
});

it('el reporte a la ARL no acepta fechas fuera del rango ni repetirse', async () => {
  const f = await sstFixture(scenario, 'bordes-arl');
  const id = await quickReport(scenario, f.worker, ACCIDENT);
  const path = `/v1/sst/incidents/${id}/actions/report-arl`;
  const before = { reported_on: addDays(today(scenario), -10), filing_number: 'FURAT-2' };
  expect((await at(scenario, path, f.sst, 1, before)).status).toBe(422);
  expect(
    (await at(scenario, path, f.sst, 7, { ...before, reported_on: today(scenario) })).status,
  ).toBe(409);
});

it('la acción ya hecha, ajena o con fecha futura no se marca', async () => {
  const f = await sstFixture(scenario, 'bordes-accion');
  const { actionId } = await plannedIncident(scenario, f);
  const path = `/v1/sst/investigation-actions/${actionId}/actions/complete`;
  const future = { done_on: addDays(today(scenario), 2), note: null };
  expect((await at(scenario, path, f.worker, 1, future)).status).toBe(422);
  const done = { done_on: today(scenario), note: 'Hecho por SST' };
  expect((await at(scenario, path, f.sst, 1, done)).status).toBe(204);
  expect((await at(scenario, path, f.worker, 2, done)).status).toBe(409);
  expect((await at(scenario, path, f.sst, 9, done)).status).toBe(409);
});

it('un reporte atendido no se vuelve a atender y la versión vieja no pasa', async () => {
  const f = await sstFixture(scenario, 'bordes-atender');
  const id = await quickReport(scenario, f.worker, CONDITION);
  const path = `/v1/sst/unsafe-reports/${id}/actions/attend`;
  const progress = { status: 'in_progress', response: 'Se pidió el aviso.' };
  expect((await at(scenario, path, f.sst, 1, progress)).status).toBe(204);
  expect((await at(scenario, path, f.sst, 1, progress)).status).toBe(409);
  expect((await at(scenario, path, f.sst, 2, { ...progress, status: 'closed' })).status).toBe(204);
  expect((await at(scenario, path, f.sst, 3, progress)).status).toBe(409);
  expect(
    (await at(scenario, `/v1/sst/unsafe-reports/${MISSING}/actions/attend`, f.sst, 1, progress))
      .status,
  ).toBe(404);
});

it('el peligro y el plan rechazan lo que no existe, lo repetido y las fechas fuera del año', async () => {
  const f = await sstFixture(scenario, 'bordes-plan');
  const body = hazardBody(await processId(scenario), today(scenario));
  expect((await scenario.patch(`/v1/sst/hazards/${MISSING}`, f.sst.session, body, 1)).status).toBe(
    404,
  );
  const id = created(await scenario.post('/v1/sst/hazards', f.sst.session, body));
  const otherProcess = { ...body, process_id: MISSING };
  expect(
    (await scenario.patch(`/v1/sst/hazards/${id}`, f.sst.session, otherProcess, 1)).status,
  ).toBe(422);
  const year = Number(today(scenario).slice(0, 4));
  const item = {
    year,
    activity: 'Revisar botiquín',
    responsible_id: MISSING,
    due_on: today(scenario),
  };
  expect((await scenario.post('/v1/sst/work-plan', f.sst.session, item)).status).toBe(422);
  const plan = created(
    await scenario.post('/v1/sst/work-plan', f.sst.session, { ...item, responsible_id: f.sst.id }),
  );
  const path = `/v1/sst/work-plan/${plan}/actions/complete`;
  const evidence = await availableFile(scenario, f.sst);
  const future = { done_on: addDays(today(scenario), 1), evidence_file_id: evidence };
  expect((await at(scenario, path, f.sst, 1, future)).status).toBe(422);
  const done = { done_on: today(scenario), evidence_file_id: evidence };
  expect((await at(scenario, path, f.sst, 2, done)).status).toBe(409);
  expect((await at(scenario, path, f.sst, 1, done)).status).toBe(204);
  expect((await at(scenario, path, f.sst, 2, done)).status).toBe(409);
  expect(
    (await at(scenario, `/v1/sst/work-plan/${MISSING}/actions/complete`, f.sst, 1, done)).status,
  ).toBe(404);
  const otherYear = await scenario.get(`/v1/sst/work-plan?year=${String(year - 1)}`, f.hr.session);
  expect(otherYear.body).toMatchObject({ year: year - 1, data: [] });
});

it('las inspecciones rechazan listas incompletas, fechas imposibles y pasos repetidos', async () => {
  const f = await sstFixture(scenario, 'bordes-inspeccion');
  const record = {
    kind: 'facility',
    inspected_on: addDays(today(scenario), 1),
    place: 'Sede',
    answers: [{ code: 'RUTAS', result: 'ok', note: null }],
  };
  expect((await scenario.post('/v1/sst/inspections', f.sst.session, record)).status).toBe(422);
  const partial = { ...record, inspected_on: today(scenario) };
  expect((await scenario.post('/v1/sst/inspections', f.sst.session, partial)).status).toBe(422);
  const past = { employee_id: f.workerEmployeeId, due_on: addDays(today(scenario), -1) };
  expect(
    (await scenario.post('/v1/sst/inspections/home-requests', f.sst.session, past)).status,
  ).toBe(422);
  const nobody = { employee_id: MISSING, due_on: today(scenario) };
  expect(
    (await scenario.post('/v1/sst/inspections/home-requests', f.sst.session, nobody)).status,
  ).toBe(422);
  const id = await homeRequest(scenario, f);
  const review = { findings: 'Sin hallazgos.' };
  expect(
    (await at(scenario, `/v1/sst/inspections/${id}/actions/review`, f.sst, 1, review)).status,
  ).toBe(409);
  expect(
    (await at(scenario, `/v1/sst/inspections/${MISSING}/actions/review`, f.sst, 1, review)).status,
  ).toBe(404);
  const answers = { place: 'Bogotá', answers: [{ code: 'SILLA', result: 'ok', note: null }] };
  expect(
    (await at(scenario, `/v1/sst/me/inspections/${id}/answers`, f.worker, 1, answers)).status,
  ).toBe(422);
  expect(
    (await at(scenario, `/v1/sst/me/inspections/${id}/answers`, f.hr, 1, answers)).status,
  ).toBe(404);
  const checklist = await scenario.get('/v1/sst/inspections/checklists/home', f.sst.session);
  expect(checklist.status).toBe(200);
});

it('SST ve los reportes pendientes primero y registra una inspección de instalaciones', async () => {
  const f = await sstFixture(scenario, 'bordes-lista');
  const first = await quickReport(scenario, f.worker, CONDITION);
  const second = await quickReport(scenario, f.peer, { ...CONDITION, kind: 'unsafe_act' });
  const done = { status: 'closed', response: 'Se señalizó el piso.' };
  await at(scenario, `/v1/sst/unsafe-reports/${first}/actions/attend`, f.sst, 1, done);
  const list = unsafeReportListResponseSchema.parse(
    (await scenario.get('/v1/sst/unsafe-reports', f.hr.session)).body,
  );
  const ids = list.data.map((report) => report.id);
  expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
  const body = {
    kind: 'facility',
    inspected_on: today(scenario),
    place: 'Sede principal',
    answers: await answersFor(scenario, 'facility'),
    findings: 'Señalizar la salida de emergencia.',
  };
  const id = created(await scenario.post('/v1/sst/inspections', f.sst.session, body));
  const inspections = inspectionListResponseSchema.parse(
    (await scenario.get('/v1/sst/inspections', f.sst.session)).body,
  );
  expect(inspections.data.find((item) => item.id === id)).toMatchObject({
    status: 'reviewed',
    failed: 1,
  });
});
