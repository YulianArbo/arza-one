import {
  mySstSchema,
  quickReportResponseSchema,
  sstIncidentDetailSchema,
  sstIncidentListResponseSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { addDays, businessDeadline } from '../../../src/modules/core/index.js';
import { runSstDailyWork } from '../../../src/modules/sst/index.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import {
  ACCIDENT,
  at,
  plannedIncident,
  quickReport,
  sstFixture,
  today,
} from './support/sst-fixture.js';

// Reporte desde el celular, incidentes, accidentes e investigación (B37, decisiones 5, 6 y 10;
// ficha 17.14): cualquier colaborador reporta; el accidente queda con su plazo de dos días hábiles
// para la ARL y SST recibe la alerta; el incidente se cierra con las acciones hechas y, si es
// accidente, reportado.

const scenario = new AccessScenario('sst incidentes');
const CONDITION = {
  kind: 'unsafe_condition',
  description: 'Cable suelto en el pasillo.',
  location: 'Pasillo 3',
};

it('cualquier colaborador reporta una condición insegura y la ve en Mi espacio', async () => {
  const f = await sstFixture(scenario, 'reporte-condicion');
  const key = uuidv7();
  const send = () =>
    scenario.post('/v1/sst/me/reports', f.worker.session, CONDITION).set('Idempotency-Key', key);
  const first = await send();
  expect(first.status, first.text).toBe(201);
  const report = quickReportResponseSchema.parse(first.body);
  expect(report).toMatchObject({ goes_to: 'unsafe_report' });
  expect(report.code).toMatch(/^RPT-\d{4}-\d{4}$/u);
  expect(quickReportResponseSchema.parse((await send()).body).id).toBe(report.id);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  expect(mine.reports).toEqual([expect.objectContaining({ id: report.id, status: 'Reportado' })]);
  const notice = await scenario.inTenant((tx) =>
    tx.outboxEvent.findFirstOrThrow({
      where: {
        eventType: 'sst.report.received',
        payload: { path: ['report_id'], equals: report.id },
      },
    }),
  );
  const { recipients } = z.object({ recipients: z.array(z.string()) }).parse(notice.payload);
  expect(recipients).toContain(f.sst.id);
});

it('un accidente queda con su plazo para la ARL y SST recibe la alerta', async () => {
  const f = await sstFixture(scenario, 'reporte-accidente');
  const id = await quickReport(scenario, f.worker, ACCIDENT);
  const row = await scenario.inTenant((tx) => tx.sstIncident.findFirstOrThrow({ where: { id } }));
  const due = await scenario.inTenant((tx) => businessDeadline(tx, today(scenario), 2));
  expect(row.arlDueOn?.toISOString().slice(0, 10)).toBe(due);
  expect(row.affectedEmployeeId).toBe(f.workerEmployeeId);
  expect(row.code).toMatch(/^SST-\d{4}-\d{4}$/u);
  const alert = await scenario.inTenant((tx) =>
    tx.outboxEvent.count({
      where: { eventType: 'sst.arl.due', payload: { path: ['incident_id'], equals: id } },
    }),
  );
  expect(alert).toBe(1);
  const later = new Date(scenario.clock.now().getTime() + 3 * 24 * 60 * 60 * 1000);
  const run = await runSstDailyWork({ database: scenario.db, clock: { now: () => later } });
  expect(run.arlReminders).toBeGreaterThanOrEqual(1);
  const report = { reported_on: today(scenario), filing_number: 'FURAT-2026-77' };
  const future = { ...report, reported_on: addDays(today(scenario), 1) };
  const path = `/v1/sst/incidents/${id}/actions/report-arl`;
  expect((await at(scenario, path, f.sst, 1, future)).status).toBe(422);
  expect((await at(scenario, path, f.worker, 1, report)).status).toBe(403);
  expect((await at(scenario, path, f.sst, 1, report)).status).toBe(204);
  expect((await at(scenario, path, f.sst, 2, report)).status).toBe(409);
});

it('sigue investigación, plan y cierre en orden, con las acciones hechas', async () => {
  const f = await sstFixture(scenario, 'investigacion');
  const { id, actionId } = await plannedIncident(scenario, f);
  const close = { conclusion: 'Se aseguraron todos los soportes de monitores.' };
  expect(
    (await at(scenario, `/v1/sst/incidents/${id}/actions/close`, f.sst, 3, close)).status,
  ).toBe(409);
  const done = { done_on: today(scenario), note: 'Listo' };
  const actionPath = `/v1/sst/investigation-actions/${actionId}/actions/complete`;
  expect((await at(scenario, actionPath, f.peer, 1, done)).status).toBe(404);
  const mine = mySstSchema.parse((await scenario.get('/v1/sst/me', f.worker.session)).body);
  expect(mine.actions.map((action) => action.id)).toEqual([actionId]);
  expect((await at(scenario, actionPath, f.worker, 1, done)).status).toBe(204);
  expect(
    (await at(scenario, `/v1/sst/incidents/${id}/actions/close`, f.worker, 3, close)).status,
  ).toBe(403);
  expect(
    (await at(scenario, `/v1/sst/incidents/${id}/actions/close`, f.sst, 3, close)).status,
  ).toBe(204);
  const detail = sstIncidentDetailSchema.parse(
    (await scenario.get(`/v1/sst/incidents/${id}`, f.hr.session)).body,
  );
  expect(detail).toMatchObject({ status: 'closed', conclusion: close.conclusion });
  expect(detail.actions[0]).toMatchObject({ done_on: today(scenario), note: 'Listo' });
});

it('un accidente sin reporte a la ARL no se cierra', async () => {
  const f = await sstFixture(scenario, 'accidente-sin-arl');
  const id = await quickReport(scenario, f.worker, ACCIDENT);
  await at(scenario, `/v1/sst/incidents/${id}/actions/investigate`, f.sst, 1, { team: 'SST' });
  const plan = {
    immediate_causes: 'Piso mojado sin aviso.',
    root_causes: 'Falta protocolo de aseo.',
    actions: [{ description: 'Comprar avisos', responsible_id: f.sst.id, due_on: today(scenario) }],
  };
  expect((await at(scenario, `/v1/sst/incidents/${id}/actions/plan`, f.sst, 2, plan)).status).toBe(
    204,
  );
  const action = await scenario.inTenant((tx) =>
    tx.sstInvestigationAction.findFirstOrThrow({ where: { investigation: { incidentId: id } } }),
  );
  const done = { done_on: today(scenario), note: null };
  await at(scenario, `/v1/sst/investigation-actions/${action.id}/actions/complete`, f.sst, 1, done);
  const close = { conclusion: 'Se señalizan los pisos mojados.' };
  const response = await at(scenario, `/v1/sst/incidents/${id}/actions/close`, f.sst, 3, close);
  expect(response.status).toBe(409);
  expect(response.text).toContain('ARL');
});

it('sin permiso de lectura no se ven los incidentes y otra empresa no los ve', async () => {
  const f = await sstFixture(scenario, 'incidentes-acceso');
  const id = await quickReport(scenario, f.worker, ACCIDENT);
  expect((await scenario.get('/v1/sst/incidents', f.worker.session)).status).toBe(403);
  expect((await scenario.get('/v1/sst/unsafe-reports', f.boss.session)).status).toBe(403);
  const list = sstIncidentListResponseSchema.parse(
    (await scenario.get('/v1/sst/incidents', f.hr.session)).body,
  );
  expect(list.data.map((incident) => incident.id)).toContain(id);
  const stranger = await scenario.person('sst-ajeno', ['SST'], {
    tenantId: scenario.otherTenant.id,
  });
  expect((await scenario.get('/v1/sst/incidents', stranger.session)).body).toEqual({ data: [] });
  expect((await scenario.get(`/v1/sst/incidents/${id}`, stranger.session)).status).toBe(404);
  const attend = { status: 'closed', response: 'Atendido' };
  const report = await quickReport(scenario, f.worker, CONDITION);
  expect(
    (await at(scenario, `/v1/sst/unsafe-reports/${report}/actions/attend`, stranger, 1, attend))
      .status,
  ).toBe(404);
});
